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
        rest = Restaurant(
            id=restaurant_id,
            name="CAFE.CO",
            slug=restaurant_id.lower().replace(" ", "-"),
            cuisine="Fine Dining & Cafe",
            business_type="RESTAURANT",
            has_bar=True,
            has_tables=True,
            has_kitchen=True,
            has_waiter=True,
            order_number_prefix="#ORD",
            address="108 Culinary Boulevard, Fine Dining Strip",
            phone="+1 (555) 987-6543",
            email="contact@cafeco.food",
            owner_name="Cafe Owner",
            owner_email="owner@cafeco.food",
            domain="cafeco.dinely.app",
            is_approved=True,
            status="OPEN",
            currency="INR (₹)",
            tax_percentage=5.0,
            theme_json={
                "restaurantId": restaurant_id,
                "restaurantName": "CAFE.CO",
                "logo": "https://images.unsplash.com/photo-1555396273-367ea4eb4db5?w=200&auto=format&fit=crop&q=80",
                "bannerUrl": "https://images.unsplash.com/photo-1517248135467-4c7edcad34c4?w=1200&auto=format&fit=crop&q=80",
                "primaryColor": "#f43f5e",
                "accentColor": "#fbbf24",
                "currency": "INR (₹)",
            }
        )
        db.add(rest)
        await db.commit()
        await db.refresh(rest)
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
