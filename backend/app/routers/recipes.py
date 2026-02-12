import re
from datetime import datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.recipe import (
    Recipe, RecipeIngredient, RecipeTool,
    CookLog,
)
from app.models.pantry import PantryItem
from app.models.tool import KitchenTool
from app.models.user import User
from app.schemas.recipe import (
    RecipeCreate, RecipeUpdate, RecipeResponse, RecipeListResponse,
    CookLogCreate, CookLogResponse, ScaleRequest,
    RecipeIngredientResponse, RecipeToolResponse,
    ParseURLRequest, ParseYouTubeRequest, ParseImageRequest,
    GenerateRecipeRequest, NormalizeIngredientRequest,
)
from app.services.kitchen_ai import get_kitchen_ai
from app.utils.auth import get_current_user
from app.utils.pagination import paginate

router = APIRouter()


def _make_canonical(name: str) -> str:
    name = re.sub(r"\(.*?\)", "", name)
    name = re.sub(r",.*$", "", name)
    return name.strip().lower()


def _get_recipe(db: Session, recipe_id: UUID, user_id) -> Recipe:
    recipe = db.query(Recipe).options(
        joinedload(Recipe.ingredients),
        joinedload(Recipe.tools),
    ).filter(Recipe.id == recipe_id, Recipe.user_id == user_id).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    return recipe


def _sync_ingredients(db: Session, recipe: Recipe, ingredients_data: list):
    db.query(RecipeIngredient).filter(RecipeIngredient.recipe_id == recipe.id).delete()
    for ing_data in ingredients_data:
        ing = RecipeIngredient(
            recipe_id=recipe.id,
            **ing_data.model_dump(),
            canonical_name=ing_data.canonical_name or _make_canonical(ing_data.ingredient_name),
        )
        db.add(ing)


def _sync_tools(db: Session, recipe: Recipe, tools_data: list):
    db.query(RecipeTool).filter(RecipeTool.recipe_id == recipe.id).delete()
    for tool_data in tools_data:
        rt = RecipeTool(recipe_id=recipe.id, **tool_data.model_dump())
        db.add(rt)


@router.get("/", response_model=dict)
def list_recipes(
    search: str | None = None,
    cuisine: str | None = None,
    difficulty: str | None = None,
    max_time: int | None = None,
    min_rating: float | None = None,
    source_type: str | None = None,
    is_favorite: bool | None = None,
    tags: str | None = None,
    sort_by: str = "name",
    sort_dir: str = "asc",
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(Recipe).filter(Recipe.user_id == current_user.id)
    if search:
        q = q.filter(Recipe.name.ilike(f"%{search}%"))
    if cuisine:
        q = q.filter(Recipe.cuisine == cuisine)
    if difficulty:
        q = q.filter(Recipe.difficulty == difficulty)
    if max_time:
        q = q.filter(Recipe.total_time_minutes <= max_time)
    if min_rating:
        q = q.filter(Recipe.rating >= min_rating)
    if source_type:
        q = q.filter(Recipe.source_type == source_type)
    if is_favorite is not None:
        q = q.filter(Recipe.is_favorite == is_favorite)
    if tags:
        for tag in tags.split(","):
            q = q.filter(Recipe.tags.any(tag.strip()))
    sort_col = getattr(Recipe, sort_by, Recipe.name)
    q = q.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())
    result = paginate(q, skip, limit)
    result["items"] = [RecipeListResponse.model_validate(i) for i in result["items"]]
    return result


@router.post("/", response_model=RecipeResponse, status_code=201)
def create_recipe(
    body: RecipeCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    recipe_data = body.model_dump(exclude={"ingredients", "tools"})
    if not recipe_data.get("total_time_minutes"):
        prep = recipe_data.get("prep_time_minutes") or 0
        cook = recipe_data.get("cook_time_minutes") or 0
        if prep or cook:
            recipe_data["total_time_minutes"] = prep + cook
    recipe = Recipe(**recipe_data, user_id=current_user.id)
    db.add(recipe)
    db.flush()
    for ing_data in body.ingredients:
        ing = RecipeIngredient(
            recipe_id=recipe.id,
            **ing_data.model_dump(),
            canonical_name=ing_data.canonical_name or _make_canonical(ing_data.ingredient_name),
        )
        db.add(ing)
    for tool_data in body.tools:
        rt = RecipeTool(recipe_id=recipe.id, **tool_data.model_dump())
        db.add(rt)
    db.commit()
    return _get_recipe(db, recipe.id, current_user.id)


@router.post("/parse/url", response_model=dict)
async def parse_url(
    body: ParseURLRequest,
    current_user: User = Depends(get_current_user),
):
    ai = get_kitchen_ai()
    recipe_data = await ai.parse_recipe_url(body.url)
    recipe_data["source_type"] = "url"
    recipe_data["source_url"] = body.url
    return {"recipe": recipe_data}


@router.post("/parse/youtube", response_model=dict)
async def parse_youtube(
    body: ParseYouTubeRequest,
    current_user: User = Depends(get_current_user),
):
    ai = get_kitchen_ai()
    recipe_data = await ai.parse_recipe_youtube(body.url)
    recipe_data["source_type"] = "youtube"
    recipe_data["source_url"] = body.url
    return {"recipe": recipe_data}


@router.post("/parse/image", response_model=dict)
async def parse_image(
    body: ParseImageRequest,
    current_user: User = Depends(get_current_user),
):
    ai = get_kitchen_ai()
    recipe_data = await ai.parse_recipe_image(body.image_base64, body.media_type)
    recipe_data["source_type"] = "image"
    return {"recipe": recipe_data}


@router.post("/generate", response_model=dict)
async def generate_recipe(
    body: GenerateRecipeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pantry_items = db.query(PantryItem).filter(
        PantryItem.user_id == current_user.id
    ).all()
    pantry_list = [
        {"name": p.name, "quantity": p.quantity, "unit": p.unit, "canonical_name": p.canonical_name}
        for p in pantry_items
    ]
    tools = db.query(KitchenTool).filter(
        KitchenTool.user_id == current_user.id
    ).all()
    tools_list = [
        {"name": t.name, "capabilities": t.capabilities or []}
        for t in tools
    ]
    ai = get_kitchen_ai()
    recipe_data = await ai.generate_recipe(
        constraints=body.model_dump(),
        pantry=pantry_list,
        tools=tools_list,
    )
    recipe_data["source_type"] = "ai_generated"
    return {"recipe": recipe_data}


@router.post("/normalize-ingredient", response_model=dict)
async def normalize_ingredient(
    body: NormalizeIngredientRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    pantry_items = db.query(PantryItem).filter(
        PantryItem.user_id == current_user.id
    ).all()
    pantry_list = [
        {"name": p.name, "canonical_name": p.canonical_name, "id": str(p.id)}
        for p in pantry_items
    ]
    ai = get_kitchen_ai()
    result = await ai.normalize_ingredient(body.raw, pantry_list)
    return result


@router.get("/{recipe_id}", response_model=RecipeResponse)
def get_recipe(
    recipe_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_recipe(db, recipe_id, current_user.id)


@router.patch("/{recipe_id}", response_model=RecipeResponse)
def update_recipe(
    recipe_id: UUID,
    body: RecipeUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    recipe = _get_recipe(db, recipe_id, current_user.id)
    data = body.model_dump(exclude_unset=True, exclude={"ingredients", "tools"})
    for k, v in data.items():
        setattr(recipe, k, v)
    if body.ingredients is not None:
        _sync_ingredients(db, recipe, body.ingredients)
    if body.tools is not None:
        _sync_tools(db, recipe, body.tools)
    recipe.updated_at = datetime.now(timezone.utc)
    db.commit()
    return _get_recipe(db, recipe.id, current_user.id)


@router.delete("/{recipe_id}", status_code=204)
def delete_recipe(
    recipe_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    recipe = _get_recipe(db, recipe_id, current_user.id)
    db.delete(recipe)
    db.commit()


@router.post("/{recipe_id}/version", response_model=RecipeResponse, status_code=201)
def create_version(
    recipe_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    original = _get_recipe(db, recipe_id, current_user.id)
    new_recipe = Recipe(
        user_id=current_user.id,
        name=original.name,
        description=original.description,
        servings=original.servings,
        prep_time_minutes=original.prep_time_minutes,
        cook_time_minutes=original.cook_time_minutes,
        total_time_minutes=original.total_time_minutes,
        instructions=original.instructions,
        source_type=original.source_type,
        source_url=original.source_url,
        source_attribution=original.source_attribution,
        tags=original.tags,
        cuisine=original.cuisine,
        difficulty=original.difficulty,
        dietary_flags=original.dietary_flags,
        notes=original.notes,
        version=original.version + 1,
        parent_recipe_id=original.id,
    )
    db.add(new_recipe)
    db.flush()
    for ing in original.ingredients:
        new_ing = RecipeIngredient(
            recipe_id=new_recipe.id,
            ingredient_name=ing.ingredient_name,
            canonical_name=ing.canonical_name,
            quantity=ing.quantity,
            unit=ing.unit,
            preparation=ing.preparation,
            group_name=ing.group_name,
            sort_order=ing.sort_order,
            optional=ing.optional,
            substitutions=ing.substitutions,
            pantry_item_id=ing.pantry_item_id,
        )
        db.add(new_ing)
    for t in original.tools:
        new_t = RecipeTool(
            recipe_id=new_recipe.id,
            tool_name=t.tool_name,
            tool_id=t.tool_id,
            optional=t.optional,
            notes=t.notes,
        )
        db.add(new_t)
    db.commit()
    return _get_recipe(db, new_recipe.id, current_user.id)


@router.get("/{recipe_id}/history", response_model=list[RecipeListResponse])
def version_history(
    recipe_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    recipe = _get_recipe(db, recipe_id, current_user.id)
    root_id = recipe.parent_recipe_id or recipe.id
    versions = db.query(Recipe).filter(
        Recipe.user_id == current_user.id,
        (Recipe.id == root_id) | (Recipe.parent_recipe_id == root_id),
    ).order_by(Recipe.version.asc()).all()
    return versions


@router.post("/{recipe_id}/cook", response_model=CookLogResponse, status_code=201)
def log_cook(
    recipe_id: UUID,
    body: CookLogCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_recipe(db, recipe_id, current_user.id)
    log = CookLog(
        recipe_id=recipe_id,
        user_id=current_user.id,
        **body.model_dump(),
    )
    db.add(log)
    db.commit()
    db.refresh(log)
    return log


@router.get("/{recipe_id}/cook-logs", response_model=list[CookLogResponse])
def list_cook_logs(
    recipe_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_recipe(db, recipe_id, current_user.id)
    return db.query(CookLog).filter(
        CookLog.recipe_id == recipe_id,
        CookLog.user_id == current_user.id,
    ).order_by(CookLog.cooked_date.desc()).all()


@router.post("/{recipe_id}/scale", response_model=dict)
def scale_recipe(
    recipe_id: UUID,
    body: ScaleRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    recipe = _get_recipe(db, recipe_id, current_user.id)
    ratio = body.servings / recipe.servings if recipe.servings else 1
    scaled_ingredients = []
    for ing in recipe.ingredients:
        scaled = RecipeIngredientResponse.model_validate(ing).model_dump()
        if scaled["quantity"]:
            scaled["quantity"] = round(scaled["quantity"] * ratio, 2)
        scaled_ingredients.append(scaled)
    return {
        "recipe_id": str(recipe.id),
        "original_servings": recipe.servings,
        "target_servings": body.servings,
        "ratio": round(ratio, 4),
        "scaled_ingredients": scaled_ingredients,
    }
