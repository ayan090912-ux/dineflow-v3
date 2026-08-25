import uuid
from datetime import datetime
from typing import Optional, Any
from sqlalchemy import String, Boolean, Float, Text, Integer, ForeignKey, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database.connection import Base
from app.core.database.base_model import TimestampMixin

class Order(Base, TimestampMixin):
    __tablename__ = "orders"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    restaurant_id: Mapped[str] = mapped_column(String(255), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    table_id: Mapped[Optional[str]] = mapped_column(String(255), ForeignKey("tables.id", ondelete="SET NULL"), nullable=True, index=True)
    table_number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    table_session_id: Mapped[Optional[str]] = mapped_column(String(255), ForeignKey("table_sessions.id", ondelete="SET NULL"), nullable=True, index=True)

    status: Mapped[str] = mapped_column(String(30), default="PENDING", nullable=False, index=True)  # PENDING | ACCEPTED | PREPARING | READY | COMPLETED | CANCELLED
    kitchen_status: Mapped[Optional[str]] = mapped_column(String(30), default="PENDING", nullable=True)
    bar_status: Mapped[Optional[str]] = mapped_column(String(30), default="PENDING", nullable=True)
    customer_name: Mapped[Optional[str]] = mapped_column(String(255), default="Guest", nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    subtotal: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    tax_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    total_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    order_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    estimated_prep_time_minutes: Mapped[Optional[int]] = mapped_column(Integer, default=15, nullable=True)
    eta_target_timestamp: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    items_json: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    tax_breakdown_json: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)


class OrderItem(Base, TimestampMixin):
    __tablename__ = "order_items"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    order_id: Mapped[str] = mapped_column(String(255), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    menu_item_id: Mapped[str] = mapped_column(String(255), nullable=False)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unit_price: Mapped[float] = mapped_column(Float, nullable=False)
    subtotal: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    target_destination: Mapped[Optional[str]] = mapped_column(String(20), default="KITCHEN", nullable=True)

class Bill(Base, TimestampMixin):
    __tablename__ = "bills"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    restaurant_id: Mapped[str] = mapped_column(String(255), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    table_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    table_number: Mapped[str] = mapped_column(String(50), nullable=False)
    table_session_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    subtotal: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    tax_percentage: Mapped[float] = mapped_column(Float, default=5.0, nullable=False)
    tax_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    grand_total: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    payment_status: Mapped[str] = mapped_column(String(20), default="UNPAID", nullable=False)  # UNPAID | PAID
    payment_method: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    tax_breakdown_json: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)

