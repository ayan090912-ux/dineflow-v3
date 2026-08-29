import uuid
from datetime import datetime
from typing import Optional, Any
from sqlalchemy import String, Boolean, Float, Text, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database.connection import Base
from app.core.database.base_model import TimestampMixin, SoftDeleteMixin

class Restaurant(Base, TimestampMixin, SoftDeleteMixin):
    __tablename__ = "restaurants"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    org_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    slug: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    cuisine: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    business_type: Mapped[str] = mapped_column(String(50), default="RESTAURANT", nullable=False)
    has_bar: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    has_tables: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    has_kitchen: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    has_waiter: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    order_number_prefix: Mapped[str] = mapped_column(String(20), default="#ORD", nullable=False)
    address: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    phone: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    owner_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    owner_email: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    domain: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    is_approved: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    status: Mapped[str] = mapped_column(String(20), default="OPEN", nullable=False)
    currency: Mapped[str] = mapped_column(String(20), default="INR (₹)", nullable=False)
    tax_percentage: Mapped[float] = mapped_column(Float, default=5.0, nullable=False)
    legal_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    state: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    state_code: Mapped[Optional[str]] = mapped_column(String(10), nullable=True)
    gstin: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    pan: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    invoice_prefix: Mapped[str] = mapped_column(String(20), default="INV-", nullable=False)
    invoice_starting_number: Mapped[int] = mapped_column(Float, default=1001, nullable=False)
    service_charge_percentage: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    service_charge_enabled: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    upi_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    upi_merchant_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    upi_qr_url: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    upi_enabled: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    billing_settings_json: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    theme_json: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
