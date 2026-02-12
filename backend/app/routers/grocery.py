import re
from datetime import date, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.grocery import GroceryList, GroceryListItem
from app.models.meal_plan import MealPlan
from app.models.pantry import PantryItem
from app.models.recipe import Recipe
from app.models.user import User
from app.schemas.grocery import (
    GroceryListCreate, GroceryListUpdate, GroceryListResponse,
    GroceryListSummaryResponse, GroceryListItemCreate,
    GroceryListItemUpdate, GroceryListItemResponse,
    GenerateFromPlanRequest,
)
from app.services.kitchen_ai import get_kitchen_ai
from app.utils.auth import get_current_user

router = APIRouter()


def _get_list(db: Session, list_id: UUID, user_id) -> GroceryList:
    gl = db.query(GroceryList).filter(
        GroceryList.id == list_id, GroceryList.user_id == user_id
    ).first()
    if not gl:
        raise HTTPException(status_code=404, detail="Grocery list not found")
    return gl


@router.get("/", response_model=list[dict])
def list_grocery_lists(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    lists = db.query(GroceryList).filter(
        GroceryList.user_id == current_user.id,
    ).order_by(GroceryList.created_at.desc()).all()
    results = []
    for gl in lists:
        data = GroceryListSummaryResponse.model_validate(gl).model_dump()
        data["item_count"] = len(gl.items)
        results.append(data)
    return results


@router.post("/", response_model=GroceryListResponse, status_code=201)
def create_list(
    body: GroceryListCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    gl = GroceryList(**body.model_dump(), user_id=current_user.id)
    db.add(gl)
    db.commit()
    db.refresh(gl)
    return gl


@router.post("/generate-from-plan", response_model=dict)
async def generate_from_plan(
    body: GenerateFromPlanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Find meal plans in the date range
    plans = db.query(MealPlan).filter(
        MealPlan.user_id == current_user.id,
        MealPlan.plan_date >= body.start_date,
        MealPlan.plan_date <= body.end_date,
        MealPlan.completed == False,
    ).all()

    if not plans:
        raise HTTPException(status_code=400, detail="No meal plans found for the date range")

    # Build meal plan details with ingredients
    meal_details = []
    for mp in plans:
        if mp.recipe_id:
            recipe = db.query(Recipe).options(
                joinedload(Recipe.ingredients)
            ).filter(Recipe.id == mp.recipe_id).first()
            if recipe:
                ratio = (mp.servings or recipe.servings) / (recipe.servings or 1)
                meal_details.append({
                    "recipe_name": recipe.name,
                    "servings": mp.servings or recipe.servings,
                    "plan_date": str(mp.plan_date),
                    "ingredients": [
                        {
                            "ingredient_name": ing.ingredient_name,
                            "canonical_name": ing.canonical_name,
                            "quantity": round((ing.quantity or 0) * ratio, 2),
                            "unit": ing.unit,
                        }
                        for ing in recipe.ingredients if not ing.optional
                    ],
                })

    # Get pantry for subtraction
    pantry_items = db.query(PantryItem).filter(PantryItem.user_id == current_user.id).all()
    pantry_list = [
        {"name": p.name, "canonical_name": p.canonical_name,
         "quantity": p.quantity, "unit": p.unit,
         "brand": p.brand, "preferred_brand": p.preferred_brand}
        for p in pantry_items
    ]

    ai = get_kitchen_ai()
    items = await ai.generate_grocery_from_plan(
        meal_plans=meal_details,
        pantry=pantry_list,
        preferences={},
    )

    # Create the grocery list
    list_name = body.list_name or f"Groceries for {body.start_date} to {body.end_date}"
    gl = GroceryList(user_id=current_user.id, name=list_name, status="active")
    db.add(gl)
    db.flush()

    total_cost = 0.0
    for item_data in items:
        canonical = re.sub(r"\(.*?\)", "", item_data.get("item_name", "")).strip().lower()
        gi = GroceryListItem(
            list_id=gl.id,
            item_name=item_data.get("item_name", ""),
            canonical_name=item_data.get("canonical_name", canonical),
            quantity=item_data.get("quantity"),
            unit=item_data.get("unit"),
            category=item_data.get("category"),
            estimated_price=item_data.get("estimated_price"),
            source="meal_plan",
            notes=item_data.get("notes"),
        )
        db.add(gi)
        if item_data.get("estimated_price"):
            total_cost += item_data["estimated_price"]

    if total_cost > 0:
        gl.estimated_cost = round(total_cost, 2)

    db.commit()
    db.refresh(gl)
    return {
        "message": f"Generated grocery list with {len(items)} items",
        "list": GroceryListResponse.model_validate(gl).model_dump(),
    }


@router.get("/{list_id}", response_model=GroceryListResponse)
def get_list(
    list_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_list(db, list_id, current_user.id)


@router.patch("/{list_id}", response_model=GroceryListResponse)
def update_list(
    list_id: UUID,
    body: GroceryListUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    gl = _get_list(db, list_id, current_user.id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(gl, k, v)
    gl.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(gl)
    return gl


@router.delete("/{list_id}", status_code=204)
def delete_list(
    list_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    gl = _get_list(db, list_id, current_user.id)
    db.delete(gl)
    db.commit()


@router.post("/{list_id}/items", response_model=list[GroceryListItemResponse], status_code=201)
def add_items(
    list_id: UUID,
    items: list[GroceryListItemCreate],
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_list(db, list_id, current_user.id)
    created = []
    for item_data in items:
        canonical = re.sub(r"\(.*?\)", "", item_data.item_name).strip().lower()
        item = GroceryListItem(
            list_id=list_id,
            **item_data.model_dump(),
            canonical_name=canonical,
        )
        db.add(item)
        created.append(item)
    db.commit()
    for i in created:
        db.refresh(i)
    return created


@router.patch("/{list_id}/items/{item_id}", response_model=GroceryListItemResponse)
def update_item(
    list_id: UUID,
    item_id: UUID,
    body: GroceryListItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_list(db, list_id, current_user.id)
    item = db.query(GroceryListItem).filter(
        GroceryListItem.id == item_id,
        GroceryListItem.list_id == list_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    data = body.model_dump(exclude_unset=True)
    if data.get("checked"):
        data["checked_at"] = datetime.now(timezone.utc)
    for k, v in data.items():
        setattr(item, k, v)
    db.commit()
    db.refresh(item)
    return item


@router.post("/{list_id}/items/{item_id}/to-pantry", response_model=dict)
def item_to_pantry(
    list_id: UUID,
    item_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_list(db, list_id, current_user.id)
    item = db.query(GroceryListItem).filter(
        GroceryListItem.id == item_id,
        GroceryListItem.list_id == list_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Item not found")
    item.checked = True
    item.checked_at = datetime.now(timezone.utc)
    item.added_to_pantry = True
    canonical = re.sub(r"\(.*?\)", "", item.item_name).strip().lower()
    pantry_item = PantryItem(
        user_id=current_user.id,
        name=item.item_name,
        canonical_name=canonical,
        quantity=item.quantity,
        unit=item.unit,
        category=item.category,
        purchase_date=date.today(),
    )
    db.add(pantry_item)
    db.commit()
    return {"message": "Item added to pantry", "pantry_item_id": str(pantry_item.id)}


@router.post("/{list_id}/split-by-store", response_model=dict)
async def split_by_store(
    list_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    gl = _get_list(db, list_id, current_user.id)
    if not gl.items:
        return {"stores": {}}

    items_data = [
        {
            "item_name": i.item_name,
            "quantity": i.quantity,
            "unit": i.unit,
            "category": i.category,
            "estimated_price": i.estimated_price,
        }
        for i in gl.items if not i.checked
    ]

    ai = get_kitchen_ai()
    result = await ai.split_grocery_by_store(items_data)
    return result
