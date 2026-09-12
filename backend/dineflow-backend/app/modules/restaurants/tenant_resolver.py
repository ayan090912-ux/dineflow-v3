"""
Delegates to the canonical tenant resolver in app/core/tenant/resolver.py.
"""
from typing import Optional, Dict, Any
from sqlalchemy.ext.asyncio import AsyncSession
from app.core.tenant.resolver import (
    resolve_public_tenant,
    resolve_tenant,
    TenantResolutionMode,
    ResolvedTenantContext,
    PLATFORM_DOMAINS,
    RESERVED_SUBDOMAINS,
)

async def resolve_public_tenant_from_host(
    hostname: str,
    db: AsyncSession,
    require_live: bool = True
) -> Optional[Dict[str, Any]]:
    """
    Delegates to canonical resolve_public_tenant.
    """
    ctx = await resolve_public_tenant(db=db, hostname=hostname, allow_platform_root=True)
    if ctx is None:
        return None
    return ctx.raw_restaurant
