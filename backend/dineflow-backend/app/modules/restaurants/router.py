from typing import Optional, Any
from fastapi import APIRouter, Depends, HTTPException, status
from pydantic import BaseModel, Field
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select

from app.core.database.connection import get_db
from app.modules.restaurants.models import Restaurant

router = APIRouter()

class CreateRestaurantSchema(BaseModel):
    id: Optional[str] = None
    name: str
    cuisine: Optional[str] = "Multi-Cuisine"
    businessType: Optional[str] = "RESTAURANT"
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    currency: Optional[str] = "INR (₹)"
    taxPercentage: Optional[float] = 5.0

class UpdateRestaurantSchema(BaseModel):
    name: Optional[str] = None
    cuisine: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    address: Optional[str] = None
    currency: Optional[str] = None
    taxPercentage: Optional[float] = None
    theme: Optional[Any] = None

@router.post("", status_code=status.HTTP_201_CREATED)
async def create_restaurant(payload: CreateRestaurantSchema, db: AsyncSession = Depends(get_db)):
    rest_id = payload.id or f"rest-{int(datetime.utcnow().timestamp() * 1000)}"
    slug = payload.name.lower().replace(" ", "-")

    query = select(Restaurant).where(Restaurant.id == rest_id)
    result = await db.execute(query)
    existing = result.scalar_one_or_none()

    if existing:
        return existing

    new_rest = Restaurant(
        id=rest_id,
        name=payload.name,
        slug=slug,
        cuisine=payload.cuisine or "Multi-Cuisine",
        business_type=payload.businessType or "RESTAURANT",
        phone=payload.phone,
        email=payload.email,
        address=payload.address,
        currency=payload.currency or "INR (₹)",
        tax_percentage=payload.taxPercentage or 5.0,
        is_approved=True,
        status="OPEN",
    )
    db.add(new_rest)
    await db.commit()
    await db.refresh(new_rest)
    return new_rest

@router.get("")
async def get_all_restaurants(db: AsyncSession = Depends(get_db)):
    query = select(Restaurant)
    result = await db.execute(query)
    rests = result.scalars().all()
    return rests

@router.get("/{restaurant_id}")
async def get_restaurant(restaurant_id: str, db: AsyncSession = Depends(get_db)):
    query = select(Restaurant).where(
        (Restaurant.id == restaurant_id) | (Restaurant.slug == restaurant_id)
    )
    result = await db.execute(query)
    rest = result.scalar_one_or_none()
    if not rest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Restaurant not found")
    return rest

@router.put("/{restaurant_id}")
async def update_restaurant(restaurant_id: str, payload: UpdateRestaurantSchema, db: AsyncSession = Depends(get_db)):
    query = select(Restaurant).where(Restaurant.id == restaurant_id)
    result = await db.execute(query)
    rest = result.scalar_one_or_none()
    if not rest:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Restaurant not found")

    if payload.name:
        rest.name = payload.name
    if payload.cuisine:
        rest.cuisine = payload.cuisine
    if payload.phone:
        rest.phone = payload.phone
    if payload.email:
        rest.email = payload.email
    if payload.address:
        rest.address = payload.address
    if payload.currency:
        rest.currency = payload.currency
    if payload.taxPercentage is not None:
        rest.tax_percentage = payload.taxPercentage
    if payload.theme is not None:
        rest.theme_json = payload.theme

    await db.commit()
    await db.refresh(rest)
    return rest
