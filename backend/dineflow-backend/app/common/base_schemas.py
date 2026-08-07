from datetime import datetime
from typing import Optional, List, Generic, TypeVar
from uuid import UUID

from pydantic import BaseModel, ConfigDict


class TimestampedSchema(BaseModel):
    model_config = ConfigDict(from_attributes=True)

    id: UUID
    created_at: datetime
    updated_at: datetime


class SoftDeletedSchema(TimestampedSchema):
    deleted_at: Optional[datetime] = None


T = TypeVar("T")


class PaginatedResponse(BaseModel, Generic[T]):
    data: List[T]
    pagination: dict


class PaginationParams(BaseModel):
    page: int = 1
    size: int = 20
    sort: Optional[str] = None
