from datetime import date, datetime
from uuid import UUID
from pydantic import BaseModel


class KitchenToolCreate(BaseModel):
    name: str
    category: str | None = None
    brand: str | None = None
    model: str | None = None
    condition: str | None = None
    location: str | None = None
    purchase_date: date | None = None
    capabilities: list[str] = []
    maintenance_interval_days: int | None = None
    maintenance_type: str | None = None
    notes: str | None = None


class KitchenToolUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    brand: str | None = None
    model: str | None = None
    condition: str | None = None
    location: str | None = None
    purchase_date: date | None = None
    capabilities: list[str] | None = None
    last_maintained: date | None = None
    maintenance_interval_days: int | None = None
    maintenance_type: str | None = None
    notes: str | None = None


class KitchenToolResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    category: str | None
    brand: str | None
    model: str | None
    condition: str | None
    location: str | None
    purchase_date: date | None
    capabilities: list[str]
    last_maintained: date | None
    maintenance_interval_days: int | None
    maintenance_type: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ToolConsumableCreate(BaseModel):
    consumable_name: str
    quantity: float | None = None
    unit: str | None = None
    min_quantity: float | None = None
    notes: str | None = None


class ToolConsumableUpdate(BaseModel):
    consumable_name: str | None = None
    quantity: float | None = None
    unit: str | None = None
    min_quantity: float | None = None
    notes: str | None = None


class ToolConsumableResponse(BaseModel):
    id: UUID
    tool_id: UUID
    consumable_name: str
    quantity: float | None
    unit: str | None
    min_quantity: float | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MaintenanceRequest(BaseModel):
    notes: str | None = None
