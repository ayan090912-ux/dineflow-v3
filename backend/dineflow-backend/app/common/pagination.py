from typing import TypeVar, Generic, List, Optional
from pydantic import BaseModel

T = TypeVar("T")


class PaginationParams(BaseModel):
    page: int = 1
    size: int = 20
    sort: Optional[str] = None


class PaginatedResponse(BaseModel, Generic[T]):
    data: List[T]
    page: int
    size: int
    total: int
    total_pages: int
    has_next: bool
    has_prev: bool


def paginate(items: List[T], page: int, size: int, total: int) -> PaginatedResponse[T]:
    total_pages = (total + size - 1) // size
    return PaginatedResponse(
        data=items,
        page=page,
        size=size,
        total=total,
        total_pages=total_pages,
        has_next=page < total_pages,
        has_prev=page > 1
    )
