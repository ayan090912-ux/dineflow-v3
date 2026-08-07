import uuid
from typing import Optional

from sqlalchemy import String, Boolean, ForeignKey, UniqueConstraint
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import Mapped, mapped_column, relationship

from app.core.database.base_model import BaseModel, TenantMixin


class Role(BaseModel, TenantMixin):
    __tablename__ = "roles"
    __table_args__ = (UniqueConstraint("restaurant_id", "name", name="uq_roles_restaurant_name"),)

    name: Mapped[str] = mapped_column(String(100), nullable=False)
    description: Mapped[Optional[str]] = mapped_column(String(500), nullable=True)
    is_system_role: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
    is_default: Mapped[bool] = mapped_column(Boolean, default=False, nullable=False)
