from enum import Enum
from typing import Optional, List
from pydantic import BaseModel, EmailStr


class RestaurantLifecycleStatus(str, Enum):
    DRAFT = "DRAFT"
    PENDING_APPROVAL = "PENDING_APPROVAL"
    APPROVED = "APPROVED"
    ACTIVE = "ACTIVE"
    LIVE = "LIVE"
    REJECTED = "REJECTED"
    SUSPENDED = "SUSPENDED"
    DEACTIVATED = "DEACTIVATED"
    DELETED = "DELETED"


class BusinessType(str, Enum):
    RESTAURANT = "RESTAURANT"
    BAR = "BAR"
    CAFE = "CAFE"
    FOOD_TRUCK = "FOOD_TRUCK"


class RestaurantCreate(BaseModel):
    name: str
    business_type: Optional[BusinessType] = BusinessType.RESTAURANT
    address: str
    city: str
    contact_email: EmailStr
    contact_number: str
    tables_count: int = 10
    logo_url: Optional[str] = None
    owner_name: Optional[str] = None
    owner_email: Optional[EmailStr] = None


class RestaurantUpdate(BaseModel):
    name: Optional[str] = None
    address: Optional[str] = None
    city: Optional[str] = None
    contact_email: Optional[EmailStr] = None
    contact_number: Optional[str] = None
    tables_count: Optional[int] = None
    logo_url: Optional[str] = None


class ApplicationRejection(BaseModel):
    rejection_reason: str


class RestaurantResponse(BaseModel):
    id: str
    name: str
    business_type: str
    address: str
    city: str
    contact_email: str
    contact_number: str
    tables_count: int
    logo_url: Optional[str] = None
    owner_name: str
    owner_email: str
    is_approved: bool
    lifecycle_status: RestaurantLifecycleStatus
    rejection_reason: Optional[str] = None
    submitted_at: Optional[str] = None
    approved_at: Optional[str] = None

    class Config:
        from_attributes = True
