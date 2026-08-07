from fastapi import Depends, HTTPException, status
from typing import List

from app.core.security.jwt import TokenPayload, decode_access_token


class RBACError(HTTPException):
    def __init__(self, detail: str = "Insufficient permissions"):
        super().__init__(status_code=status.HTTP_403_FORBIDDEN, detail=detail)


def require_permission(permission: str):
    async def _check_permission(current_user: TokenPayload = Depends(get_current_user)):
        if current_user.scope == "platform":
            if permission.startswith("platform:"):
                return current_user
            raise RBACError("Platform admin access required")

        if current_user.scope == "restaurant":
            if current_user.permissions and permission in current_user.permissions:
                return current_user
            raise RBACError(f"Missing permission: {permission}")

        raise RBACError("Invalid token scope")
    return _check_permission


def require_any_permission(permissions: List[str]):
    async def _check_permissions(current_user: TokenPayload = Depends(get_current_user)):
        if current_user.scope == "platform":
            return current_user
        if current_user.scope == "restaurant":
            if current_user.permissions and any(p in current_user.permissions for p in permissions):
                return current_user
        raise RBACError(f"Missing one of required permissions: {permissions}")
    return _check_permissions


def require_platform_admin(current_user: TokenPayload = Depends(get_current_user)):
    if current_user.scope != "platform":
        raise RBACError("Platform admin access required")
    return current_user


# Placeholder - will be implemented with actual token extraction
async def get_current_user() -> TokenPayload:
    # This is a stub - actual implementation uses HTTP Bearer token
    raise HTTPException(status_code=401, detail="Not authenticated")
