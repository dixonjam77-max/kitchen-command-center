from datetime import date, datetime, timedelta, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.meal_plan import MealPlan
from app.models.pantry import PantryItem
from app.models.recipe import Recipe, RecipeIngredient
from app.models.user import User
from app.schemas.meal_plan import (
    MealPlanCreate, MealPlanUpdate, MealPlanResponse,
    CompleteMealRequest, GenerateMealPlanRequest,
)
from app.services.kitchen_ai import get_kitchen_ai
from app.utils.auth import get_current_user

router = APIRouter()


def _get_plan(db: Session, plan_id: UUID, user_id) -> MealPlan:
    plan = db.query(MealPlan).filter(
        MealPlan.id == plan_id, MealPlan.user_id == user_id
    ).first()
    if not plan:
        raise HTTPException(status_code=404, detail="Meal plan not found")
    return plan


@router.get("/", response_model=list[MealPlanResponse])
def list_plans(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return db.query(MealPlan).filter(
        MealPlan.user_id == current_user.id,
        MealPlan.plan_date >= start_date,
        MealPlan.plan_date <= end_date,
    ).order_by(MealPlan.plan_date.asc(), MealPlan.sort_order.asc()).all()


@router.post("/", response_model=MealPlanResponse, status_code=201)
def create_plan(
    body: MealPlanCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plan = MealPlan(**body.model_dump(), user_id=current_user.id)
    db.add(plan)
    db.commit()
    db.refresh(plan)
    return plan


@router.post("/generate", response_model=dict)
async def generate_plan(
    body: GenerateMealPlanRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    # Gather context for AI
    pantry_items = db.query(PantryItem).filter(PantryItem.user_id == current_user.id).all()
    pantry_list = [
        {"name": p.name, "quantity": p.quantity, "unit": p.unit,
         "freshness_status": p.freshness_status, "category": p.category}
        for p in pantry_items
    ]

    recipes = db.query(Recipe).filter(Recipe.user_id == current_user.id).all()
    recipe_list = [
        {"id": str(r.id), "name": r.name, "cuisine": r.cuisine,
         "total_time_minutes": r.total_time_minutes, "difficulty": r.difficulty,
         "tags": r.tags or [], "dietary_flags": r.dietary_flags or [],
         "rating": r.rating, "servings": r.servings}
        for r in recipes
    ]

    # Recent meal history (last 2 weeks)
    two_weeks_ago = date.today() - timedelta(days=14)
    recent = db.query(MealPlan).filter(
        MealPlan.user_id == current_user.id,
        MealPlan.plan_date >= two_weeks_ago,
    ).all()
    history = []
    for m in recent:
        recipe_name = ""
        if m.recipe_id:
            r = db.query(Recipe).filter(Recipe.id == m.recipe_id).first()
            recipe_name = r.name if r else ""
        history.append({
            "plan_date": str(m.plan_date),
            "meal_type": m.meal_type,
            "recipe_name": recipe_name or m.custom_meal or "",
        })

    ai = get_kitchen_ai()
    plans = await ai.generate_meal_plan(
        date_range={"start_date": str(body.start_date), "end_date": str(body.end_date)},
        pantry=pantry_list,
        recipes=recipe_list,
        history=history,
        preferences={
            "preferred_cuisines": body.preferred_cuisines,
            "max_weeknight_time": body.max_weeknight_time,
            "dietary_restrictions": body.dietary_restrictions,
            "meals_per_day": body.meals_per_day,
        },
    )

    # Save the generated plans
    created = []
    for plan_data in plans:
        mp = MealPlan(
            user_id=current_user.id,
            plan_date=plan_data.get("plan_date"),
            meal_type=plan_data.get("meal_type", "dinner"),
            recipe_id=plan_data.get("recipe_id") if plan_data.get("recipe_id") else None,
            custom_meal=plan_data.get("custom_meal"),
            servings=plan_data.get("servings", 4),
            notes=plan_data.get("notes"),
        )
        db.add(mp)
        created.append(mp)
    db.commit()
    for mp in created:
        db.refresh(mp)
    return {
        "message": f"Generated {len(created)} meal plan entries",
        "plans": [MealPlanResponse.model_validate(mp).model_dump() for mp in created],
    }


@router.get("/thaw-reminders", response_model=list[MealPlanResponse])
def thaw_reminders(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    upcoming = date.today()
    end = upcoming + timedelta(days=3)
    return db.query(MealPlan).filter(
        MealPlan.user_id == current_user.id,
        MealPlan.plan_date >= upcoming,
        MealPlan.plan_date <= end,
        MealPlan.thaw_reminder_sent == False,
        MealPlan.recipe_id.isnot(None),
    ).order_by(MealPlan.plan_date.asc()).all()


@router.get("/prep-groups", response_model=dict)
def prep_groups(
    start_date: date = Query(...),
    end_date: date = Query(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plans = db.query(MealPlan).filter(
        MealPlan.user_id == current_user.id,
        MealPlan.plan_date >= start_date,
        MealPlan.plan_date <= end_date,
        MealPlan.prep_day_group.isnot(None),
    ).order_by(MealPlan.prep_day_group.asc()).all()
    groups: dict[str, list] = {}
    for p in plans:
        groups.setdefault(p.prep_day_group, []).append(
            MealPlanResponse.model_validate(p).model_dump()
        )
    return {"groups": groups}


@router.get("/{plan_id}", response_model=MealPlanResponse)
def get_plan(
    plan_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_plan(db, plan_id, current_user.id)


@router.patch("/{plan_id}", response_model=MealPlanResponse)
def update_plan(
    plan_id: UUID,
    body: MealPlanUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plan = _get_plan(db, plan_id, current_user.id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(plan, k, v)
    plan.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(plan)
    return plan


@router.delete("/{plan_id}", status_code=204)
def delete_plan(
    plan_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plan = _get_plan(db, plan_id, current_user.id)
    db.delete(plan)
    db.commit()


@router.post("/{plan_id}/complete", response_model=dict)
def complete_meal(
    plan_id: UUID,
    body: CompleteMealRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    plan = _get_plan(db, plan_id, current_user.id)
    plan.completed = True
    plan.completed_at = datetime.now(timezone.utc)
    if body.leftover_portions is not None:
        plan.leftover_portions = body.leftover_portions
    if body.notes:
        plan.notes = body.notes
    plan.updated_at = datetime.now(timezone.utc)

    # Deduct ingredients from pantry if recipe-based
    deductions = []
    if plan.recipe_id:
        recipe = db.query(Recipe).options(
            joinedload(Recipe.ingredients)
        ).filter(Recipe.id == plan.recipe_id).first()
        if recipe and recipe.ingredients:
            servings_ratio = (plan.servings or recipe.servings) / (recipe.servings or 1)
            for ing in recipe.ingredients:
                if ing.optional:
                    continue
                needed = (ing.quantity or 0) * servings_ratio
                if needed <= 0:
                    continue
                # Find matching pantry item by canonical_name
                pantry_item = db.query(PantryItem).filter(
                    PantryItem.user_id == current_user.id,
                    PantryItem.canonical_name == ing.canonical_name,
                ).first()
                if pantry_item and pantry_item.quantity is not None:
                    old_qty = pantry_item.quantity
                    pantry_item.quantity = max(0, pantry_item.quantity - needed)
                    deductions.append({
                        "item": pantry_item.name,
                        "deducted": round(min(needed, old_qty), 2),
                        "remaining": round(pantry_item.quantity, 2),
                    })

    db.commit()
    db.refresh(plan)
    return {
        "plan": MealPlanResponse.model_validate(plan).model_dump(),
        "deductions": deductions,
    }
