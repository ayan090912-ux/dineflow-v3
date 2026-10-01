import uuid
from datetime import datetime, timezone
from typing import Optional, Any
from sqlalchemy import String, Integer, Float, Text, ForeignKey, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database.connection import Base
from app.core.database.base_model import TimestampMixin


class BusinessDay(Base, TimestampMixin):
    __tablename__ = "business_days"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    restaurant_id: Mapped[str] = mapped_column(
        String(255), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True
    )
    business_date: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    status: Mapped[str] = mapped_column(String(30), default="OPEN", nullable=False, index=True)  # OPEN | CLOSED
    opened_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), default=lambda: datetime.now(timezone.utc), nullable=False)
    opened_by: Mapped[Optional[str]] = mapped_column(String(255), default="System / Manager", nullable=True)
    closed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    closed_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)

    # Operational & Financial Metrics
    total_orders: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    food_orders: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    bar_orders: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    completed_orders: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    cancelled_orders: Mapped[int] = mapped_column(Integer, default=0, nullable=False)

    total_sales: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    food_sales: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    bar_sales: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    tax_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    discount_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    # Payment Breakdown
    cash_sales: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    card_sales: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    upi_sales: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)

    closing_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    summary_json: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
