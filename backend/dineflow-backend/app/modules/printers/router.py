from typing import Optional, List, Dict, Any
from fastapi import APIRouter, Depends, HTTPException, status, Body
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database.connection import get_db
from app.core.security.tenant_auth import require_tenant_staff_or_owner, require_tenant_owner_or_admin, CallerContext
from app.modules.printers.service import PrinterService
from app.modules.printers.models import RestaurantPrinter


router = APIRouter()


class PrinterCreateSchema(BaseModel):
    name: str = Field(..., min_length=2, max_length=100)
    connectionType: str = Field(default="BROWSER")  # BROWSER | NETWORK_LAN | USB_BRIDGE | BLUETOOTH
    ipAddress: Optional[str] = None
    port: Optional[int] = 9100
    bridgeUrl: Optional[str] = None
    paperWidth: str = Field(default="80mm")  # 58mm | 80mm
    isDefault: Optional[bool] = False
    autoPrintOnBill: Optional[bool] = False
    copies: Optional[int] = 1


class PrinterUpdateSchema(BaseModel):
    name: Optional[str] = None
    connectionType: Optional[str] = None
    ipAddress: Optional[str] = None
    port: Optional[int] = None
    bridgeUrl: Optional[str] = None
    paperWidth: Optional[str] = None
    isDefault: Optional[bool] = None
    autoPrintOnBill: Optional[bool] = None
    copies: Optional[int] = None
    status: Optional[str] = None


class PrintJobSchema(BaseModel):
    printerId: Optional[str] = None
    copies: Optional[int] = 1


def format_printer_response(p: RestaurantPrinter) -> dict:
    return {
        "id": p.id,
        "restaurantId": p.restaurant_id,
        "name": p.name,
        "connectionType": p.connection_type,
        "ipAddress": p.ip_address,
        "port": p.port,
        "bridgeUrl": p.bridge_url,
        "paperWidth": p.paper_width,
        "isDefault": p.is_default,
        "autoPrintOnBill": p.auto_print_on_bill,
        "copies": p.copies,
        "isActive": p.is_active,
        "status": p.status,
        "lastTestPrintedAt": p.last_test_printed_at.isoformat() if p.last_test_printed_at else None,
        "lastErrorMessage": p.last_error_message,
        "createdAt": p.created_at.isoformat() if p.created_at else None,
        "updatedAt": p.updated_at.isoformat() if p.updated_at else None,
    }


@router.get("/{restaurant_id}/printers")
async def list_printers(
    restaurant_id: str,
    caller: CallerContext = Depends(require_tenant_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    """
    List all configured thermal receipt printers for a restaurant.
    """
    printers = await PrinterService.get_printers(restaurant_id, db)
    return [format_printer_response(p) for p in printers]


@router.post("/{restaurant_id}/printers", status_code=status.HTTP_201_CREATED)
async def create_printer(
    restaurant_id: str,
    payload: PrinterCreateSchema,
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Add a new thermal printer configuration (Network LAN, USB Bridge, Bluetooth, or Browser).
    """
    printer = await PrinterService.create_printer(
        restaurant_id=restaurant_id,
        name=payload.name,
        connection_type=payload.connectionType,
        paper_width=payload.paperWidth,
        ip_address=payload.ipAddress,
        port=payload.port or 9100,
        bridge_url=payload.bridgeUrl,
        is_default=bool(payload.isDefault),
        auto_print_on_bill=bool(payload.autoPrintOnBill),
        copies=payload.copies or 1,
        db=db
    )
    return format_printer_response(printer)


@router.put("/{restaurant_id}/printers/{printer_id}")
async def update_printer(
    restaurant_id: str,
    printer_id: str,
    payload: PrinterUpdateSchema,
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Update printer settings, IP address, paper width, or default assignment.
    """
    updates = {}
    if payload.name is not None: updates["name"] = payload.name
    if payload.connectionType is not None: updates["connection_type"] = payload.connectionType
    if payload.ipAddress is not None: updates["ip_address"] = payload.ipAddress
    if payload.port is not None: updates["port"] = payload.port
    if payload.bridgeUrl is not None: updates["bridge_url"] = payload.bridgeUrl
    if payload.paperWidth is not None: updates["paper_width"] = payload.paperWidth
    if payload.isDefault is not None: updates["is_default"] = payload.isDefault
    if payload.autoPrintOnBill is not None: updates["auto_print_on_bill"] = payload.autoPrintOnBill
    if payload.copies is not None: updates["copies"] = payload.copies
    if payload.status is not None: updates["status"] = payload.status

    updated = await PrinterService.update_printer(printer_id, restaurant_id, updates, db)
    if not updated:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Printer not found")
    return format_printer_response(updated)


@router.delete("/{restaurant_id}/printers/{printer_id}")
async def delete_printer(
    restaurant_id: str,
    printer_id: str,
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    """
    Deactivate a printer configuration.
    """
    success = await PrinterService.delete_printer(printer_id, restaurant_id, db)
    if not success:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Printer not found")
    return {"status": "success", "message": "Printer deactivated"}


@router.post("/{restaurant_id}/printers/{printer_id}/test-print")
async def test_print(
    restaurant_id: str,
    printer_id: str,
    caller: CallerContext = Depends(require_tenant_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    """
    Execute a test receipt print on a physical thermal printer or generate payload.
    """
    res = await PrinterService.execute_test_print(printer_id, restaurant_id, db)
    if not res.get("success"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY if "timed out" in res.get("message", "") else status.HTTP_400_BAD_REQUEST,
            detail=res.get("message") or res.get("error")
        )
    return res


@router.post("/{restaurant_id}/printers/print-bill/{bill_id}")
@router.post("/{restaurant_id}/billing/{bill_id}/print")
async def print_bill(
    restaurant_id: str,
    bill_id: str,
    payload: Optional[PrintJobSchema] = Body(default=None),
    caller: CallerContext = Depends(require_tenant_staff_or_owner),
    db: AsyncSession = Depends(get_db)
):
    """
    Dispatches a bill print job to the designated or default thermal printer.
    """
    printer_id = payload.printerId if payload else None
    copies = payload.copies if payload else 1
    res = await PrinterService.print_bill_invoice(
        bill_id=bill_id,
        restaurant_id=restaurant_id,
        printer_id=printer_id,
        copies=copies,
        db=db
    )
    if not res.get("success"):
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY if "timed out" in res.get("message", "") else status.HTTP_400_BAD_REQUEST,
            detail=res.get("message") or res.get("error")
        )
    return res
