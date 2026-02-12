from datetime import date, datetime
from uuid import UUID
from pydantic import BaseModel


class WasteLogResponse(BaseModel):
    id: UUID
    user_id: UUID
    pantry_item_id: UUID | None
    item_name: str | None
    quantity_wasted: float | None
    unit: str | None
    reason: str | None
    wasted_date: date | None
    estimated_cost: float | None
    notes: str | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class WasteLogCreate(BaseModel):
    item_name: str
    quantity_wasted: float | None = None
    unit: str | None = None
    reason: str | None = None
    estimated_cost: float | None = None
    notes: str | None = None


# ── AI request/response schemas ──────────────────────────────────

class WhatCanIMakeRequest(BaseModel):
    dietary_restrictions: list[str] = []
    max_time_minutes: int | None = None
    preferred_cuisine: str | None = None
    meal_type: str | None = None


class SubstitutionRequest(BaseModel):
    missing_ingredient: str
    recipe_id: str


class SeasonalRequest(BaseModel):
    month: int | None = None  # defaults to current month


class PantryForecastRequest(BaseModel):
    start_date: str | None = None
    end_date: str | None = None


class FreshnessScanRequest(BaseModel):
    force_ai: bool = False  # Force AI even when rules exist
