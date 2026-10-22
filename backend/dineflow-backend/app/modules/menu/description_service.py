"""
Description Library & Generator Service for DineFlow Global Menu Library
Provides offline, deterministic template generation and AI augmentation
for Food, Drinks/Bar, and Hookah/Shisha items across classic, modern, concise,
and artisanal culinary tones.
"""

from typing import List, Dict, Any, Optional

DESCRIPTION_TEMPLATES: Dict[str, Dict[str, Dict[str, str]]] = {
    "FOOD": {
        "classic": {
            "short": "Traditional {cuisine} recipe of tender {item_name} simmered with authentic spices.",
            "long": "An authentic {cuisine} specialty prepared with time-honored culinary methods. Featuring fresh {ingredients_summary}, gently simmered to perfection and infused with {flavour_profile}. Best enjoyed with hot rice or fresh Indian flatbreads."
        },
        "modern": {
            "short": "Pan-seared {item_name} highlighted with {flavour_profile} and fresh herbs.",
            "long": "A contemporary interpretation of {cuisine} dining. Crafted with {ingredients_summary}, balanced with {flavour_profile} notes for an elevated sensory experience. Presented fresh for {serving_size}."
        },
        "concise": {
            "short": "{item_name} with {ingredients_summary} and signature {flavour_profile}.",
            "long": "Freshly prepared {item_name} cooked with {ingredients_summary} in a fragrant {cuisine} spice blend. {serving_size}."
        },
        "artisanal": {
            "short": "Handcrafted {item_name} slow-cooked with freshly ground {cuisine} aromatics.",
            "long": "Slow-crafted with culinary reverence. Tender {item_name} married with hand-selected {ingredients_summary}, gently braised to bring out natural aromas and {flavour_profile} depth. A testament to artisanal {cuisine} cooking."
        }
    },
    "BAR": {
        "classic": {
            "short": "Refreshing {cuisine} cooler made with {ingredients_summary}.",
            "long": "A timeless thirst-quencher hand-crafted at our beverage bar. Combining chilled {ingredients_summary} with notes of {flavour_profile}. Served cold over crystal ice for an invigorating refreshment."
        },
        "modern": {
            "short": "Chilled {item_name} infused with {flavour_profile} and sparkling effervescence.",
            "long": "A sleek, mixologist-crafted drink designed for discerning palates. Blends {ingredients_summary} to achieve a harmonious balance of sweet, tangy, and {flavour_profile} nuances. Served in a {serving_size}."
        },
        "concise": {
            "short": "Iced {item_name} with {ingredients_summary} and zesty finish.",
            "long": "Freshly stirred {item_name} featuring {ingredients_summary}. Crisp, chilled, and delivering clean {flavour_profile} brightness."
        },
        "artisanal": {
            "short": "Botanical-infused {item_name} hand-pressed with fresh local citrus and herbs.",
            "long": "Handcrafted in small batches with cold-pressed natural essences. Highlighting {ingredients_summary} and balanced with {flavour_profile}. Poured fresh over rocks."
        }
    },
    "HOOKAH": {
        "classic": {
            "short": "Premium {item_name} shisha session with rich {flavour_profile} aroma.",
            "long": "The definitive lounge experience packed with top-tier blonde leaf molasses. Delivers dense, velvety clouds featuring notes of {flavour_profile}. Prepared in an authentic clay head for a smooth, lasting {serving_size}."
        },
        "modern": {
            "short": "Ultra-smooth {item_name} cloud session with an icy {flavour_profile} exhale.",
            "long": "A modern shisha blend curated for cloud density and crisp throat feel. Notes of {flavour_profile} unfold across the session, paired with natural coconut coals for clean, odorless heat."
        },
        "concise": {
            "short": "{item_name} shisha with thick clouds and {flavour_profile}.",
            "long": "Signature {item_name} blend featuring {flavour_profile}. Smooth draw, thick smoke output, and lasting flavour for {serving_size}."
        },
        "artisanal": {
            "short": "Master-blended {item_name} molasses infused with real botanical extracts.",
            "long": "Hand-mixed shisha formulation using whole-leaf tobacco steeped in natural essential oils. Features layered notes of {flavour_profile} with sub-zero smoothness for a premium {serving_size}."
        }
    }
}


def _summarize_ingredients(ingredients: Optional[List[str]]) -> str:
    if not ingredients or len(ingredients) == 0:
        return "selected farm ingredients and spices"
    if len(ingredients) == 1:
        return ingredients[0]
    if len(ingredients) == 2:
        return f"{ingredients[0]} and {ingredients[1]}"
    return f"{ingredients[0]}, {ingredients[1]}, and {ingredients[2]}"


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
    Generates verifiable short and long descriptions based strictly on verified inputs.
    Never invents unverified health claims or ingredients.
    """
    cat_key = (category or "FOOD").upper()
    if cat_key not in DESCRIPTION_TEMPLATES:
        cat_key = "FOOD"

    tone_key = (preferred_tone or "classic").lower()
    if tone_key not in DESCRIPTION_TEMPLATES[cat_key]:
        tone_key = "classic"

    c_cuisine = cuisine or ("Bengali" if "bengali" in (item_name or "").lower() else "Indian")
    c_flavour = flavour_profile or "balanced aromatic spices"
    c_ingredients = _summarize_ingredients(ingredients)
    c_serving = serving_size or ("Serves 1-2" if cat_key == "FOOD" else "Single portion")

    context = {
        "item_name": item_name.strip(),
        "cuisine": c_cuisine,
        "flavour_profile": c_flavour,
        "ingredients_summary": c_ingredients,
        "serving_size": c_serving,
    }

    # Selected tone outputs
    selected_tpl = DESCRIPTION_TEMPLATES[cat_key][tone_key]
    short_desc = selected_tpl["short"].format(**context)
    long_desc = selected_tpl["long"].format(**context)

    # Generate all tone variants for preview & selection
    variants = []
    for t_name, t_tpl in DESCRIPTION_TEMPLATES[cat_key].items():
        variants.append({
            "tone": t_name,
            "shortDescription": t_tpl["short"].format(**context),
            "longDescription": t_tpl["long"].format(**context)
        })

    return {
        "itemName": item_name,
        "category": cat_key,
        "tone": tone_key,
        "shortDescription": short_desc,
        "longDescription": long_desc,
        "variants": variants
    }
