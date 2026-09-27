import os
import qrcode
from PIL import Image, ImageDraw, ImageFont

PAYLOAD = "https://the-dunk-3.dinely.food/customer?table=01&tableId=tbl-rest-1788829828520-table_01"
ARTIFACT_DIR = r"C:\Users\AYAN\.gemini\antigravity-ide\brain\1d879668-1457-4d92-b4b3-f237b7105ca7"

os.makedirs(ARTIFACT_DIR, exist_ok=True)

# 1. Generate Clean High-Contrast PNG QR
qr = qrcode.QRCode(
    version=None,
    error_correction=qrcode.constants.ERROR_CORRECT_M,
    box_size=16,
    border=4,
)
qr.add_data(PAYLOAD)
qr.make(fit=True)

qr_img = qr.make_image(fill_color="#000000", back_color="#FFFFFF").convert("RGB")
qr_png_path = os.path.join(ARTIFACT_DIR, "qr_table_01.png")
qr_img.save(qr_png_path, "PNG")
print(f"Generated clean QR PNG at: {qr_png_path} (Size: {qr_img.size})")

# 2. Generate Restaurant Table Standee Placard (800x1100)
CARD_W, CARD_H = 800, 1100
card = Image.new("RGB", (CARD_W, CARD_H), color="#0F172A") # Deep slate luxury background
draw = ImageDraw.Draw(card)

# Decorative card border & accent
draw.rounded_rectangle([(30, 30), (CARD_W - 30, CARD_H - 30)], radius=32, outline="#334155", width=3)
draw.rounded_rectangle([(36, 36), (CARD_W - 36, CARD_H - 36)], radius=28, outline="#1E293B", width=2)

# Load fonts
try:
    font_brand = ImageFont.truetype("arial.ttf", 44)
    font_table = ImageFont.truetype("arialbd.ttf", 52)
    font_sub = ImageFont.truetype("arial.ttf", 26)
    font_url = ImageFont.truetype("arial.ttf", 20)
    font_foot = ImageFont.truetype("arial.ttf", 22)
except Exception:
    font_brand = ImageFont.load_default()
    font_table = ImageFont.load_default()
    font_sub = ImageFont.load_default()
    font_url = ImageFont.load_default()
    font_foot = ImageFont.load_default()

# Header: Restaurant Name
brand_text = "THE DUNK"
brand_bbox = draw.textbbox((0, 0), brand_text, font=font_brand)
brand_w = brand_bbox[2] - brand_bbox[0]
draw.text(((CARD_W - brand_w) / 2, 80), brand_text, fill="#F8FAFC", font=font_brand)

# Badge: Table 01
badge_text = "TABLE 01"
badge_bbox = draw.textbbox((0, 0), badge_text, font=font_table)
badge_w = badge_bbox[2] - badge_bbox[0]
badge_h = badge_bbox[3] - badge_bbox[1]
bx1 = (CARD_W - badge_w) / 2 - 40
by1 = 150
bx2 = (CARD_W + badge_w) / 2 + 40
by2 = by1 + badge_h + 30

draw.rounded_rectangle([(bx1, by1), (bx2, by2)], radius=16, fill="#E11D48") # Rose-600 luxury badge
draw.text(((CARD_W - badge_w) / 2, by1 + 15), badge_text, fill="#FFFFFF", font=font_table)

# Subtitle
sub_text = "Scan to View Live Menu & Order"
sub_bbox = draw.textbbox((0, 0), sub_text, font=font_sub)
sub_w = sub_bbox[2] - sub_bbox[0]
draw.text(((CARD_W - sub_w) / 2, 250), sub_text, fill="#94A3B8", font=font_sub)

# White QR Container Card
qr_box_size = 520
qbx1 = (CARD_W - qr_box_size) / 2
qby1 = 310
qbx2 = qbx1 + qr_box_size
qby2 = qby1 + qr_box_size

draw.rounded_rectangle([(qbx1, qby1), (qbx2, qby2)], radius=24, fill="#FFFFFF")

# Resize QR code to fit cleanly with quiet zone margin
qr_resized = qr_img.resize((460, 460), Image.Resampling.LANCZOS)
card.paste(qr_resized, (int(qbx1 + 30), int(qby1 + 30)))

# Encoded Hostname & Table
url_text = "the-dunk-3.dinely.food • Table 01"
url_bbox = draw.textbbox((0, 0), url_text, font=font_url)
url_w = url_bbox[2] - url_bbox[0]
draw.text(((CARD_W - url_w) / 2, 860), url_text, fill="#38BDF8", font=font_url)

# Footer
foot_text = "Powered by Dinely • Direct Table OS"
foot_bbox = draw.textbbox((0, 0), foot_text, font=font_foot)
foot_w = foot_bbox[2] - foot_bbox[0]
draw.text(((CARD_W - foot_w) / 2, 970), foot_text, fill="#64748B", font=font_foot)

standee_path = os.path.join(ARTIFACT_DIR, "qr_standee_table_01.png")
card.save(standee_path, "PNG")
print(f"Generated Standee Placard at: {standee_path} (Size: {card.size})")

# 3. Print ASCII QR Code safely
try:
    import sys
    qr_ascii = qrcode.QRCode()
    qr_ascii.add_data(PAYLOAD)
    sys.stdout.reconfigure(encoding='utf-8')
    print("\n--- ASCII SCAN PATTERN ---")
    qr_ascii.print_ascii(invert=True)
    print("--------------------------\n")
except Exception:
    pass
