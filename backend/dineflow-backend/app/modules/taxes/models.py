import uuid
from datetime import datetime
from typing import Optional, Any
from sqlalchemy import String, Boolean, Float, Text, ForeignKey, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database.connection import Base
from app.core.database.base_model import TimestampMixin

class Tax(Base, TimestampMixin):
    __tablename__ = "taxes"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    restaurant_id: Mapped[str] = mapped_column(String(255), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    type: Mapped[str] = mapped_column(String(30), default="PERCENTAGE", nullable=False)  # PERCENTAGE | FIXED
    rate: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    fixed_amount: Mapped[Optional[float]] = mapped_column(Float, default=0.0, nullable=True)
    is_inclusive: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    applies_to: Mapped[str] = mapped_column(String(30), default="ORDER", nullable=False)  # ORDER | CATEGORY | ITEM
    applicable_order_types: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)  # ["DINE_IN", "TAKEAWAY", "DELIVERY"]
    status: Mapped[str] = mapped_column(String(20), default="ACTIVE", nullable=False, index=True)  # ACTIVE | INACTIVE

class TaxCategory(Base, TimestampMixin):
    __tablename__ = "tax_categories"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    tax_id: Mapped[str] = mapped_column(String(255), ForeignKey("taxes.id", ondelete="CASCADE"), nullable=False, index=True)
    category_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

class TaxMenuItem(Base, TimestampMixin):
    __tablename__ = "tax_menu_items"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    tax_id: Mapped[str] = mapped_column(String(255), ForeignKey("taxes.id", ondelete="CASCADE"), nullable=False, index=True)
    menu_item_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)

class InvoiceTaxSnapshot(Base, TimestampMixin):
    __tablename__ = "invoice_taxes"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    bill_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    order_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    tax_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    tax_name_snapshot: Mapped[str] = mapped_column(String(255), nullable=False)
    tax_type_snapshot: Mapped[str] = mapped_column(String(30), nullable=False)
    tax_rate_snapshot: Mapped[float] = mapped_column(Float, nullable=False)
    tax_amount: Mapped[float] = mapped_column(Float, nullable=False)
    is_inclusive: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)

class TaxAuditLog(Base, TimestampMixin):
    __tablename__ = "tax_audit_logs"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    restaurant_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    user_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    action: Mapped[str] = mapped_column(String(50), nullable=False)  # CREATE | UPDATE | ACTIVATE | DEACTIVATE
    tax_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    previous_values: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    new_values: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
