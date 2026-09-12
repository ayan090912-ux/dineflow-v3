from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Float, Text, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database.connection import Base
from app.core.database.base_model import TimestampMixin


class SupplierModel(Base, TimestampMixin):
    __tablename__ = "suppliers"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    restaurant_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    contact_person: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    supply_category: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class InventoryItemModel(Base, TimestampMixin):
    __tablename__ = "inventory_items"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    restaurant_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    category: Mapped[str] = mapped_column(String(100), default="Pantry", nullable=False)
    station: Mapped[str] = mapped_column(String(50), default="KITCHEN", nullable=False)  # KITCHEN | BAR
    quantity: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    unit: Mapped[str] = mapped_column(String(50), default="kg", nullable=False)
    min_threshold: Mapped[float] = mapped_column(Float, default=2.0, nullable=False)
    cost_per_unit: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    supplier_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    supplier_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    supplier_contact: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    storage_location: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    last_restocked: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="IN_STOCK", nullable=False)  # IN_STOCK | LOW_STOCK | OUT_OF_STOCK
