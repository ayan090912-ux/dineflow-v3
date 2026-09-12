from typing import Optional
from datetime import datetime
from pydantic import BaseModel, Field, ConfigDict


class CreateInventoryItemSchema(BaseModel):
    restaurantId: Optional[str] = None
    restaurant_id: Optional[str] = None
    name: str = Field(..., min_length=1)
    category: Optional[str] = "Pantry"
    station: Optional[str] = "KITCHEN"
    quantity: float = 0.0
    unit: Optional[str] = "kg"
    minThreshold: Optional[float] = 2.0
    min_threshold: Optional[float] = None
    costPerUnit: Optional[float] = 0.0
    cost_per_unit: Optional[float] = None
    supplierId: Optional[str] = None
    supplier_id: Optional[str] = None
    supplierName: Optional[str] = None
    supplier_name: Optional[str] = None
    supplierContact: Optional[str] = None
    supplier_contact: Optional[str] = None
    storageLocation: Optional[str] = None
    storage_location: Optional[str] = None


class UpdateInventoryItemSchema(BaseModel):
    name: Optional[str] = None
    category: Optional[str] = None
    station: Optional[str] = None
    quantity: Optional[float] = None
    unit: Optional[str] = None
    minThreshold: Optional[float] = None
    min_threshold: Optional[float] = None
    costPerUnit: Optional[float] = None
    cost_per_unit: Optional[float] = None
    supplierId: Optional[str] = None
    supplier_id: Optional[str] = None
    supplierName: Optional[str] = None
    supplier_name: Optional[str] = None
    supplierContact: Optional[str] = None
    supplier_contact: Optional[str] = None
    storageLocation: Optional[str] = None
    storage_location: Optional[str] = None
    status: Optional[str] = None


class AdjustStockSchema(BaseModel):
    delta: float


class InventoryItemResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    restaurantId: str
    name: str
    category: str
    station: str
    quantity: float
    unit: str
    minThreshold: float
    costPerUnit: float
    lastRestocked: Optional[str] = None
    status: str
    supplierId: Optional[str] = None
    supplierName: Optional[str] = None
    supplierContact: Optional[str] = None
    storageLocation: Optional[str] = None


class CreateSupplierSchema(BaseModel):
    restaurantId: Optional[str] = None
    restaurant_id: Optional[str] = None
    name: str = Field(..., min_length=1)
    contactPerson: Optional[str] = None
    contact_person: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    supplyCategory: Optional[str] = None
    supply_category: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None


class SupplierResponse(BaseModel):
    model_config = ConfigDict(from_attributes=True)
    id: str
    restaurantId: str
    name: str
    contactPerson: Optional[str] = None
    phone: Optional[str] = None
    email: Optional[str] = None
    supplyCategory: Optional[str] = None
    address: Optional[str] = None
    notes: Optional[str] = None
    createdAt: str
