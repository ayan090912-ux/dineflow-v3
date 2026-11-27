from typing import Optional, List, Dict, Any

# Dish-aware description templates across tones so Auto-Generate produces varied, accurate copy
STYLE_TEMPLATES: Dict[str, Dict[str, Dict[str, str]]] = {
    "INDIAN_CURRY": {
        "classic": {
            "short": "Slow-simmered {item_name} prepared in a rich, aromatic gravy with traditional spices.",
            "long": "{item_name} cooked gently in a spiced gravy for balanced warmth and depth. {serving_size}."
        },
        "artisanal": {
            "short": "Chef-crafted {item_name} finished with toasted whole spices, herbs, and a velvety finish.",
            "long": "Prepared fresh to order, {item_name} pairs slow-cooked aromatics with a rich, comforting sauce. {serving_size}."
        },
        "modern": {
            "short": "Rich, comforting {item_name} layered with house-roasted masala and fresh herbs.",
            "long": "A crowd-favourite {item_name} finished with fresh coriander and balanced spice. {serving_size}."
        },
        "chef_special": {
            "short": "Signature house {item_name} simmered to perfection and served piping hot.",
            "long": "Our kitchen's signature take on {item_name}, rich in flavour and ideal with naan or steamed rice. {serving_size}."
        },
    },
    "TANDOOR_GRILL": {
        "classic": {
            "short": "Char-grilled {item_name} marinated in spiced yogurt and roasted in the tandoor.",
            "long": "Succulent {item_name} marinated with aromatic spices and charred over live embers for a smoky finish. {serving_size}."
        },
        "artisanal": {
            "short": "Smoky, flame-kissed {item_name} finished with melted butter, lime, and chaat masala.",
            "long": "Tender {item_name} roasted to golden perfection in our clay tandoor and served with mint chutney. {serving_size}."
        },
        "modern": {
            "short": "Juicy tandoor-roasted {item_name} with crisp charred edges and zesty herb notes.",
            "long": "High-heat clay-oven seared {item_name} bursting with smoky flavour. {serving_size}."
        },
        "chef_special": {
            "short": "Chef's special {item_name}, double-marinated and char-grilled for maximum tenderness.",
            "long": "Our signature {item_name} straight from the skewers, served sizzling with crisp onions and chutney. {serving_size}."
        },
    },
    "BIRYANI_RICE": {
        "classic": {
            "short": "Fragrant long-grain basmati {item_name} layered with saffron, herbs, and whole spices.",
            "long": "Slow-cooked dum {item_name} infused with whole spices, caramelized onions, and fresh mint. {serving_size}."
        },
        "artisanal": {
            "short": "Aromatic dum-cooked {item_name} sealed with saffron, crispy shallots, and delicate spice.",
            "long": "Fluffy aged basmati rice steamed with tender {item_name} aromatics and served with cooling raita. {serving_size}."
        },
        "modern": {
            "short": "Fluffy, spice-infused {item_name} cooked to order with caramelized onions and mint.",
            "long": "Light yet deeply flavourful {item_name} crafted with fragrant basmati and house spice blend. {serving_size}."
        },
        "chef_special": {
            "short": "Royal house-style {item_name} slow-steamed for rich aroma in every spoonful.",
            "long": "Chef's signature {item_name} prepared in traditional dum style and served hot. {serving_size}."
        },
    },
    "BREAD": {
        "classic": {
            "short": "Freshly baked {item_name} straight from the clay tandoor, soft and lightly blistered.",
            "long": "Hand-stretched {item_name} baked crisp on the outside and pillowy inside. {serving_size}."
        },
        "artisanal": {
            "short": "Warm, hand-tossed {item_name} brushed lightly and served fresh off the tandoor.",
            "long": "Made fresh to order, {item_name} pairs effortlessly with any curry or kebab. {serving_size}."
        },
        "modern": {
            "short": "Golden, blistered {item_name} baked to order for the perfect scoop.",
            "long": "Light and airy {item_name} served hot from the oven. {serving_size}."
        },
        "chef_special": {
            "short": "Crisp-edged, pillowy {item_name} finished fresh for your table.",
            "long": "Freshly baked {item_name} crafted to complement rich gravies and grills. {serving_size}."
        },
    },
    "ITALIAN": {
        "classic": {
            "short": "Freshly prepared {item_name} finished with herbs, olive oil, and aged cheese.",
            "long": "Authentic {item_name} crafted to order with rich sauce, aromatic herbs, and a comforting finish. {serving_size}."
        },
        "artisanal": {
            "short": "Al dente / stone-baked {item_name} tossed with garlic, basil, and creamy perfection.",
            "long": "Prepared fresh in-house, {item_name} balances savoury richness with bright herb notes. {serving_size}."
        },
        "modern": {
            "short": "Warm, indulgent {item_name} loaded with herbs and melted cheese.",
            "long": "A comforting Italian-style {item_name} served hot and garnished with fresh herbs. {serving_size}."
        },
        "chef_special": {
            "short": "Chef's signature {item_name} crafted with slow-simmered sauce and toasted garlic.",
            "long": "Our house-style {item_name} made fresh to order for bold, satisfying flavour. {serving_size}."
        },
    },
    "ASIAN": {
        "classic": {
            "short": "Wok-tossed {item_name} glazed in savoury soy, garlic, and toasted sesame.",
            "long": "High-flame wok-seared {item_name} with crisp vegetables, ginger-garlic, and umami sauce. {serving_size}."
        },
        "artisanal": {
            "short": "Fiery wok-fired {item_name} finished with spring onions, cracked pepper, and aromatics.",
            "long": "Prepared fresh over a roaring wok for crisp texture and bold Indo-Asian flavour. {serving_size}."
        },
        "modern": {
            "short": "Crisp, saucy {item_name} tossed with fresh scallions, garlic, and chilli.",
            "long": "Vibrant street-style {item_name} balancing sweet, savoury, and spicy notes. {serving_size}."
        },
        "chef_special": {
            "short": "Signature wok-tossed {item_name} packed with smoky heat and crunch.",
            "long": "Our chef's bold {item_name} cooked to order and garnished with fresh greens. {serving_size}."
        },
    },
    "CONTINENTAL": {
        "classic": {
            "short": "Freshly prepared {item_name} served hot with house seasoning and signature dip.",
            "long": "Crisp, savoury {item_name} cooked to golden perfection and plated fresh. {serving_size}."
        },
        "artisanal": {
            "short": "Golden-seared {item_name} layered with melted cheese, herbs, and house sauce.",
            "long": "Crafted to order for satisfying crunch and rich flavour in every bite. {serving_size}."
        },
        "modern": {
            "short": "Loaded {item_name} seasoned with cracked pepper, herbs, and zesty dressing.",
            "long": "Crowd-pleasing {item_name} served piping hot alongside house dips. {serving_size}."
        },
        "chef_special": {
            "short": "House-favourite {item_name} made fresh with bold seasoning and crisp texture.",
            "long": "Our kitchen's signature {item_name}, ideal for sharing or solo indulgence. {serving_size}."
        },
    },
    "DESSERT": {
        "classic": {
            "short": "Indulgent {item_name} crafted for a rich, melt-in-the-mouth sweet finish.",
            "long": "Freshly plated {item_name} offering balanced sweetness and velvety texture. {serving_size}."
        },
        "artisanal": {
            "short": "Delicate {item_name} finished with warm, comforting sweetness and rich aroma.",
            "long": "A timeless {item_name} prepared to end your meal on a memorable note. {serving_size}."
        },
        "modern": {
            "short": "Decadent {item_name} with silky texture and irresistible sweetness.",
            "long": "Hand-finished {item_name} served fresh for dessert lovers. {serving_size}."
        },
        "chef_special": {
            "short": "Signature sweet {item_name} crafted fresh to delight every palate.",
            "long": "Our pastry station's favourite {item_name}, rich and satisfying. {serving_size}."
        },
    },
    "BAR": {
        "classic": {
            "short": "Chilled {item_name} shaken fresh with crisp citrus, botanicals, and ice.",
            "long": "Refreshing {item_name} crafted to order at the bar for a clean, balanced sip. {serving_size}."
        },
        "artisanal": {
            "short": "Hand-muddled {item_name} layered with bright citrus, crushed ice, and fresh garnish.",
            "long": "Bartender-crafted {item_name} delivering vibrant aroma and crisp refreshment. {serving_size}."
        },
        "modern": {
            "short": "Ice-cold {item_name} bursting with zesty freshness and smooth finish.",
            "long": "A cool, invigorating {item_name} poured fresh to pair with your meal. {serving_size}."
        },
        "chef_special": {
            "short": "Signature house {item_name} mixed fresh with premium ingredients over ice.",
            "long": "Our bar's signature {item_name} served chilled with aromatic garnish. {serving_size}."
        },
    },
    "CAFE_BEVERAGE": {
        "classic": {
            "short": "Freshly brewed {item_name} served warm and aromatic.",
            "long": "Crafted to order, {item_name} delivers rich aroma and smooth, comforting flavour. {serving_size}."
        },
        "artisanal": {
            "short": "Velvety {item_name} prepared with freshly ground beans or hand-steeped leaves.",
            "long": "Balanced and fragrant {item_name} made fresh for an uplifting sip. {serving_size}."
        },
        "modern": {
            "short": "Smooth, café-style {item_name} with rich crema and delicate sweetness.",
            "long": "Handcrafted {item_name} brewed fresh to pair with snacks or desserts. {serving_size}."
        },
        "chef_special": {
            "short": "House-brewed {item_name} finished fresh for a crisp, aromatic cup.",
            "long": "Our café counter's signature {item_name} served at the ideal temperature. {serving_size}."
        },
    },
    "MOCKTAIL_COOLER": {
        "classic": {
            "short": "Chilled {item_name} muddled fresh with mint, zesty citrus, and crushed ice.",
            "long": "Crisp and refreshing {item_name} crafted to order for a bright, cooling sip. {serving_size}."
        },
        "artisanal": {
            "short": "Refreshing {item_name} layered with fresh herbs, tangy lime, and sparkling fizz.",
            "long": "Hand-shaken {item_name} bursting with cool citrus and garden-fresh aroma. {serving_size}."
        },
        "modern": {
            "short": "Ice-cold {item_name} with vibrant fruit notes and a crisp, clean finish.",
            "long": "A zero-proof crowd-pleaser, {item_name} brings zesty refreshment to any meal. {serving_size}."
        },
        "chef_special": {
            "short": "Signature house {item_name} poured over crushed ice with fresh garnish.",
            "long": "Our bar's refreshing take on {item_name}, bright and invigorating. {serving_size}."
        },
    },
    "SOUP_SALAD": {
        "classic": {
            "short": "Freshly prepared {item_name} bursting with crisp greens, herbs, and light seasoning.",
            "long": "Wholesome {item_name} crafted to order for clean, vibrant flavour. {serving_size}."
        },
        "artisanal": {
            "short": "Light, nourishing {item_name} finished with house dressing and cracked pepper.",
            "long": "Made fresh from crisp seasonal produce, {item_name} offers bright, balanced taste. {serving_size}."
        },
        "modern": {
            "short": "Vibrant {item_name} tossed fresh with zesty dressing and toasted crunch.",
            "long": "Refreshing and satisfying {item_name} plated fresh for a lighter start. {serving_size}."
        },
        "chef_special": {
            "short": "House-style {item_name} prepared fresh with delicate herbs and clean flavour.",
            "long": "Our kitchen's crisp {item_name} served fresh to awaken the palate. {serving_size}."
        },
    },
    "VEG_INDIAN": {
        "classic": {
            "short": "Homestyle {item_name} simmered with fresh tomatoes, ginger, and roasted cumin.",
            "long": "Comforting vegetarian {item_name} slow-cooked for rich texture and balanced spice. {serving_size}."
        },
        "artisanal": {
            "short": "Rich, creamy {item_name} finished with fenugreek leaves, butter, and warm spices.",
            "long": "Crafted fresh in-house, {item_name} pairs velvety gravy with hearty flavours. {serving_size}."
        },
        "modern": {
            "short": "Flavour-packed {item_name} tossed with caramelized onions, garlic, and coriander.",
            "long": "A vibrant vegetarian favourite, {item_name} is cooked fresh and ideal with tandoori roti or rice. {serving_size}."
        },
        "chef_special": {
            "short": "Signature {item_name} slow-simmered to silky perfection and garnished fresh.",
            "long": "Our chef's comforting {item_name} rich in aroma and homestyle warmth. {serving_size}."
        },
    },
    "NONVEG_INDIAN": {
        "classic": {
            "short": "Succulent {item_name} slow-cooked in a rich, spiced gravy until tender.",
            "long": "Juicy cuts simmered in house-roasted masala for deep, hearty flavour in {item_name}. {serving_size}."
        },
        "artisanal": {
            "short": "Tender {item_name} folded into a velvety, slow-simmered sauce with warm spices.",
            "long": "Prepared fresh to order, {item_name} balances rich gravy with smoky, savoury depth. {serving_size}."
        },
        "modern": {
            "short": "Bold, aromatic {item_name} simmered with toasted spices, ginger, and fresh herbs.",
            "long": "A hearty classic, {item_name} is cooked tender and served piping hot with naan or rice. {serving_size}."
        },
        "chef_special": {
            "short": "Signature house {item_name} crafted for melt-in-the-mouth tenderness.",
            "long": "Our kitchen's signature {item_name}, rich, savoury, and full of character. {serving_size}."
        },
    },
    "HOOKAH": {
        "classic": {
            "short": "Smooth {item_name} shisha blend packed fresh for rich clouds and clean draw.",
            "long": "Carefully prepared {item_name} hookah session with natural coconut coals and balanced flavour. {serving_size}."
        },
        "artisanal": {
            "short": "Aromatic {item_name} lounge blend offering cool, long-lasting flavour.",
            "long": "Hand-packed {item_name} bowl heated evenly for dense, smooth draws. {serving_size}."
        },
        "modern": {
            "short": "Refreshing {item_name} shisha mix crafted for an effortless lounge session.",
            "long": "Rich, cooling {item_name} flavour profile prepared fresh at the hookah bar. {serving_size}."
        },
        "chef_special": {
            "short": "Signature {item_name} hookah session with crisp aroma and silky clouds.",
            "long": "Our lounge's signature {item_name} preparation, ready for relaxed table service. {serving_size}."
        },
    },
}


def _detect_dish_style(item_name: str, category: str) -> str:
    n = (item_name or "").lower()
    c = (category or "").lower()
    if any(k in c for k in ("hookah", "shisha")) or any(k in n for k in ("hookah", "shisha", "chillam", "sheesha", "paan ras", "brain freezer", "double apple")):
        return "HOOKAH"
    if any(k in n for k in ("latte", "cappuccino", "espresso", "americano", "mocha", "cold coffee", "chai", "tea", "matcha", "hot chocolate")) or any(k in c for k in ("coffee", "tea", "cafe")):
        return "CAFE_BEVERAGE"
    if any(k in n for k in ("mojito", "mocktail", "lemonade", "cooler", "iced tea", "smoothie", "shake", "lassi", "fresh lime", "mint cooler", "virgin")) or any(k in c for k in ("mocktail", "cooler", "shake", "juice", "soft drink")):
        return "MOCKTAIL_COOLER"
    if any(k in c for k in ("bar", "beverage", "drink", "cocktail", "wine", "beer", "whiskey", "spirits")) or any(
        k in n for k in ("cocktail", "soda", "cola", "beer", "whisky", "whiskey", "vodka", "gin", "rum", "wine", "margarita", "martini", "negroni", "spritz")
    ):
        return "BAR"
    if any(k in c for k in ("dessert", "sweet", "bakery", "cake", "ice cream")) or any(
        k in n for k in ("cake", "brownie", "pastry", "tiramisu", "cheesecake", "ice cream", "gelato", "gulab jamun", "rasmalai", "kheer", "halwa", "jalebi", "kulfi", "sundae", "pudding", "mousse")
    ):
        return "DESSERT"
    if any(k in c for k in ("bread", "naan", "roti")) or any(
        k in n for k in ("naan", "roti", "rooti", "kulcha", "paratha", "parotta", "chapati", "phulka", "bhakri")
    ):
        return "BREAD"
    if any(k in n for k in ("soup", "shorba", "broth", "salad", "caesar", "fattoush", "greek salad")):
        return "SOUP_SALAD"
    if any(k in n for k in ("biryani", "pulao", "pulav", "khichdi", "jeera rice")) and "fried rice" not in n:
        return "BIRYANI_RICE"
    if any(k in n for k in ("pasta", "pizza", "risotto", "lasagna", "spaghetti", "penne", "alfredo", "arrabbiata", "margherita", "garlic bread", "bruschetta", "ravioli")):
        return "ITALIAN"
    if any(k in n for k in ("noodle", "hakka", "chowmein", "manchurian", "momo", "dimsum", "dim sum", "chilli", "schezwan", "fried rice", "spring roll", "wonton", "ramen", "sushi", "pad thai", "kung pao")):
        return "ASIAN"
    if any(k in n for k in ("burger", "fries", "sandwich", "wrap", "panini", "taco", "nachos", "quesadilla", "wings", "nuggets", "steak", "cutlet", "samosa", "pakora", "chaat")):
        return "CONTINENTAL"
    if any(k in n for k in ("tikka", "kebab", "kabab", "tandoori", "seekh", "malai", "reshmi", "harabhara", "hara bhara", "angara")):
        return "TANDOOR_GRILL"
    if any(k in n for k in ("paneer", "dal", "chole", "rajma", "kadai", "palak", "kofta")):
        return "VEG_INDIAN"
    if any(k in n for k in ("chicken", "chiken", "mutton", "lamb", "fish", "prawn", "keema", "butter chicken", "rogan josh")):
        return "NONVEG_INDIAN"
    return "INDIAN_CURRY"


def generate_item_descriptions(
    item_name: str,
    category: str = "FOOD",
    cuisine: Optional[str] = None,
    flavour_profile: Optional[str] = None,
    ingredients: Optional[List[str]] = None,
    dietary_type: Optional[str] = "VEG",
    serving_size: Optional[str] = None,
    preferred_tone: str = "classic"
) -> Dict[str, Any]:
    """
    Generates varied, dish-aware short and long descriptions from item name & category.
    """
    style_key = _detect_dish_style(item_name, category)
    templates_for_style = STYLE_TEMPLATES[style_key]

    tone_key = (preferred_tone or "classic").lower()
    if tone_key == "concise":
        tone_key = "chef_special"
    if tone_key not in templates_for_style:
        tone_key = "classic"

    c_serving = serving_size or ("Single glass" if style_key == "BAR" else "1 session" if style_key == "HOOKAH" else "Served fresh")

    context = {
        "item_name": item_name.strip(),
        "serving_size": c_serving,
    }

    selected_tpl = templates_for_style[tone_key]
    short_desc = selected_tpl["short"].format(**context)
    long_desc = selected_tpl["long"].format(**context)

    variants = [
        {
            "tone": t_name,
            "shortDescription": t_tpl["short"].format(**context),
            "longDescription": t_tpl["long"].format(**context),
        }
        for t_name, t_tpl in templates_for_style.items()
    ]

    return {
        "itemName": item_name,
        "category": style_key,
        "tone": tone_key,
        "shortDescription": short_desc,
        "longDescription": long_desc,
        "variants": variants,
    }


DESCRIPTION_TEMPLATES = STYLE_TEMPLATES
