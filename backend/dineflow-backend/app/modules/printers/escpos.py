from __future__ import annotations
import io
import socket
import base64
from typing import Dict, Any, List, Optional, TYPE_CHECKING
import qrcode
from PIL import Image

if TYPE_CHECKING:
    from app.modules.orders.models import Bill
    from app.modules.restaurants.models import Restaurant


class ThermalPaperWidth:
    WIDTH_58MM = "58mm"
    WIDTH_80MM = "80mm"


class EscPosBuilder:
    """
    Standard ESC/POS thermal command builder for 58mm (32 columns) and 80mm (48 columns) roll paper.
    Supports bold, font sizing, alignment, table justification, native QR code encoding,
    raster bit-image printing, and full/partial paper cuts.
    """

    # Commands
    ESC = b'\x1b'
    GS = b'\x1d'
    FS = b'\x1c'

    INIT = ESC + b'@'
    ALIGN_LEFT = ESC + b'a\x00'
    ALIGN_CENTER = ESC + b'a\x01'
    ALIGN_RIGHT = ESC + b'a\x02'

    BOLD_ON = ESC + b'E\x01'
    BOLD_OFF = ESC + b'E\x00'

    DOUBLE_HEIGHT_ON = ESC + b'!\x10'
    DOUBLE_WIDTH_ON = ESC + b'!\x20'
    DOUBLE_SIZE_ON = ESC + b'!\x30'
    NORMAL_SIZE = ESC + b'!\x00'

    UNDERLINE_ON = ESC + b'-\x01'
    UNDERLINE_OFF = ESC + b'-\x00'

    CUT_FULL = GS + b'V\x00'
    CUT_PARTIAL = GS + b'V\x01'
    FEED_AND_CUT = GS + b'V\x42\x00'  # Feed 0 lines and cut

    def __init__(self, paper_width: str = "80mm"):
        self.paper_width = "58mm" if "58" in str(paper_width) else "80mm"
        self.cols = 32 if self.paper_width == "58mm" else 48
        self.buffer = bytearray()
        self.buffer.extend(self.INIT)

    def init(self) -> 'EscPosBuilder':
        self.buffer.extend(self.INIT)
        return self

    def text(self, text_str: str) -> 'EscPosBuilder':
        # Replace non-ascii chars safely for standard thermal printer code pages
        clean_text = text_str.replace("₹", "Rs.").encode('latin-1', errors='replace')
        self.buffer.extend(clean_text)
        return self

    def text_ln(self, text_str: str = "") -> 'EscPosBuilder':
        self.text(text_str)
        self.buffer.extend(b'\n')
        return self

    def center(self) -> 'EscPosBuilder':
        self.buffer.extend(self.ALIGN_CENTER)
        return self

    def left(self) -> 'EscPosBuilder':
        self.buffer.extend(self.ALIGN_LEFT)
        return self

    def right(self) -> 'EscPosBuilder':
        self.buffer.extend(self.ALIGN_RIGHT)
        return self

    def bold(self, enable: bool = True) -> 'EscPosBuilder':
        self.buffer.extend(self.BOLD_ON if enable else self.BOLD_OFF)
        return self

    def size_double(self) -> 'EscPosBuilder':
        self.buffer.extend(self.DOUBLE_SIZE_ON)
        return self

    def size_normal(self) -> 'EscPosBuilder':
        self.buffer.extend(self.NORMAL_SIZE)
        return self

    def divider(self, char: str = "-") -> 'EscPosBuilder':
        self.left()
        self.text_ln(char * self.cols)
        return self

    def double_divider(self) -> 'EscPosBuilder':
        return self.divider("=")

    def line_justify(self, left_str: str, right_str: str) -> 'EscPosBuilder':
        left_str = left_str.replace("₹", "Rs.")
        right_str = right_str.replace("₹", "Rs.")
        space_len = max(1, self.cols - len(left_str) - len(right_str))
        line = left_str + (" " * space_len) + right_str
        self.left()
        self.text_ln(line[:self.cols])
        return self

    def table_row_3(self, col1: str, col2: str, col3: str) -> 'EscPosBuilder':
        # Col1: Item Name, Col2: Qty, Col3: Amount
        col1 = col1.replace("₹", "Rs.")
        col2 = col2.replace("₹", "Rs.")
        col3 = col3.replace("₹", "Rs.")

        if self.cols == 32:
            # 58mm: 16 chars item | 5 chars qty | 11 chars amount
            c1_w, c2_w, c3_w = 16, 5, 11
        else:
            # 80mm: 28 chars item | 6 chars qty | 14 chars amount
            c1_w, c2_w, c3_w = 28, 6, 14

        c1 = col1[:c1_w].ljust(c1_w)
        c2 = col2.center(c2_w)
        c3 = col3.rjust(c3_w)
        self.left()
        self.text_ln(f"{c1}{c2}{c3}"[:self.cols])
        return self

    def qr_code(self, data: str, module_size: int = 6) -> 'EscPosBuilder':
        """
        Encodes QR Code using Model 2 native ESC/POS commands (GS ( k).
        """
        self.center()
        data_bytes = data.encode('utf-8')
        data_len = len(data_bytes) + 3

        # 1. Set QR Code Model (Model 2)
        self.buffer.extend(self.GS + b'(k\x04\x001A2\x00')

        # 2. Set Module Size
        m_size = min(max(module_size, 3), 8)
        self.buffer.extend(self.GS + b'(k\x03\x001C' + bytes([m_size]))

        # 3. Set Error Correction Level (Level M = 49)
        self.buffer.extend(self.GS + b'(k\x03\x001E1')

        # 4. Store Data in QR Buffer
        pL = data_len % 256
        pH = data_len // 256
        self.buffer.extend(self.GS + b'(k' + bytes([pL, pH]) + b'1P0' + data_bytes)

        # 5. Print QR Code
        self.buffer.extend(self.GS + b'(k\x03\x001Q0')
        self.feed(1)
        return self

    def feed(self, lines: int = 1) -> 'EscPosBuilder':
        for _ in range(lines):
            self.buffer.extend(b'\n')
        return self

    def cut(self) -> 'EscPosBuilder':
        self.feed(3)
        self.buffer.extend(self.FEED_AND_CUT)
        return self

    def build_bytes(self) -> bytes:
        return bytes(self.buffer)

    def get_bytes(self) -> bytes:
        return self.build_bytes()

    def text_line(self, text_str: str = "", align: Optional[str] = None) -> 'EscPosBuilder':
        if align == "center":
            self.center()
        elif align == "right":
            self.right()
        elif align == "left":
            self.left()
        self.text_ln(text_str)
        return self

    def two_column(self, left_str: str, right_str: str) -> 'EscPosBuilder':
        return self.line_justify(left_str, right_str)

    def to_base64(self) -> str:
        return base64.b64encode(self.build_bytes()).decode('utf-8')


def format_escpos_bill_receipt(
    bill: Bill,
    restaurant: Restaurant,
    paper_width: str = "80mm",
    copy_label: Optional[str] = None
) -> bytes:
    """
    Generates authentic, high-contrast ESC/POS binary receipt for a Bill.
    Includes itemized breakdown, taxes, round-off, total payable, and Dynamic UPI QR.
    """
    builder = EscPosBuilder(paper_width=paper_width)

    # 1. Top Brand Header
    builder.center()
    builder.bold(True).size_double()
    builder.text_ln(restaurant.legal_name or restaurant.name or "DINEFLOW POS")
    builder.size_normal().bold(False)

    if restaurant.address:
        builder.text_ln(restaurant.address)
    if restaurant.phone:
        builder.text_ln(f"Ph: {restaurant.phone}")

    gst_pan_line = []
    if restaurant.gstin:
        gst_pan_line.append(f"GSTIN: {restaurant.gstin}")
    if restaurant.pan:
        gst_pan_line.append(f"PAN: {restaurant.pan}")
    if gst_pan_line:
        builder.text_ln(" | ".join(gst_pan_line))

    builder.double_divider()

    # 2. Receipt Subtitle & Copy Type
    builder.center().bold(True)
    if copy_label:
        builder.text_ln(f"TAX INVOICE [{copy_label.upper()}]")
    else:
        builder.text_ln("TAX INVOICE")
    builder.bold(False)

    # 3. Invoice Metadata
    inv_num = bill.invoice_number or bill.id
    created_dt = bill.created_at.strftime("%d-%b-%Y %I:%M %p") if bill.created_at else ""
    builder.line_justify(f"Invoice: {inv_num}", f"Table: {bill.table_number}")
    builder.line_justify(f"Date: {created_dt}", f"Session: #{str(bill.table_session_id or '')[-4:]}")

    builder.divider()

    # 4. Itemized Order Lines Table
    builder.bold(True)
    builder.table_row_3("ITEM", "QTY", "AMOUNT")
    builder.bold(False)
    builder.divider()

    items = getattr(bill, "items_snapshot_json", []) or []
    for item in items:
        name = str(item.get("name") or "Item")
        qty = str(item.get("quantity") or 1)
        tot = f"{float(item.get('totalPrice') or item.get('total_price') or 0.0):.2f}"
        builder.table_row_3(name, qty, tot)

    builder.divider()

    # 5. Financial Summary
    builder.line_justify("Subtotal:", f"Rs. {bill.subtotal:.2f}")

    if bill.discount_amount and bill.discount_amount > 0:
        disc_label = f"Discount ({bill.discount_percentage:g}%):" if bill.discount_percentage else "Discount:"
        builder.line_justify(disc_label, f"-Rs. {bill.discount_amount:.2f}")

    if bill.service_charge_amount and bill.service_charge_amount > 0:
        builder.line_justify(f"Service Charge ({bill.service_charge_percentage:g}%):", f"Rs. {bill.service_charge_amount:.2f}")

    # Tax Breakdown
    tax_breakdown = getattr(bill, "tax_breakdown_json", []) or []
    if tax_breakdown:
        for t in tax_breakdown:
            t_name = str(t.get("name") or "Tax")
            t_amt = float(t.get("amount") or 0.0)
            builder.line_justify(f"  {t_name}:", f"Rs. {t_amt:.2f}")
    elif bill.tax_amount and bill.tax_amount > 0:
        builder.line_justify(f"GST ({bill.tax_percentage:g}%):", f"Rs. {bill.tax_amount:.2f}")

    if bill.round_off_amount and bill.round_off_amount != 0.0:
        builder.line_justify("Round Off:", f"Rs. {bill.round_off_amount:.2f}")

    builder.double_divider()

    # 6. Grand Total (Bold Double Size)
    builder.center().bold(True).size_double()
    builder.text_ln(f"TOTAL: Rs.{bill.grand_total:.2f}")
    builder.size_normal().bold(False)

    builder.double_divider()

    # 7. Dynamic Bill-Specific UPI QR Code
    if bill.payment_status == "PAID":
        builder.center().bold(True)
        builder.text_ln("PAID & VERIFIED [OK]")
        builder.text_ln(f"Method: {(bill.payment_method or 'UPI').upper()}")
        if bill.payment_reference:
            builder.text_ln(f"Ref: {bill.payment_reference}")
        builder.bold(False)
    else:
        qr_uri = bill.payment_qr_payload
        if not qr_uri:
            # Deterministic UPI Intent fallback
            upi_id = getattr(restaurant, "upi_id", None) or "dinely.pos@icici"
            name_safe = urllib.parse.quote(restaurant.name or "Dinely")
            qr_uri = f"upi://pay?pa={upi_id}&pn={name_safe}&am={bill.grand_total:.2f}&cu=INR&tr={bill.id}&tn=Bill_{bill.invoice_number or bill.id}"

        builder.center().bold(True)
        builder.text_ln("SCAN TO PAY WITH ANY UPI APP")
        builder.text_ln("GPay | PhonePe | Paytm | BHIM")
        builder.bold(False)

        # Print QR Code
        builder.qr_code(qr_uri, module_size=6 if paper_width == "80mm" else 4)

        builder.center().bold(True)
        builder.text_ln(f"Pay Exact: Rs. {bill.grand_total:.2f}")
        builder.bold(False)
        builder.text_ln(f"Order Ref: #{str(bill.id)[-6:]}")

    builder.divider()

    # 8. Footer
    builder.center()
    builder.text_ln("Thank You! Visit Again")
    builder.text_ln("DineFlow Cloud POS -- dinely.food")
    builder.cut()

    return builder.build_bytes()


def format_escpos_test_receipt(
    restaurant: Restaurant,
    printer_name: str,
    paper_width: str = "80mm"
) -> bytes:
    """
    Generates a diagnostic test print ticket to verify ESC/POS alignment, paper cut, and QR scanning.
    """
    builder = EscPosBuilder(paper_width=paper_width)
    builder.center().bold(True).size_double()
    builder.text_ln(restaurant.name or "DINEFLOW POS")
    builder.size_normal().bold(False)

    builder.double_divider()
    builder.center().bold(True)
    builder.text_ln(f"THERMAL PRINTER TEST [{paper_width}]")
    builder.bold(False)
    builder.text_ln(f"Printer: {printer_name}")
    builder.text_ln("Hardware Link: ONLINE [OK]")
    builder.divider()

    builder.line_justify("Left Aligned", "Right Aligned")
    builder.table_row_3("Sample Dish", "x2", "Rs. 450.00")
    builder.divider()

    builder.center().bold(True)
    builder.text_ln("SAMPLE TEST UPI QR CODE")
    builder.bold(False)
    builder.qr_code("https://dinely.food", module_size=5)

    builder.center()
    builder.text_ln("Hardware Verification Successful")
    builder.cut()
    return builder.build_bytes()


def send_raw_escpos_to_network_printer(
    ip_address: str,
    port: int,
    raw_data: bytes,
    timeout_sec: float = 3.0
) -> Tuple[bool, str]:
    """
    Sends raw ESC/POS binary data to a Network/LAN thermal printer via direct TCP socket (port 9100).
    Non-blocking with strict timeout to avoid freezing threads.
    """
    if not ip_address:
        return False, "IP address is missing"
    try:
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            s.settimeout(timeout_sec)
            s.connect((ip_address.strip(), port or 9100))
            s.sendall(raw_data)
        return True, "SUCCESS"
    except socket.timeout:
        return False, f"Connection to thermal printer at {ip_address}:{port} timed out ({timeout_sec}s)"
    except ConnectionRefusedError:
        return False, f"Printer connection refused at {ip_address}:{port} - is printer turned on and port 9100 open?"
    except Exception as e:
        return False, f"Network print failed: {str(e)}"
