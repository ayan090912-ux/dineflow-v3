import uuid
from typing import Optional, List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from starlette.responses import JSONResponse
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, func

from app.core.database.connection import get_db
from app.core.security.tenant_auth import require_tenant_owner_or_admin, CallerContext
from app.modules.menu.models import MenuCategory, MenuItem
from app.modules.websocket.manager import ws_manager

router = APIRouter()

class CreateMenuItemSchema(BaseModel):
    id: Optional[str] = None
    categoryId: Optional[str] = None
    category: Optional[str] = None
    categoryName: Optional[str] = None
    name: str
    description: Optional[str] = ""
    price: float
    imageUrl: Optional[str] = None
    image: Optional[str] = None
    isAvailable: Optional[bool] = True
    isVegetarian: Optional[bool] = True
    targetDestination: Optional[str] = "KITCHEN"
    isAlcoholic: Optional[bool] = False
    dietaryType: Optional[str] = None
    prepTimeMinutes: Optional[int] = 15
    preparationTimeMinutes: Optional[int] = None

class UpdateMenuItemSchema(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    imageUrl: Optional[str] = None
    image: Optional[str] = None
    categoryId: Optional[str] = None
    category: Optional[str] = None
    categoryName: Optional[str] = None
    isAvailable: Optional[bool] = None
    isVegetarian: Optional[bool] = None
    targetDestination: Optional[str] = None
    isAlcoholic: Optional[bool] = None
    dietaryType: Optional[str] = None
    prepTimeMinutes: Optional[int] = None
    preparationTimeMinutes: Optional[int] = None

def format_menu_item_response(item: MenuItem) -> dict:
    return {
        "id": item.id,
        "restaurant_id": item.restaurant_id,
        "restaurantId": item.restaurant_id,
        "category_id": item.category_id,
        "categoryId": item.category_id,
        "name": item.name,
        "description": item.description or "",
        "price": item.price,
        "image_url": item.image_url,
        "imageUrl": item.image_url,
        "is_available": item.is_available,
        "isAvailable": item.is_available,
        "is_vegetarian": item.is_vegetarian,
        "isVegetarian": item.is_vegetarian,
        "dietary_type": item.dietary_type,
        "dietaryType": item.dietary_type,
        "target_destination": item.target_destination,
        "targetDestination": item.target_destination,
        "is_alcoholic": item.is_alcoholic,
        "isAlcoholic": item.is_alcoholic,
        "preparation_time_minutes": item.preparation_time_minutes,
        "prepTimeMinutes": item.preparation_time_minutes,
    }

from app.core.tenant.resolver import resolve_canonical_restaurant_id

class CreateCategorySchema(BaseModel):
    id: Optional[str] = None
    name: str
    sortOrder: Optional[int] = 1

@router.get("/{restaurant_id}/categories")
async def get_categories(restaurant_id: str, db: AsyncSession = Depends(get_db)):
    """
    Read-only retrieval of categories for a restaurant.
    Strictly idempotent; never inserts synthetic records on GET.
    Resolves both slug and UUID to canonical restaurant ID.
    """
    try:
        canonical_id = await resolve_canonical_restaurant_id(restaurant_id, db)
    except HTTPException:
        canonical_id = restaurant_id

    query = select(MenuCategory).where(MenuCategory.restaurant_id == canonical_id).order_by(MenuCategory.sort_order)
    result = await db.execute(query)
    cats = result.scalars().all()
    return cats

@router.post("/{restaurant_id}/categories", status_code=status.HTTP_201_CREATED)
async def create_category(
    restaurant_id: str,
    payload: CreateCategorySchema,
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    target_rest_id = caller.restaurant_id or restaurant_id
    cat_id = payload.id or f"cat-{target_rest_id}-{payload.name.lower().replace(' ', '_')}"
    new_cat = MenuCategory(
        id=cat_id,
        restaurant_id=target_rest_id,
        name=payload.name,
        sort_order=payload.sortOrder or 1,
        is_enabled=True,
    )
    db.add(new_cat)
    await db.commit()
    await db.refresh(new_cat)
    invalidate_menu_cache(target_rest_id, restaurant_id)
    return new_cat

import time

_MENU_CACHE: dict = {}
_MENU_CACHE_TTL: float = 60.0  # 60s memory burst cache with immediate mutation invalidation

def invalidate_menu_cache(*identifiers: Optional[str]):
    global _MENU_CACHE
    if not identifiers or not any(identifiers):
        _MENU_CACHE.clear()
        return
    for ident in identifiers:
        if not ident:
            continue
        ident_str = str(ident).strip().lower()
        to_del = [k for k in list(_MENU_CACHE.keys()) if k.lower() == ident_str or ident_str in k.lower() or k.lower() in ident_str]
        for k in to_del:
            _MENU_CACHE.pop(k, None)

@router.get("/{restaurant_id}/menu")
async def get_menu(restaurant_id: str, db: AsyncSession = Depends(get_db)):
    """
    Read-only retrieval of menu items and categories.
    Strictly idempotent; returns empty lists if empty without writing to database.
    Resolves both slug and UUID to canonical restaurant ID before cache evaluation.
    No-cache headers ensure clients and CDN always receive authoritative live menu data.
    """
    now_t = time.time()
    cache_headers = {
        "Cache-Control": "no-cache, no-store, must-revalidate, max-age=0",
        "Pragma": "no-cache",
        "Expires": "0",
        "Vary": "Accept-Encoding"
    }

    # 1. Resolve canonical restaurant ID first so slugs and IDs map to the same cache entry
    try:
        canonical_id = await resolve_canonical_restaurant_id(restaurant_id, db)
    except HTTPException:
        canonical_id = restaurant_id

    # 2. Check canonical cache entry
    if canonical_id in _MENU_CACHE:
        cached_ts, cached_menu = _MENU_CACHE[canonical_id]
        if now_t - cached_ts < _MENU_CACHE_TTL:
            return JSONResponse(content=cached_menu, headers=cache_headers)

    query_cats = select(MenuCategory).where(MenuCategory.restaurant_id == canonical_id).order_by(MenuCategory.sort_order)
    res_cats = await db.execute(query_cats)
    categories = res_cats.scalars().all()

    query_items = select(MenuItem).where(
        (MenuItem.restaurant_id == canonical_id) & (MenuItem.deleted_at == None)
    ).limit(500)
    res_items = await db.execute(query_items)
    items = res_items.scalars().all()

    formatted_items = [format_menu_item_response(item) for item in items]

    formatted_cats = [
        {
            "id": c.id,
            "restaurant_id": c.restaurant_id,
            "restaurantId": c.restaurant_id,
            "name": c.name,
            "sort_order": c.sort_order,
            "sortOrder": c.sort_order,
            "is_enabled": c.is_enabled,
            "isEnabled": c.is_enabled,
        }
        for c in categories
    ]

    resp_data = {
        "categories": formatted_cats,
        "items": formatted_items
    }
    _MENU_CACHE[canonical_id] = (now_t, resp_data)
    if restaurant_id != canonical_id:
        _MENU_CACHE[restaurant_id] = (now_t, resp_data)
    return JSONResponse(content=resp_data, headers=cache_headers)

KNOWN_CATEGORY_MAP = {
    "cat-starters": "Starters & Appetizers",
    "cat-mains": "Main Course",
    "cat-burgers": "Gourmet Burgers",
    "cat-pizza": "Wood-Fired Pizza",
    "cat-desserts": "Desserts & Sweets",
    "starters": "Starters & Appetizers",
    "starters & appetizers": "Starters & Appetizers",
    "appetizers": "Starters & Appetizers",
    "main course": "Main Course",
    "mains": "Main Course",
    "biryani": "Biryani & Rice",
    "biryani & rice": "Biryani & Rice",
    "rice": "Biryani & Rice",
    "breads": "Breads & Naans",
    "breads & naans": "Breads & Naans",
    "naans": "Breads & Naans",
    "desserts": "Desserts & Sweets",
    "desserts & sweets": "Desserts & Sweets",
    "sweets": "Desserts & Sweets",
    "beverages": "Beverages & Drinks",
    "beverages & drinks": "Beverages & Drinks",
    "drinks": "Beverages & Drinks",
}

@router.post("/{restaurant_id}/menu", status_code=status.HTTP_201_CREATED)
async def create_menu_item(
    restaurant_id: str,
    payload: CreateMenuItemSchema,
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    target_rest_id = caller.restaurant_id or restaurant_id
    raw_cat_input = (payload.categoryId or payload.category or payload.categoryName or "").strip()

    # Category Resolution: Support ID, Exact Name, Case-Insensitive Name, and Aliases
    cat_obj = None
    if raw_cat_input:
        # 1. Direct ID or exact / case-insensitive name match
        query_cat = select(MenuCategory).where(
            (MenuCategory.restaurant_id == target_rest_id) &
            ((MenuCategory.id == raw_cat_input) | (func.lower(MenuCategory.name) == raw_cat_input.lower()))
        )
        res_cat = await db.execute(query_cat)
        cat_obj = res_cat.scalars().first()

        # 2. Known category alias mapping match
        if not cat_obj and raw_cat_input.lower() in KNOWN_CATEGORY_MAP:
            mapped_name = KNOWN_CATEGORY_MAP[raw_cat_input.lower()]
            query_mapped = select(MenuCategory).where(
                (MenuCategory.restaurant_id == target_rest_id) &
                (func.lower(MenuCategory.name) == mapped_name.lower())
            )
            res_mapped = await db.execute(query_mapped)
            cat_obj = res_mapped.scalars().first()

    # 3. If category still doesn't exist, auto-create it with requested or mapped title
    if not cat_obj:
        if raw_cat_input:
            category_title = KNOWN_CATEGORY_MAP.get(raw_cat_input.lower(), raw_cat_input)
            sanitized_suffix = category_title.lower().replace(" ", "_").replace("&", "and").replace("/", "_")
            new_cat_id = f"cat-{target_rest_id}-{sanitized_suffix}"
            id_chk = await db.execute(select(MenuCategory).where(MenuCategory.id == new_cat_id))
            if id_chk.scalars().first():
                new_cat_id = f"{new_cat_id}-{uuid.uuid4().hex[:4]}"

            sort_res = await db.execute(select(func.max(MenuCategory.sort_order)).where(MenuCategory.restaurant_id == target_rest_id))
            cur_max = sort_res.scalar() or 0

            cat_obj = MenuCategory(
                id=new_cat_id,
                restaurant_id=target_rest_id,
                name=category_title,
                sort_order=cur_max + 1,
                is_enabled=True,
            )
            db.add(cat_obj)
            await db.flush()
        else:
            query_first = select(MenuCategory).where(MenuCategory.restaurant_id == target_rest_id).order_by(MenuCategory.sort_order)
            res_first = await db.execute(query_first)
            cat_obj = res_first.scalars().first()
            if not cat_obj:
                new_cat_id = f"cat-{target_rest_id}-main_course"
                cat_obj = MenuCategory(
                    id=new_cat_id,
                    restaurant_id=target_rest_id,
                    name="Main Course",
                    sort_order=1,
                    is_enabled=True,
                )
                db.add(cat_obj)
                await db.flush()

    target_category_id = cat_obj.id

    now_utc = datetime.now(timezone.utc)
    item_id = payload.id or f"item-{target_rest_id}-{int(now_utc.timestamp() * 1000)}-{uuid.uuid4().hex[:6]}"
    img = payload.imageUrl or payload.image or "https://images.unsplash.com/photo-1544025162-d76694265947?w=600"

    # Strict explicit routing only: item destination is NOT decided by arbitrary name substrings
    dest = (payload.targetDestination or "KITCHEN").upper()
    if dest not in ["KITCHEN", "BAR", "HOOKAH"]:
        dest = "KITCHEN"

    is_veg = payload.isVegetarian if payload.isVegetarian is not None else True
    diet_type = payload.dietaryType or ("VEG" if is_veg else "NON_VEG")
    is_alc = payload.isAlcoholic or (dest == "BAR")
    prep_time = payload.preparationTimeMinutes or payload.prepTimeMinutes or 15

    new_item = MenuItem(
        id=item_id,
        restaurant_id=target_rest_id,
        category_id=target_category_id,
        name=payload.name,
        description=payload.description or "",
        price=payload.price,
        image_url=img,
        is_available=payload.isAvailable if payload.isAvailable is not None else True,
        is_vegetarian=is_veg,
        dietary_type=diet_type,
        target_destination=dest,
        is_alcoholic=is_alc,
        preparation_time_minutes=prep_time,
    )
    db.add(new_item)
    await db.commit()
    await db.refresh(new_item)
    invalidate_menu_cache(target_rest_id, restaurant_id)

    resp_dict = format_menu_item_response(new_item)
    resp_dict["category_name"] = cat_obj.name
    resp_dict["categoryName"] = cat_obj.name

    try:
        await ws_manager.broadcast_event(
            restaurant_id=target_rest_id,
            event_type="menu_item_created",
            payload={
                "menuItemId": new_item.id,
                "restaurantId": target_rest_id,
                "name": new_item.name,
                "price": new_item.price,
                "targetDestination": new_item.target_destination,
            },
            target_audience=["WAITER", "KITCHEN", "BAR", "HOOKAH", "CUSTOMER", "OWNER"],
        )
    except Exception as ws_err:
        print("[WS_BROADCAST_NOTICE] menu_item_created:", ws_err)

    return resp_dict

@router.put("/{restaurant_id}/menu/{item_id}")
async def update_menu_item(
    restaurant_id: str,
    item_id: str,
    payload: UpdateMenuItemSchema,
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    target_rest_id = caller.restaurant_id or restaurant_id
    query = select(MenuItem).where(
        (MenuItem.id == item_id) & (MenuItem.restaurant_id == target_rest_id)
    )
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")

    if payload.name is not None:
        item.name = payload.name
    if payload.description is not None:
        item.description = payload.description
    if payload.price is not None:
        item.price = payload.price
    raw_cat_upd = (payload.categoryId or payload.category or payload.categoryName or "").strip() if (payload.categoryId or payload.category or payload.categoryName) else None
    if raw_cat_upd:
        query_cat_upd = select(MenuCategory).where(
            (MenuCategory.restaurant_id == target_rest_id) &
            ((MenuCategory.id == raw_cat_upd) | (func.lower(MenuCategory.name) == raw_cat_upd.lower()))
        )
        res_cat_upd = await db.execute(query_cat_upd)
        upd_cat_obj = res_cat_upd.scalars().first()
        if not upd_cat_obj and raw_cat_upd.lower() in KNOWN_CATEGORY_MAP:
            m_name = KNOWN_CATEGORY_MAP[raw_cat_upd.lower()]
            q_m = select(MenuCategory).where(
                (MenuCategory.restaurant_id == target_rest_id) &
                (func.lower(MenuCategory.name) == m_name.lower())
            )
            res_m = await db.execute(q_m)
            upd_cat_obj = res_m.scalars().first()
        if upd_cat_obj:
            item.category_id = upd_cat_obj.id
        else:
            item.category_id = raw_cat_upd
    if payload.imageUrl or payload.image:
        item.image_url = payload.imageUrl or payload.image
    if payload.isAvailable is not None:
        item.is_available = payload.isAvailable
    if payload.isVegetarian is not None:
        item.is_vegetarian = payload.isVegetarian
        item.dietary_type = "VEG" if payload.isVegetarian else "NON_VEG"
    if payload.dietaryType is not None:
        item.dietary_type = payload.dietaryType
    if payload.targetDestination is not None:
        dest_val = payload.targetDestination.upper()
        if dest_val in ["KITCHEN", "BAR", "HOOKAH"]:
            item.target_destination = dest_val
    if payload.isAlcoholic is not None:
        item.is_alcoholic = payload.isAlcoholic
    if payload.preparationTimeMinutes is not None:
        item.preparation_time_minutes = payload.preparationTimeMinutes
    elif payload.prepTimeMinutes is not None:
        item.preparation_time_minutes = payload.prepTimeMinutes

    await db.commit()
    await db.refresh(item)
    invalidate_menu_cache(target_rest_id, restaurant_id)

    resp_dict = format_menu_item_response(item)

    try:
        await ws_manager.broadcast_event(
            restaurant_id=target_rest_id,
            event_type="menu_item_updated",
            payload={
                "menuItemId": item.id,
                "restaurantId": target_rest_id,
                "name": item.name,
                "price": item.price,
                "isAvailable": item.is_available,
                "targetDestination": item.target_destination,
            },
            target_audience=["WAITER", "KITCHEN", "BAR", "HOOKAH", "CUSTOMER", "OWNER"],
        )
    except Exception as ws_err:
        print("[WS_BROADCAST_NOTICE] menu_item_updated:", ws_err)

    return resp_dict

@router.delete("/{restaurant_id}/menu/{item_id}")
async def delete_menu_item(
    restaurant_id: str,
    item_id: str,
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    target_rest_id = caller.restaurant_id or restaurant_id
    query = select(MenuItem).where(
        (MenuItem.id == item_id) & (MenuItem.restaurant_id == target_rest_id)
    )
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")

    await db.delete(item)
    await db.commit()
    invalidate_menu_cache(target_rest_id, restaurant_id)

    try:
        await ws_manager.broadcast_event(
            restaurant_id=target_rest_id,
            event_type="menu_item_deleted",
            payload={"menuItemId": item_id, "restaurantId": target_rest_id},
            target_audience=["WAITER", "KITCHEN", "BAR", "HOOKAH", "CUSTOMER", "OWNER"],
        )
    except Exception as ws_err:
        print("[WS_BROADCAST_NOTICE] menu_item_deleted:", ws_err)

    return {"success": True, "message": "Menu item deleted"}

