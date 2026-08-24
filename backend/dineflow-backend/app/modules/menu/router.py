from typing import Optional, List
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database.connection import get_db
from app.modules.menu.models import MenuCategory, MenuItem

router = APIRouter()

class CreateMenuItemSchema(BaseModel):
    id: Optional[str] = None
    categoryId: str
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

    return {
        "categories": categories,
        "items": items
    }

@router.post("/{restaurant_id}/menu", status_code=status.HTTP_201_CREATED)
async def create_menu_item(restaurant_id: str, payload: CreateMenuItemSchema, db: AsyncSession = Depends(get_db)):
    item_id = payload.id or f"item-{restaurant_id}-{int(datetime.utcnow().timestamp() * 1000)}"
    img = payload.imageUrl or payload.image or "https://images.unsplash.com/photo-1544025162-d76694265947?w=600"
    
    new_item = MenuItem(
        id=item_id,
        restaurant_id=restaurant_id,
        category_id=payload.categoryId,
        name=payload.name,
        description=payload.description or "",
        price=payload.price,
        image_url=img,
        is_available=payload.isAvailable if payload.isAvailable is not None else True,
        is_vegetarian=payload.isVegetarian if payload.isVegetarian is not None else True,
        dietary_type="VEG" if payload.isVegetarian else "NON_VEG",
        target_destination=payload.targetDestination or "KITCHEN",
    )
    db.add(new_item)
    await db.commit()
    await db.refresh(new_item)
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
    return {"success": True, "message": "Menu item deleted"}
