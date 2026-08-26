from typing import Optional
from datetime import datetime
from sqlalchemy import String, Text, DateTime
from sqlalchemy.orm import Mapped, mapped_column
from app.core.database.connection import Base
from app.core.database.base_model import TimestampMixin

class CustomerRequestModel(Base, TimestampMixin):
    __tablename__ = "customer_requests"

    id: Mapped[str] = mapped_column(String(255), primary_key=True)
    restaurant_id: Mapped[str] = mapped_column(String(255), nullable=False, index=True)
    table_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    table_number: Mapped[str] = mapped_column(String(50), nullable=False)

    request_type: Mapped[str] = mapped_column(String(50), default="WATER", nullable=False)
    message: Mapped[str] = mapped_column(Text, nullable=False)
    status: Mapped[str] = mapped_column(String(50), default="PENDING", nullable=False)
    waiter_name: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
    table_session_id: Mapped[Optional[str]] = mapped_column(String(255), nullable=True)
