from datetime import datetime, timezone
from typing import Optional, Any
from sqlalchemy import String, Boolean, Integer, Text, ForeignKey, DateTime, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database.connection import Base
from app.core.database.base_model import TimestampMixin

class WeddingEvent(Base, TimestampMixin):
    __tablename__ = "wedding_events"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    restaurant_id: Mapped[str] = mapped_column(String(255), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    couple_names: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    event_type: Mapped[str] = mapped_column(String(50), default="WEDDING", nullable=False)  # WEDDING, RECEPTION, ENGAGEMENT, SANGEET, ANNIVERSARY, CELEBRATION
    event_date: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # YYYY-MM-DD
    start_time: Mapped[Optional[str]] = mapped_column(String(20), default="18:00", nullable=True)
    end_time: Mapped[Optional[str]] = mapped_column(String(20), default="23:30", nullable=True)
    venue_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    welcome_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    theme_color: Mapped[str] = mapped_column(String(50), default="champagne", nullable=False)  # champagne, ivory_gold, blush_rose, emerald_elegance, burgundy_velvet, midnight_navy
    cover_image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="DRAFT", nullable=False, index=True)  # DRAFT, ACTIVE, PAUSED, COMPLETED, CANCELLED
    is_ordering_open: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    menu_selection_type: Mapped[str] = mapped_column(String(30), default="FULL_MENU", nullable=False)  # FULL_MENU, RESTRICTED
    allowed_category_ids: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    allowed_item_ids: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    estimated_guest_count: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)


class EventTable(Base, TimestampMixin):
    __tablename__ = "event_tables"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(255), ForeignKey("wedding_events.id", ondelete="CASCADE"), nullable=False, index=True)
    restaurant_id: Mapped[str] = mapped_column(String(255), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    table_number: Mapped[str] = mapped_column(String(50), nullable=False)
    table_label: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    capacity: Mapped[int] = mapped_column(Integer, default=8, nullable=False)
    qr_code_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)

    __table_args__ = (
        UniqueConstraint("event_id", "table_number", name="uq_event_table_number"),
    )
