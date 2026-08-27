from typing import Optional, List
from datetime import datetime
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database.connection import get_db
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
    categoryId: Optional[str] = None
    imageUrl: Optional[str] = None
    image: Optional[str] = None
    isAvailable: Optional[bool] = None
    isVegetarian: Optional[bool] = None
    targetDestination: Optional[str] = None

class CreateCategorySchema(BaseModel):
    id: Optional[str] = None
    name: str
    sortOrder: Optional[int] = 1

@router.get("/{restaurant_id}/categories")
async def get_categories(restaurant_id: str, db: AsyncSession = Depends(get_db)):
    query = select(MenuCategory).where(MenuCategory.restaurant_id == restaurant_id).order_by(MenuCategory.sort_order)
    result = await db.execute(query)
    cats = result.scalars().all()
    if not cats:
        categories_data = [
            (f"cat-{restaurant_id}-1", "Starters & Appetizers", 1),
            (f"cat-{restaurant_id}-2", "Main Course", 2),
            (f"cat-{restaurant_id}-3", "Gourmet Desserts", 3),
            (f"cat-{restaurant_id}-4", "Beverages & Drinks", 4),
        ]
        new_cats = []
        for cat_id, cat_name, sort_ord in categories_data:
            c = MenuCategory(
                id=cat_id,
                restaurant_id=restaurant_id,
                name=cat_name,
                sort_order=sort_ord,
                is_enabled=True,
            )
            db.add(c)
            new_cats.append(c)
        await db.commit()
        return new_cats
    return cats

@router.post("/{restaurant_id}/categories", status_code=status.HTTP_201_CREATED)
async def create_category(restaurant_id: str, payload: CreateCategorySchema, db: AsyncSession = Depends(get_db)):
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
    query_cats = select(MenuCategory).where(MenuCategory.restaurant_id == restaurant_id).order_by(MenuCategory.sort_order)
    res_cats = await db.execute(query_cats)
    categories = res_cats.scalars().all()

    query_items = select(MenuItem).where(
        (MenuItem.restaurant_id == restaurant_id) & (MenuItem.deleted_at == None)
    )
    res_items = await db.execute(query_items)
    items = res_items.scalars().all()

    if not items:
        cat1 = f"cat-{restaurant_id}-1"
        cat2 = f"cat-{restaurant_id}-2"
        cat3 = f"cat-{restaurant_id}-3"
        cat4 = f"cat-{restaurant_id}-4"
        if not categories:
            categories = [
                MenuCategory(id=cat1, restaurant_id=restaurant_id, name="Starters & Appetizers", sort_order=1, is_enabled=True),
                MenuCategory(id=cat2, restaurant_id=restaurant_id, name="Main Course", sort_order=2, is_enabled=True),
                MenuCategory(id=cat3, restaurant_id=restaurant_id, name="Gourmet Desserts", sort_order=3, is_enabled=True),
                MenuCategory(id=cat4, restaurant_id=restaurant_id, name="Beverages & Drinks", sort_order=4, is_enabled=True),
            ]
            for c in categories:
                db.add(c)
            await db.commit()

        items_data = [
            (f"item-{restaurant_id}-1", cat1, "Truffle Mushroom Arancini", "Crispy risotto balls stuffed with wild forest mushrooms and aged mozzarella, served with truffle aioli.", 14.50, "https://images.unsplash.com/photo-1541529086526-db283c563270?w=600", True, "KITCHEN"),
            (f"item-{restaurant_id}-2", cat2, "Pan-Seared Salmon Fillet", "Atlantic salmon served over saffron risotto with lemon herb reduction.", 28.90, "https://images.unsplash.com/photo-1467003909585-2f8a72700288?w=600", False, "KITCHEN"),
            (f"item-{restaurant_id}-3", cat3, "Classic Tiramisu", "Layers of espresso-soaked ladyfingers and whipped mascarpone cream.", 9.50, "https://images.unsplash.com/photo-1571877227200-a0d98ea607e9?w=600", True, "KITCHEN"),
            (f"item-{restaurant_id}-4", cat4, "Artisanal Smoked Old Fashioned", "Bourbon whiskey infused with aromatic bitters and oak wood smoke.", 16.00, "https://images.unsplash.com/photo-1514933651103-005eec06c04b?w=600", True, "BAR"),
        ]
        items = []
        for item_id, c_id, name, desc, price, img_url, is_veg, target in items_data:
            m = MenuItem(
                id=item_id,
                restaurant_id=restaurant_id,
                category_id=c_id,
                name=name,
                description=desc,
                price=price,
                image_url=img_url,
                is_available=True,
                is_vegetarian=is_veg,
                dietary_type="VEG" if is_veg else "NON_VEG",
                target_destination=target,
            )
            db.add(m)
            items.append(m)
        await db.commit()

    return {
        "categories": categories,
        "items": items
    }

@router.post("/{restaurant_id}/menu", status_code=status.HTTP_201_CREATED)
async def create_menu_item(restaurant_id: str, payload: CreateMenuItemSchema, db: AsyncSession = Depends(get_db)):
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

    if not cat_obj and target_category_id:
        # Auto-create missing category if categoryId/Name was provided by client
        new_cat_id = f"cat-{restaurant_id}-{payload.categoryId.lower().replace(' ', '_')}"
        cat_obj = MenuCategory(
            id=new_cat_id,
            restaurant_id=restaurant_id,
            name=payload.categoryId,
            sort_order=5,
            is_enabled=True,
        )
        db.add(cat_obj)
        await db.flush()
        target_category_id = cat_obj.id
    elif cat_obj:
        target_category_id = cat_obj.id

    if not cat_obj:
        query_any_cat = select(MenuCategory).where(MenuCategory.restaurant_id == restaurant_id).order_by(MenuCategory.sort_order)
        res_any = await db.execute(query_any_cat)
        existing_cats = res_any.scalars().all()
        if existing_cats:
            cat_obj = existing_cats[0]
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

    item_id = payload.id or f"item-{restaurant_id}-{int(datetime.utcnow().timestamp() * 1000)}"
    img = payload.imageUrl or payload.image or "https://images.unsplash.com/photo-1544025162-d76694265947?w=600"

    dest = (payload.targetDestination or "KITCHEN").upper()
    if not payload.targetDestination:
        lower_name = payload.name.lower()
        if any(w in lower_name for w in ["mojito", "cocktail", "beer", "wine", "drink", "beverage", "whiskey", "vodka", "rum", "mocktail", "shake", "juice"]):
            dest = "BAR"

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
async def update_menu_item(restaurant_id: str, item_id: str, payload: UpdateMenuItemSchema, db: AsyncSession = Depends(get_db)):
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
async def delete_menu_item(restaurant_id: str, item_id: str, db: AsyncSession = Depends(get_db)):
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
