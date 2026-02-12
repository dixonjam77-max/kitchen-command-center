from datetime import date, datetime
from uuid import UUID
from pydantic import BaseModel


class PantryItemCreate(BaseModel):
    name: str
    category: str | None = None
    subcategory: str | None = None
    quantity: float | None = None
    unit: str | None = None
    location: str | None = None
    brand: str | None = None
    expiration_date: date | None = None
    opened_date: date | None = None
    purchase_date: date | None = None
    min_quantity: float | None = None
    is_staple: bool = False
    preferred_brand: str | None = None
    batch_info: str | None = None
    notes: str | None = None


class PantryItemUpdate(BaseModel):
    name: str | None = None
    category: str | None = None
    subcategory: str | None = None
    quantity: float | None = None
    unit: str | None = None
    location: str | None = None
    brand: str | None = None
    expiration_date: date | None = None
    opened_date: date | None = None
    purchase_date: date | None = None
    freshness_status: str | None = None
    freshness_expires_at: date | None = None
    min_quantity: float | None = None
    is_staple: bool | None = None
    preferred_brand: str | None = None
    batch_info: str | None = None
    notes: str | None = None


class PantryItemResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    canonical_name: str | None
    category: str | None
    subcategory: str | None
    quantity: float | None
    unit: str | None
    location: str | None
    brand: str | None
    expiration_date: date | None
    opened_date: date | None
    purchase_date: date | None
    freshness_status: str | None
    freshness_expires_at: date | None
    min_quantity: float | None
    is_staple: bool
    preferred_brand: str | None
    batch_info: str | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class AdjustQuantityRequest(BaseModel):
    amount: float


class WasteRequest(BaseModel):
    quantity_wasted: float | None = None
    unit: str | None = None
    reason: str | None = None
    notes: str | None = None
