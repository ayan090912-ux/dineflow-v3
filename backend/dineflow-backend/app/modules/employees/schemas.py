from datetime import datetime
from typing import Optional
from uuid import UUID
from pydantic import BaseModel, EmailStr, Field, ConfigDict


class EmployeeInviteRequest(BaseModel):
    email: EmailStr
    full_name: str = Field(..., min_length=1, max_length=255)
    role_id: UUID
    branch_id: Optional[UUID] = None


class EmployeeUpdate(BaseModel):
    role_id: Optional[UUID] = None
    branch_id: Optional[UUID] = None
    employment_status: Optional[str] = None


class EmployeeResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: UUID
    restaurant_id: UUID
    user_id: UUID
    branch_id: Optional[UUID]
    role_id: UUID
    employment_status: str
    invited_at: Optional[datetime]
    joined_at: Optional[datetime]
    created_at: datetime
    updated_at: datetime
