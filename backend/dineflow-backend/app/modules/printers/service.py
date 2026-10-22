import uuid
import base64
from datetime import datetime, timezone
from typing import List, Optional, Dict, Any, Tuple

from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, update, delete

from app.modules.restaurants.models import Restaurant
from app.modules.orders.models import Bill
from app.modules.printers.models import RestaurantPrinter
from app.modules.printers.escpos import (
    format_escpos_bill_receipt,
    format_escpos_test_receipt,
    send_raw_escpos_to_network_printer
)


class PrinterService:
    """
    Thermal Printer Hardware Management and Job Dispatcher.
    Coordinates Network LAN printing, USB Bridge payloads, and Web Fallbacks.
    """

    @staticmethod
    async def get_printers(restaurant_id: str, db: AsyncSession) -> List[RestaurantPrinter]:
        stmt = select(RestaurantPrinter).where(
            RestaurantPrinter.restaurant_id == restaurant_id,
            RestaurantPrinter.is_active == True
        ).order_by(RestaurantPrinter.is_default.desc(), RestaurantPrinter.created_at.asc())
        res = await db.execute(stmt)
        return list(res.scalars().all())

    @staticmethod
    async def get_printer_by_id(printer_id: str, restaurant_id: str, db: AsyncSession) -> Optional[RestaurantPrinter]:
        stmt = select(RestaurantPrinter).where(
            RestaurantPrinter.id == printer_id,
            RestaurantPrinter.restaurant_id == restaurant_id
        )
        res = await db.execute(stmt)
        return res.scalar_one_or_none()

    @staticmethod
    async def get_default_printer(restaurant_id: str, db: AsyncSession) -> Optional[RestaurantPrinter]:
        stmt = select(RestaurantPrinter).where(
            RestaurantPrinter.restaurant_id == restaurant_id,
            RestaurantPrinter.is_active == True,
            RestaurantPrinter.is_default == True
        ).limit(1)
        res = await db.execute(stmt)
        default_p = res.scalar_one_or_none()
        if default_p:
            return default_p
        fallback_stmt = select(RestaurantPrinter).where(
            RestaurantPrinter.restaurant_id == restaurant_id,
            RestaurantPrinter.is_active == True
        ).order_by(RestaurantPrinter.created_at.asc()).limit(1)
        fb_res = await db.execute(fallback_stmt)
        return fb_res.scalar_one_or_none()

    @staticmethod
    async def create_printer(
        restaurant_id: str,
        name: str,
        connection_type: str,
        paper_width: str,
        ip_address: Optional[str] = None,
        port: int = 9100,
        bridge_url: Optional[str] = None,
        is_default: bool = False,
        auto_print_on_bill: bool = False,
        copies: int = 1,
        db: AsyncSession = None
    ) -> RestaurantPrinter:
        clean_name = (name or "Thermal Printer").strip()
        clean_conn = (connection_type or "BROWSER").upper()
        clean_width = "58mm" if "58" in str(paper_width) else "80mm"

        # If this printer is default, reset other default printers for this restaurant
        if is_default:
            await db.execute(
                update(RestaurantPrinter)
                .where(RestaurantPrinter.restaurant_id == restaurant_id)
                .values(is_default=False)
            )

        printer_id = f"ptr-{uuid.uuid4().hex[:10]}"
        printer = RestaurantPrinter(
            id=printer_id,
            restaurant_id=restaurant_id,
            name=clean_name,
            connection_type=clean_conn,
            ip_address=ip_address.strip() if ip_address else None,
            port=port or 9100,
            bridge_url=bridge_url.strip() if bridge_url else None,
            paper_width=clean_width,
            is_default=is_default,
            auto_print_on_bill=auto_print_on_bill,
            copies=max(1, int(copies or 1)),
            is_active=True,
            status="ONLINE",
        )
        db.add(printer)
        await db.commit()
        await db.refresh(printer)
        return printer

    @staticmethod
    async def update_printer(
        printer_id: str,
        restaurant_id: str,
        updates: Dict[str, Any],
        db: AsyncSession
    ) -> Optional[RestaurantPrinter]:
        stmt = select(RestaurantPrinter).where(
            RestaurantPrinter.id == printer_id,
            RestaurantPrinter.restaurant_id == restaurant_id
        )
        res = await db.execute(stmt)
        printer = res.scalar_one_or_none()
        if not printer:
            return None

        if updates.get("is_default") is True:
            await db.execute(
                update(RestaurantPrinter)
                .where(RestaurantPrinter.restaurant_id == restaurant_id)
                .values(is_default=False)
            )

        for field in [
            "name", "connection_type", "ip_address", "port",
            "bridge_url", "paper_width", "is_default",
            "auto_print_on_bill", "copies", "is_active", "status"
        ]:
            if field in updates:
                val = updates[field]
                if field == "connection_type" and val:
                    val = str(val).upper()
                if field == "paper_width" and val:
                    val = "58mm" if "58" in str(val) else "80mm"
                setattr(printer, field, val)

        printer.updated_at = datetime.now(timezone.utc)
        await db.commit()
        await db.refresh(printer)
        return printer

    @staticmethod
    async def delete_printer(printer_id: str, restaurant_id: str, db: AsyncSession) -> bool:
        stmt = select(RestaurantPrinter).where(
            RestaurantPrinter.id == printer_id,
            RestaurantPrinter.restaurant_id == restaurant_id
        )
        res = await db.execute(stmt)
        printer = res.scalar_one_or_none()
        if not printer:
            return False

        printer.is_active = False
        await db.commit()
        return True

    @classmethod
    async def execute_test_print(
        cls,
        printer_id: str,
        restaurant_id: str,
        db: AsyncSession
    ) -> Dict[str, Any]:
        """
        Executes a diagnostic test print on the specified printer.
        """
        printer = await cls.get_printer_by_id(printer_id, restaurant_id, db)
        if not printer:
            return {"success": False, "error": "Printer not found"}

        from app.modules.restaurants.models import Restaurant
        rest_stmt = select(Restaurant).where(Restaurant.id == restaurant_id)
        rest_res = await db.execute(rest_stmt)
        rest = rest_res.scalar_one_or_none()
        if not rest:
            return {"success": False, "error": "Restaurant not found"}

        raw_bytes = format_escpos_test_receipt(
            restaurant=rest,
            printer_name=printer.name,
            paper_width=printer.paper_width
        )
        b64_payload = base64.b64encode(raw_bytes).decode('utf-8')

        now = datetime.now(timezone.utc)
        printer.last_test_printed_at = now

        # Network LAN execution
        if printer.connection_type == "NETWORK_LAN" and printer.ip_address:
            success, msg = send_raw_escpos_to_network_printer(
                ip_address=printer.ip_address,
                port=printer.port,
                raw_data=raw_bytes
            )
            printer.status = "ONLINE" if success else "ERROR"
            printer.last_error_message = None if success else msg
            await db.commit()
            return {
                "success": success,
                "message": "Sent to LAN thermal printer" if success else msg,
                "escposBase64": b64_payload,
                "connectionType": printer.connection_type,
            }

        # Browser, USB Bridge, or Bluetooth return payload for client runner
        printer.status = "ONLINE"
        printer.last_error_message = None
        await db.commit()
        return {
            "success": True,
            "message": f"Generated {printer.paper_width} test receipt",
            "escposBase64": b64_payload,
            "connectionType": printer.connection_type,
            "paperWidth": printer.paper_width,
            "bridgeUrl": printer.bridge_url,
        }

    @classmethod
    async def print_bill_invoice(
        cls,
        bill_id: str,
        restaurant_id: str,
        printer_id: Optional[str] = None,
        copies: Optional[int] = None,
        db: AsyncSession = None
    ) -> Dict[str, Any]:
        """
        Formats and dispatches a bill print job to the designated or default thermal printer.
        Increments bill.print_count and records last_printed_at.
        """
        # 1. Fetch Bill & Restaurant
        b_stmt = select(Bill).where(Bill.id == bill_id, Bill.restaurant_id == restaurant_id)
        b_res = await db.execute(b_stmt)
        bill = b_res.scalar_one_or_none()
        if not bill:
            return {"success": False, "error": "Bill not found"}

        from app.modules.restaurants.models import Restaurant
        rest_stmt = select(Restaurant).where(Restaurant.id == restaurant_id)
        rest_res = await db.execute(rest_stmt)
        rest = rest_res.scalar_one_or_none()
        if not rest:
            return {"success": False, "error": "Restaurant not found"}

        # 2. Resolve Printer
        printer: Optional[RestaurantPrinter] = None
        if printer_id:
            printer = await cls.get_printer_by_id(printer_id, restaurant_id, db)

        if not printer:
            # Fallback to default printer or first active printer
            printers = await cls.get_printers(restaurant_id, db)
            printer = next((p for p in printers if p.is_default), printers[0] if printers else None)

        paper_width = printer.paper_width if printer else "80mm"
        conn_type = printer.connection_type if printer else "BROWSER"
        total_copies = copies or (printer.copies if printer else 1) or 1

        # 3. Format ESC/POS Receipt
        customer_copy_bytes = format_escpos_bill_receipt(
            bill=bill,
            restaurant=rest,
            paper_width=paper_width,
            copy_label="CUSTOMER COPY" if total_copies > 1 else None
        )

        all_bytes = bytearray(customer_copy_bytes)
        if total_copies > 1:
            merchant_copy_bytes = format_escpos_bill_receipt(
                bill=bill,
                restaurant=rest,
                paper_width=paper_width,
                copy_label="MERCHANT DUPLICATE"
            )
            all_bytes.extend(merchant_copy_bytes)

        raw_data = bytes(all_bytes)
        b64_payload = base64.b64encode(raw_data).decode('utf-8')

        # 4. Dispatch Job
        network_result = None
        now = datetime.now(timezone.utc)
        if printer and printer.connection_type == "NETWORK_LAN" and printer.ip_address:
            success, msg = send_raw_escpos_to_network_printer(
                ip_address=printer.ip_address,
                port=printer.port,
                raw_data=raw_data
            )
            network_result = {"success": success, "message": msg}
            if not success:
                printer.last_error_message = msg
                printer.status = "ERROR"
            else:
                printer.last_error_message = None
                printer.status = "ONLINE"

        # 5. Track Print on Bill
        bill.print_count = (bill.print_count or 0) + 1
        bill.last_printed_at = now
        bill.printer_id = printer.id if printer else None

        await db.commit()
        await db.refresh(bill)

        return {
            "success": True if not network_result else network_result["success"],
            "message": network_result["message"] if network_result else "Print job prepared",
            "billId": bill.id,
            "invoiceNumber": bill.invoice_number,
            "printCount": bill.print_count,
            "lastPrintedAt": bill.last_printed_at.isoformat(),
            "printer": {
                "id": printer.id if printer else "browser-default",
                "name": printer.name if printer else "Browser Print Engine",
                "connectionType": conn_type,
                "paperWidth": paper_width,
                "bridgeUrl": printer.bridge_url if printer else None,
            },
            "copies": total_copies,
            "escposBase64": b64_payload,
            "receiptData": {
                "restaurantName": rest.legal_name or rest.name,
                "invoiceNumber": bill.invoice_number or bill.id,
                "tableNumber": bill.table_number,
                "createdAt": bill.created_at.isoformat() if bill.created_at else now.isoformat(),
                "items": getattr(bill, "items_snapshot_json", []) or [],
                "subtotal": bill.subtotal,
                "discountAmount": bill.discount_amount,
                "serviceChargeAmount": bill.service_charge_amount,
                "taxAmount": bill.tax_amount,
                "taxBreakdown": getattr(bill, "tax_breakdown_json", []) or [],
                "roundOffAmount": bill.round_off_amount,
                "grandTotal": bill.grand_total,
                "paymentStatus": bill.payment_status,
                "paymentMethod": bill.payment_method,
                "paymentQrPayload": bill.payment_qr_payload,
            }
        }
