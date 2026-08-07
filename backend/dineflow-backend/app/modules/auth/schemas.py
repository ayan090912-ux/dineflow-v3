from datetime import datetime
from typing import Optional, List
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, ConfigDict


# Platform Admin
class PlatformAdminLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)


class PlatformAdminResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    email: str
    full_name: Optional[str]
    is_active: bool


# Staff
class StaffLoginRequest(BaseModel):
    email: EmailStr
    password: str = Field(..., min_length=8)


class StaffRegisterRequest(BaseModel):
    invite_token: str
    full_name: str = Field(..., min_length=1, max_length=255)
    password: str = Field(..., min_length=8)
    password_confirm: str = Field(..., min_length=8)


class StaffUserResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    restaurant_id: UUID
    branch_id: Optional[UUID]
    role: str
    full_name: str
    email: str
    permissions: List[str]


# Customer Session
class CustomerSessionRequest(BaseModel):
    qr_token: str


class CustomerSessionResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    restaurant_id: UUID
    table_id: UUID
    table_label: str
    restaurant_name: str
    expires_at: datetime


# OTP
class OTPRequest(BaseModel):
    phone: str = Field(..., pattern=r"^\+?[1-9]\d{1,14}$")


class OTPVerifyRequest(BaseModel):
    phone: str = Field(..., pattern=r"^\+?[1-9]\d{1,14}$")
    otp: str = Field(..., min_length=4, max_length=6)


class CustomerResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    phone: str
    full_name: Optional[str]
    loyalty_points: int
    total_visits: int


# Token Management
class TokenRefreshRequest(BaseModel):
    refresh_token: str


class TokenResponse(BaseModel):
    access_token: str
    refresh_token: str
    token_type: str = "bearer"
    expires_in: int


class AuthMeResponse(BaseModel):
    id: UUID
    type: str  # platform_admin | user | customer
    scope: str
    restaurant_id: Optional[UUID]
    branch_id: Optional[UUID]
    role: Optional[str]
    permissions: List[str]
    full_name: Optional[str]
    email: Optional[str]
