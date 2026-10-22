import uuid
from typing import Optional, List, Any
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, Query, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func, or_, and_, desc

from app.core.database.connection import get_db
from app.core.security.tenant_auth import require_tenant_menu_manager, CallerContext
from app.core.tenant.resolver import resolve_canonical_restaurant_id
from app.modules.menu.models import MenuCategory, MenuItem, CatalogueItem
from app.modules.menu.catalogue_seed import GLOBAL_CATALOGUE_SEED
from app.modules.menu.description_service import generate_item_descriptions, DESCRIPTION_TEMPLATES
from app.modules.menu.router import invalidate_menu_cache, format_menu_item_response
from app.modules.websocket.manager import ws_manager

library_router = APIRouter()


async def ensure_catalogue_seeded(db: AsyncSession):
    """
    Ensures that the global menu library table is populated with the versioned catalogue seed.
    Idempotent: updates existing or inserts missing items without clearing.
    """
    try:
        count_res = await db.execute(select(func.count(CatalogueItem.id)))
        cnt = count_res.scalar() or 0
        if cnt < len(GLOBAL_CATALOGUE_SEED):
            for seed in GLOBAL_CATALOGUE_SEED:
                item_id = seed["id"]
                existing = await db.get(CatalogueItem, item_id)
                if not existing:
                    new_item = CatalogueItem(
                        id=item_id,
                        name=seed["name"],
                        aliases=seed.get("aliases", []),
                        category=seed["category"],
                        subcategory=seed["subcategory"],
                        cuisine=seed.get("cuisine", "Pan-Indian"),
                        short_description=seed["short_description"],
                        long_description=seed["long_description"],
                        ingredients=seed.get("ingredients", []),
                        preparation_notes=seed.get("preparation_notes"),
                        dietary_type=seed.get("dietary_type", "VEG"),
                        is_vegetarian=seed.get("is_vegetarian", True),
                        is_vegan=seed.get("is_vegan", False),
                        contains_egg=seed.get("contains_egg", False),
                        allergens=seed.get("allergens", []),
                        serving_size=seed.get("serving_size"),
                        target_destination=seed.get("target_destination", "KITCHEN"),
                        is_alcoholic=seed.get("is_alcoholic", False),
                        preparation_time_minutes=seed.get("preparation_time_minutes", 15),
                        image_url=seed.get("image_url"),
                        image_attribution=seed.get("image_attribution"),
                        flavour_profile=seed.get("flavour_profile"),
                        suggested_price_inr=seed.get("suggested_price_inr"),
                        is_active=seed.get("is_active", True),
                        version=seed.get("version", 1),
                        provenance=seed.get("provenance", "dinely_curated_v1")
                    )
                    db.add(new_item)
            await db.commit()
    except Exception as e:
        print("[CATALOGUE SEED NOTICE]:", e)
        try:
            await db.rollback()
        except Exception:
            pass


def format_catalogue_response(item: CatalogueItem) -> dict:
    return {
        "id": item.id,
        "name": item.name,
        "aliases": item.aliases or [],
        "category": item.category,
        "subcategory": item.subcategory,
        "cuisine": item.cuisine,
        "shortDescription": item.short_description,
        "longDescription": item.long_description,
        "ingredients": item.ingredients or [],
        "preparationNotes": item.preparation_notes or "",
        "dietaryType": item.dietary_type,
        "isVegetarian": item.is_vegetarian,
        "isVegan": item.is_vegan,
        "containsEgg": item.contains_egg,
        "allergens": item.allergens or [],
        "servingSize": item.serving_size or "",
        "targetDestination": item.target_destination,
        "isAlcoholic": item.is_alcoholic,
        "preparationTimeMinutes": item.preparation_time_minutes,
        "imageUrl": item.image_url,
        "imageAttribution": item.image_attribution or "",
        "flavourProfile": item.flavour_profile or "",
        "suggestedPriceInr": item.suggested_price_inr,
        "isActive": item.is_active,
        "version": item.version,
        "provenance": item.provenance
    }


# =========================================================================
# GLOBAL CATALOGUE READ & SEARCH ENDPOINTS
# =========================================================================

@library_router.get("")
@library_router.get("/")
async def get_menu_library(
    search: Optional[str] = Query(None, description="Search by name, description, cuisine, ingredient, or alias"),
    category: Optional[str] = Query(None, description="Category filter (FOOD, BAR, HOOKAH, DESSERT, BEVERAGE, ALL)"),
    subcategory: Optional[str] = Query(None, description="Subcategory filter"),
    cuisine: Optional[str] = Query(None, description="Cuisine filter"),
    dietaryType: Optional[str] = Query(None, description="Dietary filter (VEG, NON_VEG, EGG, VEGAN, ALL)"),
    targetDestination: Optional[str] = Query(None, description="Station destination (KITCHEN, BAR, HOOKAH, ALL)"),
    page: int = Query(1, ge=1),
    limit: int = Query(24, ge=1, le=100),
    db: AsyncSession = Depends(get_db)
):
    """
    Search and filter the Global Menu Library catalogue.
    Auto-seeds if empty.
    """
    await ensure_catalogue_seeded(db)

    conditions = [CatalogueItem.is_active == True]

    if category and category.upper() != "ALL":
        cat_u = category.upper()
        if cat_u in ["DRINKS", "BEVERAGES"]:
            conditions.append(CatalogueItem.category.in_(["BAR", "BEVERAGE"]))
        else:
            conditions.append(CatalogueItem.category == cat_u)

    if subcategory and subcategory.upper() != "ALL":
        conditions.append(CatalogueItem.subcategory == subcategory)

    if cuisine and cuisine.upper() != "ALL":
        conditions.append(CatalogueItem.cuisine == cuisine)

    if dietaryType and dietaryType.upper() != "ALL":
        d_type = dietaryType.upper()
        if d_type == "VEGAN":
            conditions.append(CatalogueItem.is_vegan == True)
        elif d_type == "EGG":
            conditions.append(CatalogueItem.contains_egg == True)
        else:
            conditions.append(CatalogueItem.dietary_type == d_type)

    if targetDestination and targetDestination.upper() != "ALL":
        conditions.append(CatalogueItem.target_destination == targetDestination.upper())

    if search and search.strip():
        term = f"%{search.strip().lower()}%"
        conditions.append(
            or_(
                func.lower(CatalogueItem.name).like(term),
                func.lower(CatalogueItem.short_description).like(term),
                func.lower(CatalogueItem.long_description).like(term),
                func.lower(CatalogueItem.cuisine).like(term),
                func.lower(CatalogueItem.subcategory).like(term),
                func.lower(CatalogueItem.flavour_profile).like(term)
            )
        )

    # Count total
    count_q = select(func.count(CatalogueItem.id)).where(and_(*conditions))
    total_res = await db.execute(count_q)
    total_count = total_res.scalar() or 0

    # Fetch paginated items
    offset = (page - 1) * limit
    items_q = (
        select(CatalogueItem)
        .where(and_(*conditions))
        .order_by(CatalogueItem.category, CatalogueItem.subcategory, CatalogueItem.name)
        .offset(offset)
        .limit(limit)
    )
    items_res = await db.execute(items_q)
    items = items_res.scalars().all()

    # Aggregate categories, subcategories, and cuisines for navigation filters
    cats_q = select(CatalogueItem.category, func.count(CatalogueItem.id)).where(CatalogueItem.is_active == True).group_by(CatalogueItem.category)
    cats_res = await db.execute(cats_q)
    category_facets = [{"category": row[0], "count": row[1]} for row in cats_res.all()]

    subcats_q = select(CatalogueItem.subcategory).where(CatalogueItem.is_active == True).distinct()
    subcats_res = await db.execute(subcats_q)
    subcategories = sorted([r for r in subcats_res.scalars().all() if r])

    cuisines_q = select(CatalogueItem.cuisine).where(CatalogueItem.is_active == True).distinct()
    cuisines_res = await db.execute(cuisines_q)
    cuisines = sorted([r for r in cuisines_res.scalars().all() if r])

    return {
        "items": [format_catalogue_response(i) for i in items],
        "total": total_count,
        "page": page,
        "limit": limit,
        "totalPages": (total_count + limit - 1) // limit if total_count > 0 else 1,
        "facets": {
            "categories": category_facets,
            "subcategories": subcategories,
            "cuisines": cuisines
        }
    }


@library_router.get("/templates/descriptions")
async def get_description_templates():
    """Returns available structured description templates across classic, modern, concise, and artisanal tones."""
    return DESCRIPTION_TEMPLATES


class GenerateDescriptionRequest(BaseModel):
    itemName: str
    category: Optional[str] = "FOOD"
    cuisine: Optional[str] = None
    flavourProfile: Optional[str] = None
    ingredients: Optional[List[str]] = None
    dietaryType: Optional[str] = "VEG"
    servingSize: Optional[str] = None
    tone: Optional[str] = "classic"


@library_router.post("/generate-description")
async def generate_description_endpoint(payload: GenerateDescriptionRequest):
    """
    Generates verifiable short and long descriptions based strictly on verified inputs.
    Never invents unverified health claims or ingredients.
    """
    if not payload.itemName or not payload.itemName.strip():
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="itemName is required")

    result = generate_item_descriptions(
        item_name=payload.itemName,
        category=payload.category or "FOOD",
        cuisine=payload.cuisine,
        flavour_profile=payload.flavourProfile,
        ingredients=payload.ingredients,
        dietary_type=payload.dietaryType or "VEG",
        serving_size=payload.servingSize,
        preferred_tone=payload.tone or "classic"
    )
    return result


@library_router.get("/{item_id}")
async def get_library_item_details(item_id: str, db: AsyncSession = Depends(get_db)):
    """Fetch full details and description variants for a single catalogue item."""
    await ensure_catalogue_seeded(db)
    item = await db.get(CatalogueItem, item_id)
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail=f"Catalogue item '{item_id}' not found")

    item_dict = format_catalogue_response(item)
    # Include description variations
    desc_gen = generate_item_descriptions(
        item_name=item.name,
        category=item.category,
        cuisine=item.cuisine,
        flavour_profile=item.flavour_profile,
        ingredients=item.ingredients,
        dietary_type=item.dietary_type,
        serving_size=item.serving_size,
        preferred_tone="classic"
    )
    item_dict["descriptionVariants"] = desc_gen["variants"]
    return item_dict


# =========================================================================
# TENANT ADD-TO-MENU WORKFLOW ENDPOINT
# =========================================================================

class AddLibraryItemEntry(BaseModel):
    catalogueItemId: str
    price: float = Field(..., gt=0, description="Selling price set by restaurant must be greater than zero")
    customName: Optional[str] = None
    customDescription: Optional[str] = None
    categoryName: Optional[str] = None
    categoryId: Optional[str] = None
    targetDestination: Optional[str] = None
    isAvailable: Optional[bool] = True
    servingSize: Optional[str] = None
    duplicateAction: Optional[str] = "SKIP"  # SKIP | CREATE_COPY | OVERWRITE


class BulkAddLibraryItemsRequest(BaseModel):
    items: List[AddLibraryItemEntry]


@library_router.post("/restaurants/{restaurant_id}/add-items", status_code=status.HTTP_201_CREATED)
async def add_library_items_to_restaurant(
    restaurant_id: str,
    payload: BulkAddLibraryItemsRequest,
    caller: CallerContext = Depends(require_tenant_menu_manager),
    db: AsyncSession = Depends(get_db)
):
    """
    Fast Add-to-Menu workflow:
    Adds selected items from Global Menu Library into the restaurant's private menu.
    Preserves tenant isolation, validates station routing, auto-creates categories,
    detects duplicates with merge/skip handling, and prevents price auto-setting.
    """
    target_rest_id = caller.restaurant_id or restaurant_id
    try:
        target_rest_id = await resolve_canonical_restaurant_id(target_rest_id, db)
    except HTTPException:
        pass

    if not payload.items or len(payload.items) == 0:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="No items provided to add")

    await ensure_catalogue_seeded(db)

    added_results = []
    skipped_results = []
    updated_results = []

    # Preload existing categories for this restaurant
    res_cats = await db.execute(select(MenuCategory).where(MenuCategory.restaurant_id == target_rest_id))
    existing_cats = {c.name.lower().strip(): c for c in res_cats.scalars().all()}
    cat_by_id = {c.id: c for c in existing_cats.values()}

    # Preload existing menu items to detect duplicates
    res_items = await db.execute(
        select(MenuItem).where(
            (MenuItem.restaurant_id == target_rest_id) & (MenuItem.deleted_at == None)
        )
    )
    existing_menu_items = res_items.scalars().all()
    items_by_name = {i.name.lower().strip(): i for i in existing_menu_items}
    items_by_template_id = {i.catalogue_item_id: i for i in existing_menu_items if getattr(i, "catalogue_item_id", None)}

    now_utc = datetime.now(timezone.utc)

    for entry in payload.items:
        # 1. Fetch template from global library
        cat_template = await db.get(CatalogueItem, entry.catalogueItemId)
        if not cat_template:
            skipped_results.append({
                "catalogueItemId": entry.catalogueItemId,
                "reason": f"Catalogue template '{entry.catalogueItemId}' not found."
            })
            continue

        item_name = (entry.customName or cat_template.name).strip()
        name_key = item_name.lower()
        tpl_key = cat_template.id

        # 2. Duplicate Detection
        existing_dup = items_by_name.get(name_key) or items_by_template_id.get(tpl_key)
        if existing_dup:
            action = (entry.duplicateAction or "SKIP").upper()
            if action == "SKIP":
                skipped_results.append({
                    "catalogueItemId": cat_template.id,
                    "itemName": item_name,
                    "existingItemId": existing_dup.id,
                    "reason": f"Item '{item_name}' already exists on menu."
                })
                continue
            elif action == "OVERWRITE":
                # Update existing item metadata, preserving price and availability unless explicitly provided
                if entry.price > 0:
                    existing_dup.price = float(entry.price)
                if entry.customDescription:
                    existing_dup.description = entry.customDescription
                if entry.servingSize:
                    existing_dup.serving_size = entry.servingSize
                existing_dup.catalogue_item_id = cat_template.id
                existing_dup.short_description = cat_template.short_description
                existing_dup.cuisine = cat_template.cuisine
                existing_dup.allergens = cat_template.allergens
                existing_dup.flavour_profile = cat_template.flavour_profile
                updated_results.append(format_menu_item_response(existing_dup))
                continue
            # If CREATE_COPY, proceed to create new item with unique suffix

        # 3. Resolve Target Destination with strict routing validation
        target_station = (entry.targetDestination or cat_template.target_destination or "KITCHEN").upper()
        if target_station not in ["KITCHEN", "BAR", "HOOKAH"]:
            target_station = cat_template.target_destination or "KITCHEN"

        # Validate that category matches station nature (e.g. hookah items must route to HOOKAH)
        if cat_template.category == "HOOKAH" and target_station != "HOOKAH":
            target_station = "HOOKAH"
        elif cat_template.category in ["BAR", "BEVERAGE"] and target_station not in ["BAR", "HOOKAH"]:
            target_station = "BAR"

        # 4. Resolve Target Category (find or auto-create)
        cat_name_input = (entry.categoryName or cat_template.subcategory or "General").strip()
        cat_id_input = entry.categoryId

        matched_cat = None
        if cat_id_input and cat_id_input in cat_by_id:
            matched_cat = cat_by_id[cat_id_input]
        elif cat_name_input.lower() in existing_cats:
            matched_cat = existing_cats[cat_name_input.lower()]
        else:
            # Auto-create category for restaurant
            sort_order = len(existing_cats) + 1
            sanitized_suffix = cat_name_input.lower().replace(" ", "_").replace("&", "and").replace("/", "_")
            new_cat_id = f"cat-{target_rest_id}-{sanitized_suffix}"
            if new_cat_id in cat_by_id:
                new_cat_id = f"{new_cat_id}-{uuid.uuid4().hex[:4]}"

            matched_cat = MenuCategory(
                id=new_cat_id,
                restaurant_id=target_rest_id,
                name=cat_name_input,
                sort_order=sort_order,
                is_enabled=True
            )
            db.add(matched_cat)
            await db.flush()
            existing_cats[cat_name_input.lower()] = matched_cat
            cat_by_id[new_cat_id] = matched_cat

        # 5. Create new MenuItem
        new_item_id = f"item-{target_rest_id}-{int(now_utc.timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
        is_veg = cat_template.is_vegetarian
        diet_type = cat_template.dietary_type or ("VEG" if is_veg else "NON_VEG")
        is_alc = bool(cat_template.is_alcoholic or (target_station == "BAR" and cat_template.category == "BAR"))

        new_item = MenuItem(
            id=new_item_id,
            restaurant_id=target_rest_id,
            category_id=matched_cat.id,
            name=item_name,
            description=entry.customDescription or cat_template.short_description or cat_template.long_description or "",
            price=float(entry.price),
            image_url=cat_template.image_url or "https://images.unsplash.com/photo-1544025162-d76694265947?w=600",
            is_available=entry.isAvailable if entry.isAvailable is not None else True,
            is_vegetarian=is_veg,
            dietary_type=diet_type,
            target_destination=target_station,
            is_alcoholic=is_alc,
            preparation_time_minutes=cat_template.preparation_time_minutes or 15,
            catalogue_item_id=cat_template.id,
            short_description=cat_template.short_description,
            cuisine=cat_template.cuisine,
            serving_size=entry.servingSize or cat_template.serving_size,
            allergens=cat_template.allergens,
            flavour_profile=cat_template.flavour_profile
        )
        db.add(new_item)
        items_by_name[name_key] = new_item
        items_by_template_id[cat_template.id] = new_item

        resp_dict = format_menu_item_response(new_item)
        resp_dict["categoryName"] = matched_cat.name
        added_results.append(resp_dict)

    await db.commit()
    invalidate_menu_cache(target_rest_id, restaurant_id)

    # Broadcast websocket event for newly created menu items
    for item in added_results:
        try:
            await ws_manager.broadcast_event(
                restaurant_id=target_rest_id,
                event_type="menu_item_created",
                payload={
                    "menuItemId": item["id"],
                    "restaurantId": target_rest_id,
                    "name": item["name"],
                    "price": item["price"],
                    "targetDestination": item["targetDestination"],
                },
                target_audience=["WAITER", "KITCHEN", "BAR", "HOOKAH", "CUSTOMER", "OWNER"],
            )
        except Exception as ws_err:
            print("[WS_BROADCAST_NOTICE] menu_library_item_created:", ws_err)

    return {
        "addedCount": len(added_results),
        "skippedCount": len(skipped_results),
        "updatedCount": len(updated_results),
        "added": added_results,
        "skipped": skipped_results,
        "updated": updated_results
    }
