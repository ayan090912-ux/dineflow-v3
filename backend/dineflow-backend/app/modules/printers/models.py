from datetime import datetime
from typing import Optional
from sqlalchemy import String, Boolean, Integer, Text, ForeignKey, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database.connection import Base
from app.core.database.base_model import TimestampMixin


class RestaurantPrinter(Base, TimestampMixin):
    """
    Thermal receipt printer hardware profile associated with a restaurant/tenant.
    Supports Network LAN (TCP Port 9100), USB Bridge Agent, Web Bluetooth, and Browser fallback.
    """
    __tablename__ = "restaurant_printers"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    restaurant_id: Mapped[str] = mapped_column(String(255), ForeignKey("restaurants.id", ondelete="CASCADE"), nullable=False, index=True)
    name: Mapped[str] = mapped_column(String(100), nullable=False)
    connection_type: Mapped[str] = mapped_column(String(50), default="BROWSER", nullable=False)  # BROWSER | NETWORK_LAN | USB_BRIDGE | BLUETOOTH
    ip_address: Mapped[Optional[str]] = mapped_column(String(100), nullable=True)
    port: Mapped[int] = mapped_column(Integer, default=9100, nullable=False)
    bridge_url: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)  # e.g. http://localhost:9191
    paper_width: Mapped[str] = mapped_column(String(20), default="80mm", nullable=False)  # 58mm | 80mm
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    auto_print_on_bill: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    copies: Mapped[int] = mapped_column(Integer, default=1, nullable=False)
    is_active: Mapped[bool] = mapped_column(Boolean, default=True, nullable=False)
    status: Mapped[str] = mapped_column(String(30), default="ONLINE", nullable=False)  # ONLINE | OFFLINE | ERROR
    last_test_printed_at: Mapped[Optional[datetime]] = mapped_column(DateTime(timezone=True), nullable=True)
    last_error_message: Mapped[Optional[str]] = mapped_column(Text, nullable=True)
