import uuid
from datetime import datetime, timezone
from typing import Optional
from sqlalchemy import String, Boolean, DateTime, ForeignKey, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database.connection import Base
from app.core.database.base_model import TimestampMixin

class Terminal(Base, TimestampMixin):
    __tablename__ = "terminals"
    __table_args__ = (
        UniqueConstraint("restaurant_id", "terminal_code", name="uq_restaurant_terminal_code"),
    )

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    restaurant_id: Mapped[str] = mapped_column(String(255), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    terminal_code: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    terminal_type: Mapped[str] = mapped_column(String(50), default="WAITER", nullable=False)
    device_info: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    pairing_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="ACTIVE", nullable=False)
    ip_address: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    last_active_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
