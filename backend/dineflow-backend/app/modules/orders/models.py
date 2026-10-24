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
    business_day_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)

    status: Mapped[str] = mapped_column(String(30), default="PENDING", nullable=False, index=True)  # PENDING | ACCEPTED | PREPARING | READY | COMPLETED | CANCELLED
    kitchen_status: Mapped[Optional[str]] = mapped_column(String(30), default="PENDING", nullable=True, index=True)
    bar_status: Mapped[Optional[str]] = mapped_column(String(30), default="PENDING", nullable=True, index=True)
    hookah_status: Mapped[Optional[str]] = mapped_column(String(30), default=None, nullable=True, index=True)
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
    order_type: Mapped[Optional[str]] = mapped_column(String(50), default="DINE_IN", nullable=True)  # DINE_IN | PICKUP | WEDDING_EVENT | EVENT_ORDER
    event_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    event_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    idempotency_key: Mapped[Optional[str]] = mapped_column(String(255), nullable=True, index=True)
    claimed_by: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    delivery_status: Mapped[Optional[str]] = mapped_column(String(50), default="PENDING", nullable=True)
    delivered_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    pickup_code: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    pickup_status: Mapped[Optional[str]] = mapped_column(String(50), default="UNCLAIMED", nullable=True, index=True)  # UNCLAIMED | REDEEMED
    claimed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    payment_status: Mapped[Optional[str]] = mapped_column(String(40), default="UNPAID", nullable=True)  # UNPAID | PAID
    payment_method: Mapped[Optional[str]] = mapped_column(String(50), default="CASH", nullable=True)


class OrderItem(Base, TimestampMixin):
    __tablename__ = "order_items"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    order_id: Mapped[str] = mapped_column(String(255), ForeignKey("orders.id", ondelete="CASCADE"), nullable=False, index=True)
    menu_item_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(255), nullable=False)
    quantity: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    unit_price: Mapped[float] = mapped_column(Float, nullable=False)
    subtotal: Mapped[float] = mapped_column(Float, nullable=False)
    notes: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    target_destination: Mapped[Optional[str]] = mapped_column(String(20), default="KITCHEN", nullable=True, index=True)

class Bill(Base, TimestampMixin):
    __tablename__ = "bills"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    restaurant_id: Mapped[str] = mapped_column(String(255), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    table_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    table_number: Mapped[str] = mapped_column(String(50), nullable=False)
    table_session_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    business_day_id: Mapped[Optional[str]] = mapped_column(String(255), ForeignKey("business_days.id", ondelete="SET NULL"), nullable=True, index=True)
    paid_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    invoice_number: Mapped[Optional[str]] = mapped_column(String(50), nullable=True, index=True)
    subtotal: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    discount_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    discount_percentage: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    service_charge_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    service_charge_percentage: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    tax_percentage: Mapped[float] = mapped_column(Float, default=5.0, nullable=False)
    tax_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    round_off_amount: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    grand_total: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="OPEN", nullable=False)  # OPEN | BILL_REQUESTED | PAYMENT_PENDING | PAID | CLOSED | CANCELLED
    payment_status: Mapped[str] = mapped_column(String(40), default="UNPAID", nullable=False)  # UNPAID | PAYMENT_PENDING | PAYMENT_VERIFICATION_REQUIRED | PAID | FAILED
    payment_method: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    payment_verified_by: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    payment_reference: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    tax_breakdown_json: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    items_snapshot_json: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    orders_snapshot_json: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)

    # Dynamic Payment Gateway & UPI QR Tracking
    payment_gateway: Mapped[Optional[str]] = mapped_column(String(50), nullable=True)
    gateway_order_id: Mapped[Optional[str]] = mapped_column(String(150), nullable=True, index=True)
    gateway_payment_id: Mapped[Optional[str]] = mapped_column(String(150), nullable=True, index=True)
    gateway_qr_id: Mapped[Optional[str]] = mapped_column(String(150), nullable=True)
    payment_qr_payload: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
    amount_paid: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    amount_due: Mapped[float] = mapped_column(Float, default=0.0, nullable=False)
    payment_initiated_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    payment_expires_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)

    # Thermal Printer Tracking
    print_count: Mapped[int] = mapped_column(Integer, default=0, nullable=False)
    last_printed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    printer_id: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    payment_webhook_events_json: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)


