import re
from urllib.parse import quote

def generate_canonical_qr_url(slug: str, table_number_or_clean: str, table_id: str = "") -> str:
    """
    ONE Canonical Dinely QR URL Generator for all backend modules:
    - Restaurant creation & initial table seeding
    - Table provisioning & manual table creation
    - Admin table provisioning
    - QR downloads and API responses

    Preferred Machine-Safe Format:
    https://<slug>.dinely.food/customer?table=01&tableId=<id>
    Strictly zero spaces, machine-safe 2-digit zero-padded table number.
    """
    clean_slug = (slug or "venue").strip().lower()
    t_str = str(table_number_or_clean or "").strip()
    digits = re.findall(r"\d+", t_str)
    if digits:
        clean_num = digits[-1].zfill(2)
    elif t_str.upper() in ("COUNTER", "PICKUP", "BAR"):
        clean_num = t_str.upper()
    else:
        clean_num = re.sub(r"\s+", "_", t_str) or "01"

    url = f"https://{clean_slug}.dinely.food/customer?table={quote(clean_num)}"
    if table_id:
        clean_tid = str(table_id).strip()
        if clean_tid:
            url += f"&tableId={quote(clean_tid)}"
    return url
