import io
import os
import re
import json
import base64
import urllib.request
from typing import List, Dict, Any, Optional
from PIL import Image, ImageOps, ImageEnhance, ImageFilter


NON_VEG_HINTS = {
    "chicken", "chiken", "mutton", "lamb", "fish", "prawn", "prawns", "shrimp",
    "egg", "eggs", "keema", "kheema", "murgh", "gosht", "meat", "beef", "pork", "bacon",
    "crab", "lobster", "salmon", "tuna", "duck", "turkey", "salami", "pepperoni", "tandoori chicken"
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
    "sabzi": "Main Course",
    "sabji": "Main Course",
    "paneer": "Main Course",
    "dal": "Main Course",
    "curry": "Main Course",
    "gravy": "Main Course",
    "biryani": "Rice & Biryani",
    "rice": "Rice & Biryani",
    "pulao": "Rice & Biryani",
    "bread": "Breads & Naans",
    "naan": "Breads & Naans",
    "roti": "Breads & Naans",
    "paratha": "Breads & Naans",
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
    "raita": "Sides & Raita",
    "thali": "Thali & Combos",
    "combo": "Thali & Combos",
    "hookah": "Hookah & Shisha",
    "shisha": "Hookah & Shisha",
}

HEADER_NOISE_WORDS = {
    "half", "full", "quarter", "qtr", "plate", "price", "rate", "rates", "rs", "inr",
    "veg", "non veg", "non-veg", "menu", "dhaba", "restaurant", "special", "items", "qty"
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
    if low in HEADER_NOISE_WORDS:
        return None
    for kw, mapped in CATEGORY_HINTS.items():
        if kw in low:
            return mapped
    if cleaned.isupper() and 3 <= len(cleaned) <= 28:
        return cleaned.title()
    return None


def _clean_dish_name(raw_name: str) -> str:
    s = raw_name.strip()
    # Strip dot leaders, dashes, pipes, brackets, currency prefixes/suffixes
    s = re.sub(r"[\.\-–—•|_~:\[\]]+$", "", s).strip()
    s = re.sub(r"^[•\-\*\|\d\.\)\]\s]+", "", s).strip()
    s = re.sub(r"(?:₹|rs\.?|inr)\s*$", "", s, flags=re.IGNORECASE).strip()
    s = re.sub(r"\((?:veg|non[- ]?veg|v|nv)\)", "", s, flags=re.IGNORECASE).strip()
    s = re.sub(r"\s+", " ", s).strip()
    return s


def parse_menu_text(raw_text: str, station_mode: str = "FOOD") -> List[Dict[str, Any]]:
    """
    Parses OCR or pasted menu text into structured menu items.
    Supports single-column, multi-column lines (multiple dish+price pairs per line),
    and dual Half/Full prices (e.g. 'Dal Tadka 120 / 180' or 'Dal Tadka 120 180').
    """
    items: List[Dict[str, Any]] = []
    seen_names = set()
    default_cat = (
        "Hookah & Shisha" if station_mode == "HOOKAH"
        else "Cocktails & Beverages" if station_mode == "BAR"
        else "Main Course"
    )
    current_category = default_cat

    # Match prices like: "280", "₹280", "Rs. 280/-", "120/180", "120 180" (with optional trailing OCR punctuation)
    token_price_re = re.compile(
        r"(?:₹|rs\.?|inr)?\s*(\d{2,4}(?:\.\d{1,2})?)(?:\s*/\s*(\d{2,4}(?:\.\d{1,2})?))?\s*(?:/-)?(?=[\s\.,;|\)\]]|$)",
        re.IGNORECASE
    )

    for raw_line in (raw_text or "").splitlines():
        line = re.sub(r"\s+", " ", raw_line).strip()
        if not line or len(line) < 3:
            continue

        matches = list(token_price_re.finditer(line))
        # Filter out numbers that are clearly part of a dish name (e.g. "65" in "Chicken 65" if followed by another price, or "24-Hour")
        valid_price_matches = []
        for idx, m in enumerate(matches):
            val_str = m.group(2) or m.group(1)
            try:
                val = float(val_str)
            except ValueError:
                continue
            if val < 10 or val > 25000:
                continue
            # Check if followed by "-hour" / "ml" / "gm" / "pcs" (portion/unit, not price)
            after = line[m.end():m.end() + 8].lower()
            if re.match(r"^\s*(?:ml|gm|g|kg|l|pcs|pc|hour|hr|inch|oz)\b", after):
                continue
            valid_price_matches.append((m, val))

        if not valid_price_matches:
            heading = _detect_heading_category(line)
            if heading:
                current_category = heading
            continue

        # Collapse adjacent dual prices (e.g. Half 120  Full 180 -> keep Full 180 for the preceding dish)
        merged_segments: List[tuple] = []
        last_end = 0
        i = 0
        while i < len(valid_price_matches):
            m, val = valid_price_matches[i]
            raw_segment_name = line[last_end:m.start()]
            # Check if next match is right after this match (only spaces/slash/dash between them -> Half/Full dual price!)
            if i + 1 < len(valid_price_matches):
                next_m, next_val = valid_price_matches[i + 1]
                between = line[m.end():next_m.start()].strip()
                if len(between) <= 2 and re.match(r"^[/\-|]*$", between):
                    # Take the Full (second) price
                    merged_segments.append((raw_segment_name, next_val))
                    last_end = next_m.end()
                    i += 2
                    continue
            merged_segments.append((raw_segment_name, val))
            last_end = m.end()
            i += 1

        for raw_name_part, price_val in merged_segments:
            name_part = _clean_dish_name(raw_name_part)
            if len(name_part) < 2 or name_part.isdigit():
                continue
            if name_part.lower() in HEADER_NOISE_WORDS:
                continue
            # Require at least 2 alphabetic characters in dish name
            if len(re.findall(r"[a-zA-Z]", name_part)) < 2:
                continue

            norm_key = name_part.lower()
            if norm_key in seen_names:
                continue
            seen_names.add(norm_key)

            is_veg = _infer_is_veg(name_part, raw_name_part)
            if re.search(r"\b(non[- ]?veg|nv)\b", raw_name_part, re.IGNORECASE):
                is_veg = False

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


def _preprocess_pil(img: Image.Image) -> Image.Image:
    img = img.convert("L")
    w, h = img.size
    if max(w, h) < 2200:
        scale = 2200 / max(w, h)
        img = img.resize((int(w * scale), int(h * scale)), Image.Resampling.LANCZOS)
    img = ImageOps.autocontrast(img, cutoff=1)
    img = ImageEnhance.Contrast(img).enhance(1.6)
    img = img.filter(ImageFilter.SHARPEN)
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
    or multi-pass Tesseract OCR (full page + column-split for multi-column menus).
    """
    gemini_items = _try_gemini_vision(image_bytes, mime_type, station_mode)
    if gemini_items:
        return {"items": gemini_items, "rawText": "", "engine": "gemini-vision"}

    import pytesseract
    orig = ImageOps.exif_transpose(Image.open(io.BytesIO(image_bytes)))
    processed = _preprocess_pil(orig)

    # Pass 1: Auto page segmentation (handles multi-column layouts)
    text_auto = pytesseract.image_to_string(processed, config="--psm 3")
    items_auto = parse_menu_text(text_auto, station_mode=station_mode)

    # Pass 2: Split into Left & Right halves (for 2-column printed menu cards)
    w, h = processed.size
    left_crop = processed.crop((0, 0, int(w * 0.53), h))
    right_crop = processed.crop((int(w * 0.47), 0, w, h))
    text_left = pytesseract.image_to_string(left_crop, config="--psm 6")
    text_right = pytesseract.image_to_string(right_crop, config="--psm 6")
    combined_split_text = f"{text_left}\n{text_right}"
    items_split = parse_menu_text(combined_split_text, station_mode=station_mode)

    # Merge best results (preserving order and deduplicating by lowercase name)
    merged: List[Dict[str, Any]] = []
    seen = set()
    primary, secondary = (items_split, items_auto) if len(items_split) >= len(items_auto) else (items_auto, items_split)
    for it in primary + secondary:
        key = it["name"].lower()
        if key not in seen:
            seen.add(key)
            merged.append(it)

    best_raw = combined_split_text if len(items_split) >= len(items_auto) else text_auto
    return {"items": merged, "rawText": best_raw.strip(), "engine": "tesseract-ocr-v2"}
