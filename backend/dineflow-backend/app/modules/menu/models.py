import uuid
from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, Float, Text, Integer, ForeignKey
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
    dietary_type: Mapped[str] = mapped_column(String(20), default="VEG", nullable=False)  # VEG | NON_VEG | EGG
    target_destination: Mapped[str] = mapped_column(String(20), default="KITCHEN", nullable=False)  # KITCHEN | BAR
    is_alcoholic: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    preparation_time_minutes: Mapped[int] = mapped_column(Integer, default=15, nullable=False)
