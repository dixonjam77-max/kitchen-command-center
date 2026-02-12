from datetime import date, datetime
from uuid import UUID
from pydantic import BaseModel


class RecipeIngredientCreate(BaseModel):
    ingredient_name: str
    canonical_name: str | None = None
    quantity: float | None = None
    unit: str | None = None
    preparation: str | None = None
    group_name: str | None = None
    sort_order: int | None = None
    optional: bool = False
    substitutions: str | None = None
    pantry_item_id: UUID | None = None


class RecipeIngredientResponse(BaseModel):
    id: UUID
    recipe_id: UUID
    pantry_item_id: UUID | None
    ingredient_name: str
    canonical_name: str | None
    quantity: float | None
    unit: str | None
    preparation: str | None
    group_name: str | None
    sort_order: int | None
    optional: bool
    substitutions: str | None

    model_config = {"from_attributes": True}


class RecipeToolCreate(BaseModel):
    tool_name: str
    tool_id: UUID | None = None
    optional: bool = False
    notes: str | None = None


class RecipeToolResponse(BaseModel):
    id: UUID
    recipe_id: UUID
    tool_id: UUID | None
    tool_name: str
    optional: bool
    notes: str | None

    model_config = {"from_attributes": True}


class RecipeCreate(BaseModel):
    name: str
    description: str | None = None
    servings: int = 4
    prep_time_minutes: int | None = None
    cook_time_minutes: int | None = None
    total_time_minutes: int | None = None
    instructions: list[dict] | None = None
    source_type: str | None = None
    source_url: str | None = None
    source_attribution: str | None = None
    tags: list[str] = []
    cuisine: str | None = None
    difficulty: str | None = None
    dietary_flags: list[str] = []
    notes: str | None = None
    ingredients: list[RecipeIngredientCreate] = []
    tools: list[RecipeToolCreate] = []


class RecipeUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    servings: int | None = None
    prep_time_minutes: int | None = None
    cook_time_minutes: int | None = None
    total_time_minutes: int | None = None
    instructions: list[dict] | None = None
    source_type: str | None = None
    source_url: str | None = None
    source_attribution: str | None = None
    tags: list[str] | None = None
    cuisine: str | None = None
    difficulty: str | None = None
    dietary_flags: list[str] | None = None
    is_favorite: bool | None = None
    rating: float | None = None
    notes: str | None = None
    ingredients: list[RecipeIngredientCreate] | None = None
    tools: list[RecipeToolCreate] | None = None


class RecipeResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    description: str | None
    servings: int
    prep_time_minutes: int | None
    cook_time_minutes: int | None
    total_time_minutes: int | None
    instructions: list[dict] | None
    source_type: str | None
    source_url: str | None
    source_attribution: str | None
    tags: list[str]
    cuisine: str | None
    difficulty: str | None
    dietary_flags: list[str]
    estimated_calories_per_serving: int | None
    estimated_macros: dict | None
    rating: float | None
    photo_url: str | None
    is_favorite: bool
    version: int
    parent_recipe_id: UUID | None
    notes: str | None
    ingredients: list[RecipeIngredientResponse] = []
    tools: list[RecipeToolResponse] = []
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RecipeListResponse(BaseModel):
    """Lighter response for list views (no nested ingredients/tools)."""
    id: UUID
    user_id: UUID
    name: str
    description: str | None
    servings: int
    total_time_minutes: int | None
    tags: list[str]
    cuisine: str | None
    difficulty: str | None
    dietary_flags: list[str]
    rating: float | None
    photo_url: str | None
    is_favorite: bool
    source_type: str | None
    created_at: datetime

    model_config = {"from_attributes": True}


class CookLogCreate(BaseModel):
    cooked_date: date
    servings_made: int | None = None
    rating: float | None = None
    modifications: str | None = None
    notes: str | None = None
    duration_minutes: int | None = None


class CookLogResponse(BaseModel):
    id: UUID
    recipe_id: UUID
    user_id: UUID
    cooked_date: date
    servings_made: int | None
    rating: float | None
    modifications: str | None
    photo_url: str | None
    notes: str | None
    duration_minutes: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class RecipeCollectionCreate(BaseModel):
    name: str
    description: str | None = None
    sort_order: int | None = None


class RecipeCollectionUpdate(BaseModel):
    name: str | None = None
    description: str | None = None
    sort_order: int | None = None


class RecipeCollectionResponse(BaseModel):
    id: UUID
    user_id: UUID
    name: str
    description: str | None
    sort_order: int | None
    created_at: datetime
    updated_at: datetime

    model_config = {"from_attributes": True}


class ScaleRequest(BaseModel):
    servings: int


class CollectionAddRecipeRequest(BaseModel):
    recipe_id: UUID
    sort_order: int | None = None


# ── AI Request Schemas ────────────────────────────────────────────

class ParseURLRequest(BaseModel):
    url: str


class ParseYouTubeRequest(BaseModel):
    url: str


class ParseImageRequest(BaseModel):
    image_base64: str
    media_type: str = "image/jpeg"


class GenerateRecipeRequest(BaseModel):
    preferred_cuisine: str | None = None
    max_time_minutes: int | None = None
    difficulty: str | None = None
    dietary_restrictions: list[str] = []
    description: str | None = None


class NormalizeIngredientRequest(BaseModel):
    raw: str
