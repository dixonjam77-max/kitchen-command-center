from datetime import datetime
from uuid import UUID
from pydantic import BaseModel


class GroceryListCreate(BaseModel):
    name: str
    store: str | None = None
    notes: str | None = None


class GroceryListUpdate(BaseModel):
    name: str | None = None
    status: str | None = None
    store: str | None = None
    estimated_cost: float | None = None
    notes: str | None = None


class GroceryListItemCreate(BaseModel):
    item_name: str
    quantity: float | None = None
    unit: str | None = None
    category: str | None = None
    pantry_item_id: UUID | None = None
    estimated_price: float | None = None
    source: str | None = None
    notes: str | None = None


class GroceryListItemUpdate(BaseModel):
    item_name: str | None = None
    quantity: float | None = None
    unit: str | None = None
    category: str | None = None
    estimated_price: float | None = None
    checked: bool | None = None
    notes: str | None = None


class GroceryListItemResponse(BaseModel):
    id: UUID
    list_id: UUID
    item_name: str
    canonical_name: str | None
    quantity: float | None
    unit: str | None
    category: str | None
    store_section_order: int | None
    pantry_item_id: UUID | None
    estimated_price: float | None
    checked: bool
    checked_at: datetime | None
    added_to_pantry: bool
    source: str | None
    notes: str | None

    model_config = {"from_attributes": True}


class GroceryListResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    status: str
    store: str | None
    estimated_cost: float | None
    notes: str | None
    items: list[GroceryListItemResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GroceryListSummaryResponse(BaseModel):
    """Lighter response for list views (no nested items)."""
    id: UUID
    user_id: UUID
    name: str
    status: str
    store: str | None
    estimated_cost: float | None
    notes: str | None
    item_count: int = 0
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class GenerateFromPlanRequest(BaseModel):
    start_date: str
    end_date: str
    list_name: str | None = None
