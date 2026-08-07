import contextvars
from uuid import UUID
from typing import Optional

from fastapi import Request
from sqlalchemy.ext.asyncio import AsyncSession

# Context variable for tenant ID
tenant_context_var: contextvars.ContextVar[Optional[UUID]] = contextvars.ContextVar(
    "tenant_id", default=None
)


class TenantContext:
    def __init__(
        self,
        restaurant_id: Optional[UUID] = None,
        branch_id: Optional[UUID] = None,
        is_platform_admin: bool = False
    ):
        self.restaurant_id = restaurant_id
        self.branch_id = branch_id
        self.is_platform_admin = is_platform_admin

    @property
    def is_cross_tenant(self) -> bool:
        return self.is_platform_admin


def get_current_tenant_id() -> Optional[UUID]:
    try:
        return tenant_context_var.get()
    except LookupError:
        return None


def set_tenant_context(tenant_id: Optional[UUID]) -> None:
    tenant_context_var.set(tenant_id)
