from typing import Optional, List
from datetime import datetime, timezone
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database.connection import get_db
from app.core.security.tenant_auth import require_tenant_owner_or_admin, CallerContext
from app.modules.menu.models import MenuCategory, MenuItem
from app.modules.websocket.manager import ws_manager

router = APIRouter()

class CreateMenuItemSchema(BaseModel):
    id: Optional[str] = None
    categoryId: Optional[str] = None
    name: str
    description: Optional[str] = ""
    price: float
    imageUrl: Optional[str] = None
    image: Optional[str] = None
    isAvailable: Optional[bool] = True
    isVegetarian: Optional[bool] = True
    targetDestination: Optional[str] = "KITCHEN"

class UpdateMenuItemSchema(BaseModel):
    name: Optional[str] = None
    description: Optional[str] = None
    price: Optional[float] = None
    imageUrl: Optional[str] = None
    image: Optional[str] = None
    categoryId: Optional[str] = None
    isAvailable: Optional[bool] = None
    isVegetarian: Optional[bool] = None
    targetDestination: Optional[str] = None

class CreateCategorySchema(BaseModel):
    id: Optional[str] = None
    name: str
    sortOrder: Optional[int] = 1

@router.get("/{restaurant_id}/categories")
async def get_categories(restaurant_id: str, db: AsyncSession = Depends(get_db)):
    """
    Read-only retrieval of categories for a restaurant.
    Strictly idempotent; never inserts synthetic records on GET.
    """
    query = select(MenuCategory).where(MenuCategory.restaurant_id == restaurant_id).order_by(MenuCategory.sort_order)
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
    cat_id = payload.id or f"cat-{restaurant_id}-{payload.name.lower().replace(' ', '_')}"
    new_cat = MenuCategory(
        id=cat_id,
        restaurant_id=restaurant_id,
        name=payload.name,
        sort_order=payload.sortOrder or 1,
        is_enabled=True,
    )
    db.add(new_cat)
    await db.commit()
    await db.refresh(new_cat)
    return new_cat

@router.get("/{restaurant_id}/menu")
async def get_menu(restaurant_id: str, db: AsyncSession = Depends(get_db)):
    """
    Read-only retrieval of menu items and categories.
    Strictly idempotent; returns empty lists if empty without writing to database.
    """
    query_cats = select(MenuCategory).where(MenuCategory.restaurant_id == restaurant_id).order_by(MenuCategory.sort_order)
    res_cats = await db.execute(query_cats)
    categories = res_cats.scalars().all()

    query_items = select(MenuItem).where(
        (MenuItem.restaurant_id == restaurant_id) & (MenuItem.deleted_at == None)
    )
    res_items = await db.execute(query_items)
    items = res_items.scalars().all()

    return {
        "categories": categories,
        "items": items
    }

@router.post("/{restaurant_id}/menu", status_code=status.HTTP_201_CREATED)
async def create_menu_item(
    restaurant_id: str,
    payload: CreateMenuItemSchema,
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    target_category_id = payload.categoryId

    # Category Auto-Resolution (search by ID or Name)
    cat_obj = None
    if target_category_id:
        query_cat = select(MenuCategory).where(
            (MenuCategory.restaurant_id == restaurant_id) &
            ((MenuCategory.id == target_category_id) | (MenuCategory.name == target_category_id))
        )
        res_cat = await db.execute(query_cat)
        cat_obj = res_cat.scalar_one_or_none()

    if not cat_obj:
        # Fallback to existing first category or create explicit Main Course
        query_first = select(MenuCategory).where(MenuCategory.restaurant_id == restaurant_id).order_by(MenuCategory.sort_order)
        res_first = await db.execute(query_first)
        cat_obj = res_first.scalars().first()
        if cat_obj:
            target_category_id = cat_obj.id
        else:
            new_cat_id = f"cat-{restaurant_id}-1"
            cat_obj = MenuCategory(
                id=new_cat_id,
                restaurant_id=restaurant_id,
                name="Main Course",
                sort_order=1,
                is_enabled=True,
            )
            db.add(cat_obj)
            await db.flush()
            target_category_id = cat_obj.id

    now_utc = datetime.now(timezone.utc)
    item_id = payload.id or f"item-{restaurant_id}-{int(now_utc.timestamp() * 1000)}"
    img = payload.imageUrl or payload.image or "https://images.unsplash.com/photo-1544025162-d76694265947?w=600"

    # Strict explicit routing only: item destination is NOT decided by arbitrary name substrings
    dest = (payload.targetDestination or "KITCHEN").upper()
    if dest not in ["KITCHEN", "BAR"]:
        dest = "KITCHEN"

    new_item = MenuItem(
        id=item_id,
        restaurant_id=restaurant_id,
        category_id=target_category_id,
        name=payload.name,
        description=payload.description or "",
        price=payload.price,
        image_url=img,
        is_available=payload.isAvailable if payload.isAvailable is not None else True,
        is_vegetarian=payload.isVegetarian if payload.isVegetarian is not None else True,
        dietary_type="VEG" if payload.isVegetarian else "NON_VEG",
        target_destination=dest,
    )
    db.add(new_item)
    await db.commit()
    await db.refresh(new_item)

    try:
        await ws_manager.broadcast_event(
            restaurant_id=restaurant_id,
            event_type="menu_item_created",
            payload={
                "menuItemId": new_item.id,
                "restaurantId": restaurant_id,
                "name": new_item.name,
                "price": new_item.price,
                "targetDestination": new_item.target_destination,
            },
            target_audience=["WAITER", "KITCHEN", "BAR", "CUSTOMER", "OWNER"],
        )
    except Exception as ws_err:
        print("[WS_BROADCAST_NOTICE] menu_item_created:", ws_err)

    return new_item

@router.put("/{restaurant_id}/menu/{item_id}")
async def update_menu_item(
    restaurant_id: str,
    item_id: str,
    payload: UpdateMenuItemSchema,
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    query = select(MenuItem).where(
        (MenuItem.id == item_id) & (MenuItem.restaurant_id == restaurant_id)
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
    if payload.categoryId is not None:
        item.category_id = payload.categoryId
    if payload.imageUrl or payload.image:
        item.image_url = payload.imageUrl or payload.image
    if payload.isAvailable is not None:
        item.is_available = payload.isAvailable
    if payload.isVegetarian is not None:
        item.is_vegetarian = payload.isVegetarian
        item.dietary_type = "VEG" if payload.isVegetarian else "NON_VEG"
    if payload.targetDestination is not None:
        item.target_destination = payload.targetDestination

    await db.commit()
    await db.refresh(item)

    try:
        await ws_manager.broadcast_event(
            restaurant_id=restaurant_id,
            event_type="menu_item_updated",
            payload={
                "menuItemId": item.id,
                "restaurantId": restaurant_id,
                "name": item.name,
                "price": item.price,
                "isAvailable": item.is_available,
                "targetDestination": item.target_destination,
            },
            target_audience=["WAITER", "KITCHEN", "BAR", "CUSTOMER", "OWNER"],
        )
    except Exception as ws_err:
        print("[WS_BROADCAST_NOTICE] menu_item_updated:", ws_err)

    return item

@router.delete("/{restaurant_id}/menu/{item_id}")
async def delete_menu_item(
    restaurant_id: str,
    item_id: str,
    caller: CallerContext = Depends(require_tenant_owner_or_admin),
    db: AsyncSession = Depends(get_db)
):
    query = select(MenuItem).where(
        (MenuItem.id == item_id) & (MenuItem.restaurant_id == restaurant_id)
    )
    result = await db.execute(query)
    item = result.scalar_one_or_none()
    if not item:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Menu item not found")

    await db.delete(item)
    await db.commit()

    try:
        await ws_manager.broadcast_event(
            restaurant_id=restaurant_id,
            event_type="menu_item_deleted",
            payload={"menuItemId": item_id, "restaurantId": restaurant_id},
            target_audience=["WAITER", "KITCHEN", "BAR", "CUSTOMER", "OWNER"],
        )
    except Exception as ws_err:
        print("[WS_BROADCAST_NOTICE] menu_item_deleted:", ws_err)

    return {"success": True, "message": "Menu item deleted"}
