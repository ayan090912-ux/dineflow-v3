from datetime import datetime
from typing import Optional, Any
from sqlalchemy import String, Float, Text, ForeignKey, DateTime, JSON
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database.connection import Base
from app.core.database.base_model import TimestampMixin


class PaymentTransaction(Base, TimestampMixin):
    """
    Authoritative, immutable transaction log for every payment attempt,
    webhook capture, and settlement event across gateways (Razorpay, Cashfree, Direct UPI, Cash/Card).
    Ensures strict idempotency: duplicate webhooks cannot double-credit a bill.
    """
    __tablename__ = "payment_transactions"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    bill_id: Mapped[str] = mapped_column(String(255), ForeignKey("bills.id", ondelete="CASCADE"), nullable=False, index=True)
    restaurant_id: Mapped[str] = mapped_column(String(255), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    gateway: Mapped[str] = mapped_column(String(50), nullable=False)  # RAZORPAY | CASHFREE | DIRECT_UPI | MANUAL_CASH | MANUAL_CARD
    transaction_reference: Mapped[str] = mapped_column(String(150), nullable=False, index=True)
    gateway_order_id: Mapped[Optional[str]] = mapped_column(String(150), nullable=True, index=True)
    gateway_payment_id: Mapped[Optional[str]] = mapped_column(String(150), nullable=True, index=True)
    amount: Mapped[float] = mapped_column(Float, nullable=False)
    currency: Mapped[str] = mapped_column(String(10), default="INR", nullable=False)
    status: Mapped[str] = mapped_column(String(40), default="INITIATED", nullable=False)  # INITIATED | PENDING | CAPTURED | SUCCESS | FAILED | REFUNDED
    payment_method: Mapped[str] = mapped_column(String(50), default="UPI", nullable=False)  # UPI | CARD | NETBANKING | WALLET | CASH
    raw_payload: Mapped[Optional[Any]] = mapped_column(JSON, nullable=True)
    verified_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
