import re
from typing import Optional, Dict, Any
from fastapi import HTTPException, status
from sqlalchemy.ext.asyncio import AsyncSession
from sqlalchemy import select, or_, func

from app.modules.restaurants.models import Restaurant, RestaurantDomain

PLATFORM_DOMAINS = {
    "dinely.food",
    "www.dinely.food",
    "dinely-cd6cd.web.app",
    "dinely-cd6cd.firebaseapp.com",
    "localhost",
    "127.0.0.1",
    "0.0.0.0",
}

RESERVED_SUBDOMAINS = {
    "www",
    "app",
    "api",
    "platform",
    "admin",
    "staging",
    "dev",
    "control",
    "dashboard",
    "auth",
    "mail",
    "status",
}

HOSTNAME_REGEX = re.compile(r"^[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?(\.[a-zA-Z0-9]([a-zA-Z0-9\-]{0,61}[a-zA-Z0-9])?)*$")


async def resolve_public_tenant_from_host(
    hostname: str,
    db: AsyncSession,
    require_live: bool = True
) -> Optional[Dict[str, Any]]:
    """
    Canonical Tenant Resolver for Dinely Multi-Tenant Architecture.
    
    1. Validates hostname
    2. Detects platform domain (returns None for platform context)
    3. Extracts slug from subdomain (*.dinely.food) or custom domain mapping
    4. Queries restaurant and restaurant_domains tables
    5. Verifies restaurant lifecycle status is LIVE (or APPROVED)
    6. Returns complete restaurant context dict
    """
    if not hostname or not isinstance(hostname, str):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Invalid hostname supplied."
        )

    clean_host = hostname.strip().lower()
    # Strip port if present
    if ":" in clean_host:
        clean_host = clean_host.split(":")[0].strip()

    if not HOSTNAME_REGEX.match(clean_host):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Malformed hostname: '{hostname}'."
        )

    # 1. Detect platform domain -> Platform context (no specific tenant)
    if clean_host in PLATFORM_DOMAINS:
        return None

    # 2. Extract slug if subdomain of dinely.food
    extracted_slug = None
    if clean_host.endswith(".dinely.food"):
        sub = clean_host[:-len(".dinely.food")].strip()
        if sub and sub not in RESERVED_SUBDOMAINS:
            extracted_slug = sub
    elif clean_host.endswith(".localhost"):
        sub = clean_host[:-len(".localhost")].strip()
        if sub and sub not in RESERVED_SUBDOMAINS:
            extracted_slug = sub

    # 3. Query database by domain mapping or extracted slug
    rest = None
    
    # Try domain mapping first (by hostname or domain)
    domain_entry = None
    try:
        domain_query = select(RestaurantDomain).where(
            or_(
                func.lower(RestaurantDomain.hostname) == clean_host,
                func.lower(RestaurantDomain.domain) == clean_host,
            ),
            or_(
                RestaurantDomain.is_verified.is_(True),
                RestaurantDomain.verification_status == "VERIFIED"
            )
        )
        domain_result = await db.execute(domain_query)
        domain_entry = domain_result.scalar_one_or_none()
    except Exception:
        domain_entry = None

    if domain_entry:
        rest_query = select(Restaurant).where(
            Restaurant.id == domain_entry.restaurant_id,
            Restaurant.deleted_at.is_(None)
        )
        rest_res = await db.execute(rest_query)
        rest = rest_res.scalar_one_or_none()

    # Fallback to slug matching
    if not rest and extracted_slug:
        slug_query = select(Restaurant).where(
            or_(
                func.lower(Restaurant.public_slug) == extracted_slug,
                func.lower(Restaurant.slug) == extracted_slug,
                Restaurant.id == extracted_slug
            ),
            Restaurant.deleted_at.is_(None)
        )
        slug_res = await db.execute(slug_query)
        rest = slug_res.scalar_one_or_none()

    if not rest:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail=f"Venue not found for domain: '{clean_host}'."
        )

    # 4. Verify restaurant is active / approved / LIVE
    is_live = (
        rest.lifecycle_status in ["LIVE", "APPROVED", "ACTIVE"] or
        (rest.is_approved is True and rest.lifecycle_status not in ["PENDING_APPROVAL", "REJECTED", "ARCHIVED", "SUSPENDED"])
    )

    if require_live and not is_live:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail=f"Venue '{rest.name}' is currently {rest.lifecycle_status} and not accepting public orders."
        )

    pub_slug = rest.public_slug or rest.slug
    canonical_domain = f"https://{pub_slug}.dinely.food"

    return {
        "id": rest.id,
        "name": rest.name,
        "slug": rest.slug,
        "publicSlug": pub_slug,
        "domain": canonical_domain,
        "hostname": clean_host,
        "isTenantSubdomain": True,
        "lifecycleStatus": rest.lifecycle_status,
        "isApproved": rest.is_approved,
        "cuisine": rest.cuisine,
        "businessType": rest.business_type,
        "hasBar": rest.has_bar,
        "hasTables": rest.has_tables,
        "hasKitchen": rest.has_kitchen,
        "hasWaiter": rest.has_waiter,
        "hasInventory": rest.has_inventory,
        "hasBilling": rest.has_billing,
        "enabledModules": rest.enabled_modules,
        "phone": rest.phone,
        "email": rest.email,
        "address": rest.address,
        "currency": rest.currency,
        "taxPercentage": rest.tax_percentage,
        "status": rest.status,
        "upiId": rest.upi_id,
        "upiMerchantName": rest.upi_merchant_name,
        "upiQrUrl": rest.upi_qr_url,
        "upiEnabled": rest.upi_enabled,
        "theme": rest.theme_json,
    }
