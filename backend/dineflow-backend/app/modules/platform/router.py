from typing import Dict, Any, List, Optional
from fastapi import APIRouter, Depends, HTTPException, status, Request
from pydantic import BaseModel, Field

from app.core.security.rbac import require_platform_admin, get_current_firebase_admin
from app.modules.admin.audit_service import AdminAuditLogger

router = APIRouter()


class TokenVerificationRequest(BaseModel):
    id_token: Optional[str] = None


class RestaurantStatusAction(BaseModel):
    restaurant_id: str
    reason: Optional[str] = None


class UserStatusAction(BaseModel):
    user_id: str
    reason: Optional[str] = None


@router.post("/verify-token")
async def verify_platform_admin_token(
    request: Request,
    body: Optional[TokenVerificationRequest] = None,
    admin_claims: Dict[str, Any] = Depends(get_current_firebase_admin)
) -> Dict[str, Any]:
    """
    Verifies Firebase ID token and returns authenticated Platform Admin details and claims.
    """
    uid = admin_claims.get("uid") or admin_claims.get("user_id")
    email = admin_claims.get("email")

    AdminAuditLogger.log_action(
        admin_uid=uid,
        action="PLATFORM_ADMIN_VERIFIED",
        target_resource="Control Plane",
        ip_address=request.client.host if request.client else "127.0.0.1"
    )

    return {
        "status": "authorized",
        "authenticated": True,
        "uid": uid,
        "email": email,
        "role": "PLATFORM_ADMIN",
        "custom_claims": {
            "admin": admin_claims.get("admin", True),
            "role": admin_claims.get("role", "PLATFORM_ADMIN")
        }
    }


@router.get("/restaurants")
async def get_all_restaurants(
    admin_claims: Dict[str, Any] = Depends(require_platform_admin)
) -> List[Dict[str, Any]]:
    """
    Protected endpoint to list all platform restaurants.
    """
    return [
        {
            "id": "rest-001",
            "name": "Bella Italia Bistro",
            "ownerEmail": "owner@bellaitalia.com",
            "lifecycleStatus": "LIVE",
            "isApproved": True,
            "createdAt": "2026-01-15T08:00:00Z"
        },
        {
            "id": "rest-002",
            "name": "Tokyo Express Grill",
            "ownerEmail": "owner@tokyoexpress.com",
            "lifecycleStatus": "PENDING_APPROVAL",
            "isApproved": False,
            "createdAt": "2026-02-10T11:30:00Z"
        }
    ]


@router.post("/restaurants/approve")
async def approve_restaurant(
    action: RestaurantStatusAction,
    request: Request,
    admin_claims: Dict[str, Any] = Depends(require_platform_admin)
) -> Dict[str, Any]:
    """
    Approves a restaurant application.
    """
    uid = admin_claims.get("uid") or admin_claims.get("user_id") or "admin"
    AdminAuditLogger.log_action(
        admin_uid=uid,
        action="RESTAURANT_APPROVED",
        target_resource="RESTAURANT",
        target_id=action.restaurant_id,
        ip_address=request.client.host if request.client else "127.0.0.1"
    )
    return {
        "status": "SUCCESS",
        "message": f"Restaurant {action.restaurant_id} approved successfully.",
        "restaurant_id": action.restaurant_id
    }


@router.post("/restaurants/suspend")
async def suspend_restaurant(
    action: RestaurantStatusAction,
    request: Request,
    admin_claims: Dict[str, Any] = Depends(require_platform_admin)
) -> Dict[str, Any]:
    """
    Suspends a restaurant account.
    """
    uid = admin_claims.get("uid") or admin_claims.get("user_id") or "admin"
    AdminAuditLogger.log_action(
        admin_uid=uid,
        action="RESTAURANT_SUSPENDED",
        target_resource="RESTAURANT",
        target_id=action.restaurant_id,
        ip_address=request.client.host if request.client else "127.0.0.1",
        details={"reason": action.reason}
    )
    return {
        "status": "SUCCESS",
        "message": f"Restaurant {action.restaurant_id} suspended successfully.",
        "restaurant_id": action.restaurant_id
    }


@router.post("/users/suspend")
async def suspend_user(
    action: UserStatusAction,
    request: Request,
    admin_claims: Dict[str, Any] = Depends(require_platform_admin)
) -> Dict[str, Any]:
    """
    Suspends a user account.
    """
    uid = admin_claims.get("uid") or admin_claims.get("user_id") or "admin"
    AdminAuditLogger.log_action(
        admin_uid=uid,
        action="USER_SUSPENDED",
        target_resource="USER",
        target_id=action.user_id,
        ip_address=request.client.host if request.client else "127.0.0.1",
        details={"reason": action.reason}
    )
    return {
        "status": "SUCCESS",
        "message": f"User {action.user_id} suspended successfully.",
        "user_id": action.user_id
    }


@router.get("/orders")
async def get_platform_orders(
    admin_claims: Dict[str, Any] = Depends(require_platform_admin)
) -> Dict[str, Any]:
    return {"total_orders": 1250, "platform_volume": 48500.00}


@router.get("/billing")
async def get_platform_billing(
    admin_claims: Dict[str, Any] = Depends(require_platform_admin)
) -> Dict[str, Any]:
    return {"active_subscriptions": 42, "mrr": 8400.00}


@router.get("/analytics")
async def get_platform_analytics(
    admin_claims: Dict[str, Any] = Depends(require_platform_admin)
) -> Dict[str, Any]:
    return {"total_restaurants": 45, "active_users": 380, "system_health": "100% OPERATIONAL"}


@router.get("/audit-logs")
async def get_platform_audit_logs(
    admin_claims: Dict[str, Any] = Depends(require_platform_admin)
) -> List[Dict[str, Any]]:
    """
    Retrieves secure Platform Admin audit logs.
    """
    return AdminAuditLogger.get_logs()
