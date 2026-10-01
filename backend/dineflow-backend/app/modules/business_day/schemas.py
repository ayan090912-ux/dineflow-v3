from typing import Optional, List, Any
from pydantic import BaseModel


class CloseDaySchema(BaseModel):
    closingNotes: Optional[str] = None
    forceCloseActiveTables: Optional[bool] = False
    forceFinalizeOrders: Optional[bool] = False


class OpenDaySchema(BaseModel):
    openedBy: Optional[str] = "Manager"
    notes: Optional[str] = None


class BusinessDayPrecheckResponse(BaseModel):
    canClose: bool
    openTablesCount: int
    activeSessionsCount: int
    uncompletedKitchenOrdersCount: int
    uncompletedBarOrdersCount: int
    openWaiterRequestsCount: int
    unpaidBillsCount: int
    totalOrdersToday: int
    totalSalesToday: float
    warnings: List[str]
