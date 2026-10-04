from typing import Optional, List, Dict, Any
from pydantic import BaseModel


class CloseDaySchema(BaseModel):
    closingNotes: Optional[str] = None
    notes: Optional[str] = None
    forceCloseActiveTables: Optional[bool] = False
    forceFinalizeOrders: Optional[bool] = False
    force_close: Optional[bool] = False
    cash_counted: Optional[float] = None


class OpenDaySchema(BaseModel):
    openedBy: Optional[str] = "Manager"
    business_date: Optional[str] = None
    businessDate: Optional[str] = None
    notes: Optional[str] = None


class BusinessDayPrecheckResponse(BaseModel):
    canClose: bool
    can_close_safely: bool = True
    openTablesCount: int = 0
    active_tables_count: int = 0
    activeSessionsCount: int = 0
    active_sessions_count: int = 0
    uncompletedKitchenOrdersCount: int = 0
    uncompletedBarOrdersCount: int = 0
    openOrdersCount: int = 0
    open_orders_count: int = 0
    openWaiterRequestsCount: int = 0
    open_waiter_requests_count: int = 0
    unpaidBillsCount: int = 0
    unpaid_bills_count: int = 0
    totalOrdersToday: int = 0
    total_orders_today: int = 0
    totalSalesToday: float = 0.0
    total_sales_today: float = 0.0
    warnings: List[str] = []
    blocking_reasons: List[Dict[str, Any]] = []

