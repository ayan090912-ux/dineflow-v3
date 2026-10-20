from datetime import datetime, timezone
from typing import Optional, Any
from sqlalchemy import String, Boolean, Integer, Text, ForeignKey, DateTime, JSON, UniqueConstraint
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database.connection import Base
from app.core.database.base_model import TimestampMixin

class WeddingAccessRequest(Base, TimestampMixin):
    __tablename__ = "wedding_access_requests"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    applicant_name: Mapped[str] = mapped_column(String(255), nullable=False)
    applicant_email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    applicant_phone: Mapped[str] = mapped_column(String(50), nullable=False)
    wedding_name: Mapped[str] = mapped_column(String(255), nullable=False)
    event_type: Mapped[str] = mapped_column(String(50), default="WEDDING", nullable=False)  # WEDDING, RECEPTION, ENGAGEMENT, SANGEET, ANNIVERSARY, CELEBRATION
    event_date: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # YYYY-MM-DD
    end_date: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # YYYY-MM-DD
    start_time: Mapped[Optional[str]] = mapped_column(String(20), default="18:00", nullable=True)
    end_time: Mapped[Optional[str]] = mapped_column(String(20), default="23:30", nullable=True)
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Kolkata", nullable=False)
    service_days: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    start_datetime_utc: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    end_datetime_utc: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    venue_name: Mapped[str] = mapped_column(String(255), nullable=False)
    venue_city: Mapped[str] = mapped_column(String(100), nullable=False)
    estimated_guest_count: Mapped[int] = mapped_column(Integer, default=100, nullable=False)
    catering_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    catering_restaurant_id: Mapped[Optional[str]] = mapped_column(String(255), ForeignKey("restaurants.id", ondelete="SET NULL"), nullable=True)
    additional_requirements: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    lifecycle_status: Mapped[str] = mapped_column(String(50), default="SUBMITTED", nullable=False, index=True)  # SUBMITTED, UNDER_REVIEW, APPROVED, REJECTED, WITHDRAWN
    review_notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    reviewed_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    reviewed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    workspace_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)


class WeddingWorkspace(Base, TimestampMixin):
    __tablename__ = "wedding_workspaces"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    request_id: Mapped[Optional[str]] = mapped_column(String(255), ForeignKey("wedding_access_requests.id", ondelete="SET NULL"), nullable=True)
    owner_email: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    owner_uid: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    restaurant_id: Mapped[str] = mapped_column(String(255), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    event_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="ACTIVE", nullable=False)  # ACTIVE, SUSPENDED, ARCHIVED


class WeddingEvent(Base, TimestampMixin):
    __tablename__ = "wedding_events"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    workspace_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    organizer_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    restaurant_id: Mapped[str] = mapped_column(String(255), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    title: Mapped[str] = mapped_column(String(255), nullable=False)
    couple_names: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    event_type: Mapped[str] = mapped_column(String(50), default="WEDDING", nullable=False)  # WEDDING, RECEPTION, BIRTHDAY, CORPORATE, PARTY, ANNIVERSARY, GALA, OTHER
    event_date: Mapped[str] = mapped_column(String(50), nullable=False, index=True)  # YYYY-MM-DD
    end_date: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)  # YYYY-MM-DD
    start_time: Mapped[Optional[str]] = mapped_column(String(20), default="18:00", nullable=True)
    end_time: Mapped[Optional[str]] = mapped_column(String(20), default="23:30", nullable=True)
    timezone: Mapped[str] = mapped_column(String(50), default="Asia/Kolkata", nullable=False)
    service_days: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    start_datetime_utc: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    end_datetime_utc: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True, index=True)
    auto_activate: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    extended_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    extended_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    extended_reason: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    original_end_datetime_utc: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    venue_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    welcome_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    theme_color: Mapped[str] = mapped_column(String(50), default="champagne", nullable=False)  # champagne, ivory_gold, blush_rose, emerald_elegance, burgundy_velvet, midnight_navy
    cover_image_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(30), default="DRAFT", nullable=False, index=True)  # DRAFT, PENDING_APPROVAL, APPROVED_SETUP_PENDING, SCHEDULED, ACTIVE, PAUSED, CLOSED, COMPLETED, CANCELLED
    is_ordering_open: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    has_food: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    has_bar: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    has_hookah: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    has_table_assistance: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    alcohol_policy_notes: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
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


class EventAssistanceRequest(Base, TimestampMixin):
    __tablename__ = "event_assistance_requests"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    event_id: Mapped[str] = mapped_column(String(255), ForeignKey("wedding_events.id", ondelete="CASCADE"), nullable=False, index=True)
    restaurant_id: Mapped[str] = mapped_column(String(255), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    table_number: Mapped[str] = mapped_column(String(50), nullable=False, index=True)
    table_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    request_items: Mapped[Any] = mapped_column(JSON, nullable=False)
    guest_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    guest_note: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    status: Mapped[str] = mapped_column(String(50), default="NEW", nullable=False, index=True)  # NEW, ACKNOWLEDGED, IN_PROGRESS, COMPLETED, CANCELLED
    assigned_staff_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    assigned_staff_uid: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    acknowledged_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    in_progress_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    completed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
