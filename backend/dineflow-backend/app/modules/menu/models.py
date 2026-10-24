import uuid
from datetime import datetime
from typing import Optional, Any
from sqlalchemy import String, Boolean, Float, Text, Integer, ForeignKey, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database.connection import Base
from app.core.database.base_model import TimestampMixin, SoftDeleteMixin

class MenuCategory(Base, TimestampMixin):
    __tablename__ = "menu_categories"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    restaurant_id: Mapped[str] = mapped_column(String(255), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    sort_order: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

class MenuItem(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "menu_items"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    restaurant_id: Mapped[str] = mapped_column(String(255), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id: Mapped[str] = mapped_column(String(255), ForeignKey("menu_categories.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    description: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    price: Mapped[float] = mapped_column(Float, nullable=False)
    image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_available: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_vegetarian: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    dietary_type: Mapped[str] = mapped_column(String(20), default="VEG", nullable=False)  # VEG | NON_VEG | EGG | VEGAN
    target_destination: Mapped[str] = mapped_column(String(20), default="KITCHEN", nullable=False)  # KITCHEN | BAR | HOOKAH
    is_alcoholic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    preparation_time_minutes: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    stock_quantity: Mapped[Optional[int]] = mapped_column(Integer, nullable=True)
    track_inventory: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

    # Global Library provenance & enhanced metadata
    catalogue_item_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    short_description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    cuisine: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    serving_size: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    allergens: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    flavour_profile: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)


class CatalogueItem(Base, TimestampMixin):
    __tablename__ = "global_menu_library"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    aliases: Mapped[Optional[Any]] = mapped_column(JSON, default=list, nullable=True)
    category: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # FOOD | BAR | HOOKAH | DESSERT | BEVERAGE
    subcategory: Mapped[str] = mapped_column(String(100), nullable=False, index=True)
    cuisine: Mapped[str] = mapped_column(String(100), default="Pan-Indian", nullable=False, index=True)
    short_description: Mapped[str] = mapped_column(String(500), nullable=False)
    long_description: Mapped[str] = mapped_column(Text, nullable=False)
    ingredients: Mapped[Optional[Any]] = mapped_column(JSON, default=list, nullable=True)
    preparation_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    dietary_type: Mapped[str] = mapped_column(String(20), default="VEG", nullable=False)  # VEG | NON_VEG | EGG | VEGAN
    is_vegetarian: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    is_vegan: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    contains_egg: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    allergens: Mapped[Optional[Any]] = mapped_column(JSON, default=list, nullable=True)
    serving_size: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    target_destination: Mapped[str] = mapped_column(String(20), default="KITCHEN", nullable=False)  # KITCHEN | BAR | HOOKAH
    is_alcoholic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    preparation_time_minutes: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
    image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    image_attribution: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    flavour_profile: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    suggested_price_inr: Mapped[Optional[float]] = mapped_column(Float, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    version: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    provenance: Mapped[str] = mapped_column(String(100), default="dinely_curated_v1", nullable=False)
