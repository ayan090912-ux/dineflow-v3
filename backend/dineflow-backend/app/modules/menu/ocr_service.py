import io
import os
import re
import json
import base64
import urllib.request
from typing import List, Dict, Any, Optional
from PIL import Image, ImageOps, ImageEnhance


NON_VEG_HINTS = {
    "chicken", "chiken", "mutton", "lamb", "fish", "prawn", "prawns", "shrimp",
    "egg", "keema", "kheema", "murgh", "gosht", "meat", "beef", "pork", "bacon",
    "crab", "lobster", "salmon", "tuna", "duck", "turkey", "salami", "pepperoni"
}

BAR_HINTS = {
    "mojito", "cocktail", "mocktail", "shake", "smoothie", "latte", "cappuccino",
    "espresso", "iced tea", "lemonade", "soda", "cola", "beer", "whisky", "vodka",
    "gin", "rum", "wine", "margarita", "martini", "lassi", "juice", "cooler", "frappe"
}

HOOKAH_HINTS = {
    "hookah", "shisha", "sheesha", "paan ras", "double apple", "brain freezer", "chillam"
}

CATEGORY_HINTS = {
    "starter": "Starters & Appetizers",
    "appetizer": "Starters & Appetizers",
    "snack": "Starters & Appetizers",
    "chaat": "Starters & Appetizers",
    "soup": "Soups & Salads",
    "salad": "Soups & Salads",
    "tandoor": "Tandoor & Grills",
    "kebab": "Tandoor & Grills",
    "main": "Main Course",
    "curry": "Main Course",
    "gravy": "Main Course",
    "biryani": "Rice & Biryani",
    "rice": "Rice & Biryani",
    "pulao": "Rice & Biryani",
    "bread": "Breads & Naans",
    "naan": "Breads & Naans",
    "roti": "Breads & Naans",
    "chinese": "Chinese & Asian",
    "noodle": "Chinese & Asian",
    "pasta": "Pizza & Pasta",
    "pizza": "Pizza & Pasta",
    "burger": "Burgers & Sandwiches",
    "sandwich": "Burgers & Sandwiches",
    "beverage": "Beverages",
    "drink": "Beverages",
    "mocktail": "Mocktails",
    "cocktail": "Cocktails",
    "shake": "Shakes & Coolers",
    "coffee": "Coffee & Tea",
    "dessert": "Desserts & Sweets",
    "sweet": "Desserts & Sweets",
    "hookah": "Hookah & Shisha",
    "shisha": "Hookah & Shisha",
}


def _infer_station(name: str, category: str, default_mode: str = "FOOD") -> str:
    txt = f"{name} {category}".lower()
    if any(h in txt for h in HOOKAH_HINTS):
        return "HOOKAH"
    if any(h in txt for h in BAR_HINTS):
        return "BAR"
    return default_mode if default_mode in ("FOOD", "BAR", "HOOKAH") else "KITCHEN"


def _infer_is_veg(name: str, line: str) -> bool:
    txt = f"{name} {line}".lower()
    if any(re.search(rf"\b{re.escape(w)}\b", txt) for w in NON_VEG_HINTS):
        return False
    return True


def _detect_heading_category(line: str) -> Optional[str]:
    cleaned = re.sub(r"[^a-zA-Z0-9 &/-]", "", line).strip()
    if not cleaned or len(cleaned) > 42 or any(ch.isdigit() for ch in cleaned):
        return None
    low = cleaned.lower()
    for kw, mapped in CATEGORY_HINTS.items():
        if kw in low:
            return mapped
    if cleaned.isupper() and 3 <= len(cleaned) <= 28:
        return cleaned.title()
    return None


def parse_menu_text(raw_text: str, station_mode: str = "FOOD") -> List[Dict[str, Any]]:
    """
    Parses OCR or pasted menu text into structured menu items with name, price, category, and Veg/Non-Veg.
    """
    items: List[Dict[str, Any]] = []
    seen_names = set()
    default_cat = (
        "Hookah & Shisha" if station_mode == "HOOKAH"
        else "Cocktails & Beverages" if station_mode == "BAR"
        else "Main Course"
    )
    current_category = default_cat

    # Match trailing price like: "... 280", "₹ 280.00", "Rs.280/-", "280 /-"
    price_re = re.compile(
        r"(?:₹|rs\.?|inr)?\s*(\d{2,5}(?:\.\d{1,2})?)\s*(?:/-)?\s*$",
        re.IGNORECASE
    )

    for raw_line in (raw_text or "").splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if not line or len(line) < 3:
            continue

        # Check if this line is a section heading (no price)
        if not price_re.search(line):
            heading = _detect_heading_category(line)
            if heading:
                current_category = heading
            continue

        m = price_re.search(line)
        if not m:
            continue

        try:
            price_val = float(m.group(1))
        except ValueError:
            continue

        if price_val <= 0 or price_val > 50000:
            continue

        name_part = line[:m.start()].strip()
        # Strip dot leaders, dashes, pipes, bullets, and currency symbols at the end
        name_part = re.sub(r"[\.\-–—•|_~:]+$", "", name_part).strip()
        name_part = re.sub(r"^[•\-\*\d\.\)\s]+", "", name_part).strip()
        # Remove trailing (V)/(NV)/(Veg)/(Non-Veg) markers while remembering them
        is_veg = _infer_is_veg(name_part, line)
        if re.search(r"\b(non[- ]?veg|nv)\b", line, re.IGNORECASE):
            is_veg = False
        name_part = re.sub(r"\((?:veg|non[- ]?veg|v|nv)\)", "", name_part, flags=re.IGNORECASE).strip()

        if len(name_part) < 2 or name_part.isdigit():
            continue

        norm_key = name_part.lower()
        if norm_key in seen_names:
            continue
        seen_names.add(norm_key)

        dest = _infer_station(name_part, current_category, "KITCHEN" if station_mode == "FOOD" else station_mode)
        if dest == "FOOD":
            dest = "KITCHEN"

        items.append({
            "name": name_part[:80],
            "price": round(price_val, 2),
            "category": current_category,
            "isVegetarian": is_veg,
            "targetDestination": dest,
            "description": "",
        })

    return items


def _preprocess_for_ocr(image_bytes: bytes) -> Image.Image:
    img = Image.open(io.BytesIO(image_bytes))
    img = ImageOps.exif_transpose(img)
    img = img.convert("L")  # Grayscale
    w, h = img.size
    if max(w, h) < 1600:
        scale = 1600 / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
    img = ImageEnhance.Contrast(img).enhance(1.7)
    return img


def _try_gemini_vision(image_bytes: bytes, mime_type: str, station_mode: str) -> Optional[List[Dict[str, Any]]]:
    api_key = os.environ.get("GEMINI_API_KEY") or os.environ.get("GOOGLE_API_KEY")
    if not api_key:
        return None
    try:
        b64 = base64.b64encode(image_bytes).decode("utf-8")
        prompt = (
            "Extract all menu items from this restaurant menu image. "
            "Return ONLY a valid JSON array of objects with keys: "
            'name (string), price (number), category (string), isVegetarian (boolean), description (string). '
            f"Default station context: {station_mode}. If a price is missing, omit or use 0."
        )
        req_body = json.dumps({
            "contents": [{
                "parts": [
                    {"text": prompt},
                    {"inline_data": {"mime_type": mime_type or "image/jpeg", "data": b64}}
                ]
            }],
            "generationConfig": {"temperature": 0.1}
        }).encode("utf-8")
        url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
        req = urllib.request.Request(url, data=req_body, headers={"Content-Type": "application/json"}, method="POST")
        with urllib.request.urlopen(req, timeout=20) as resp:
            data = json.loads(resp.read().decode("utf-8"))
        text = data["candidates"][0]["content"]["parts"][0]["text"]
        text = re.sub(r"^```(?:json)?|```$", "", text.strip(), flags=re.MULTILINE).strip()
        parsed = json.loads(text)
        if isinstance(parsed, list):
            out = []
            for row in parsed:
                if not isinstance(row, dict) or not row.get("name"):
                    continue
                name = str(row["name"]).strip()
                price = float(row.get("price") or 0)
                if price <= 0:
                    continue
                cat = str(row.get("category") or "Main Course").strip()
                out.append({
                    "name": name[:80],
                    "price": round(price, 2),
                    "category": cat,
                    "isVegetarian": bool(row.get("isVegetarian", _infer_is_veg(name, name))),
                    "targetDestination": _infer_station(name, cat, "KITCHEN" if station_mode == "FOOD" else station_mode),
                    "description": str(row.get("description") or "").strip()[:200],
                })
            return out
    except Exception as e:
        print(f"[MENU_OCR_GEMINI_FALLBACK] {e}")
    return None


def scan_menu_image(image_bytes: bytes, mime_type: str = "image/jpeg", station_mode: str = "FOOD") -> Dict[str, Any]:
    """
    Extracts structured menu items from a hardcopy menu photo using Gemini Vision (if configured)
    or local Tesseract OCR + smart menu parser.
    """
    gemini_items = _try_gemini_vision(image_bytes, mime_type, station_mode)
    if gemini_items:
        return {"items": gemini_items, "rawText": "", "engine": "gemini-vision"}

    import pytesseract
    processed = _preprocess_for_ocr(image_bytes)
    raw_text = pytesseract.image_to_string(processed, config="--psm 6")
    items = parse_menu_text(raw_text, station_mode=station_mode)
    return {"items": items, "rawText": raw_text, "engine": "tesseract-ocr"}
