from datetime import date, datetime
from uuid import UUID
from pydantic import BaseModel


class MealPlanCreate(BaseModel):
    plan_date: date
    meal_type: str
    recipe_id: UUID | None = None
    custom_meal: str | None = None
    servings: int | None = None
    notes: str | None = None
    prep_day_group: str | None = None
    sort_order: int | None = None


class MealPlanUpdate(BaseModel):
    plan_date: date | None = None
    meal_type: str | None = None
    recipe_id: UUID | None = None
    custom_meal: str | None = None
    servings: int | None = None
    notes: str | None = None
    completed: bool | None = None
    prep_day_group: str | None = None
    sort_order: int | None = None


class MealPlanResponse(BaseModel):
    id: UUID
    user_id: UUID
    plan_date: date
    meal_type: str
    recipe_id: UUID | None
    custom_meal: str | None
    servings: int | None
    notes: str | None
    completed: bool
    completed_at: datetime | None
    leftover_portions: int | None
    leftover_plan_id: UUID | None
    thaw_reminder_sent: bool
    prep_day_group: str | None
    sort_order: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class MealPlanWithRecipeName(MealPlanResponse):
    """Extended response that includes the recipe name for display."""
    recipe_name: str | None = None


class CompleteMealRequest(BaseModel):
    leftover_portions: int | None = None
    notes: str | None = None


class GenerateMealPlanRequest(BaseModel):
    start_date: date
    end_date: date
    preferred_cuisines: list[str] = []
    max_weeknight_time: int | None = None
    dietary_restrictions: list[str] = []
    meals_per_day: list[str] = ["breakfast", "lunch", "dinner"]
