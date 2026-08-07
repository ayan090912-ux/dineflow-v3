from fastapi import APIRouter, Depends, HTTPException, status, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.core.database.connection import get_db
from app.modules.auth.schemas import (
    PlatformAdminLoginRequest,
    StaffLoginRequest,
    StaffRegisterRequest,
    CustomerSessionRequest,
    OTPRequest,
    OTPVerifyRequest,
    TokenRefreshRequest,
    TokenResponse,
    PlatformAdminResponse,
    StaffUserResponse,
    AuthMeResponse
)
from app.modules.auth.service import AuthService

router = APIRouter()


@router.post("/platform/login", response_model=TokenResponse)
async def platform_admin_login(
    request: Request,
    login_data: PlatformAdminLoginRequest,
    db: AsyncSession = Depends(get_db)
):
    service = AuthService(db)
    try:
        access_token, refresh_token, admin = await service.platform_admin_login(
            email=login_data.email,
            password=login_data.password,
            ip_address=request.client.host if request.client else None,
            user_agent=request.headers.get("user-agent")
        )
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=900
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


@router.post("/staff/login", response_model=TokenResponse)
async def staff_login(
    request: Request,
    login_data: StaffLoginRequest,
    db: AsyncSession = Depends(get_db)
):
    # TODO: Implement staff login
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Staff login coming in Sprint 1")


@router.post("/staff/register", response_model=TokenResponse)
async def staff_register(
    request: Request,
    register_data: StaffRegisterRequest,
    db: AsyncSession = Depends(get_db)
):
    # TODO: Implement staff registration
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Staff registration coming in Sprint 1")


@router.post("/customer/session", response_model=TokenResponse)
async def customer_session(
    request: Request,
    session_data: CustomerSessionRequest,
    db: AsyncSession = Depends(get_db)
):
    # TODO: Implement customer session
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Customer session coming in Sprint 1")


@router.post("/customer/otp/request")
async def request_otp(
    request: Request,
    otp_data: OTPRequest,
    db: AsyncSession = Depends(get_db)
):
    # TODO: Implement OTP request
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="OTP coming in Sprint 1")


@router.post("/customer/otp/verify")
async def verify_otp(
    request: Request,
    otp_data: OTPVerifyRequest,
    db: AsyncSession = Depends(get_db)
):
    # TODO: Implement OTP verify
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="OTP coming in Sprint 1")


@router.post("/refresh", response_model=TokenResponse)
async def refresh_token(
    refresh_data: TokenRefreshRequest,
    db: AsyncSession = Depends(get_db)
):
    service = AuthService(db)
    try:
        access_token, refresh_token = await service.refresh_token(refresh_data.refresh_token)
        return TokenResponse(
            access_token=access_token,
            refresh_token=refresh_token,
            expires_in=900
        )
    except ValueError as e:
        raise HTTPException(status_code=status.HTTP_401_UNAUTHORIZED, detail=str(e))


@router.post("/logout", status_code=status.HTTP_204_NO_CONTENT)
async def logout(
    refresh_data: TokenRefreshRequest,
    db: AsyncSession = Depends(get_db)
):
    service = AuthService(db)
    await service.logout(refresh_data.refresh_token)
    return None


@router.post("/logout-all", status_code=status.HTTP_204_NO_CONTENT)
async def logout_all(
    refresh_data: TokenRefreshRequest,
    db: AsyncSession = Depends(get_db)
):
    # TODO: Implement logout-all
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Logout-all coming in Sprint 1")


@router.get("/me", response_model=AuthMeResponse)
async def get_me():
    # TODO: Implement /me endpoint
    raise HTTPException(status_code=status.HTTP_501_NOT_IMPLEMENTED, detail="Auth me coming in Sprint 1")
