"""
AI Router — all AI-powered endpoints for Phase 4.

Endpoints:
  POST /what-can-i-make — recipe suggestions from current pantry
  POST /freshness-check — batch freshness assessment
  POST /substitutions — find substitutes for missing ingredient
  POST /waste-analysis — waste patterns and suggestions
  POST /seasonal-suggestions — seasonal ingredients and recipes
  POST /pantry-forecast — projected pantry after planned meals
  POST /smart-suggestions — contextual suggestions
  POST /freshness-scan — trigger full freshness scan
  GET  /notifications — get user notifications
  POST /notifications/mark-read — mark notification as read
  POST /notifications/mark-all-read — mark all notifications as read
"""

from datetime import date, timedelta

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session, joinedload

from app.database import get_db
from app.models.pantry import PantryItem
from app.models.recipe import Recipe, RecipeIngredient
from app.models.tool import KitchenTool
from app.models.meal_plan import MealPlan
from app.models.waste import WasteLog
from app.models.user import User
from app.schemas.waste import (
    WhatCanIMakeRequest,
    SubstitutionRequest,
    SeasonalRequest,
    PantryForecastRequest,
    FreshnessScanRequest,
)
from app.services.kitchen_ai import get_kitchen_ai, KitchenAI
from app.services.freshness import run_freshness_scan
from app.services.waste_analytics import get_waste_summary, get_waste_trend
from app.services.notifications import (
    get_notifications,
    mark_read,
    mark_all_read,
    generate_freshness_alerts,
    generate_low_stock_alerts,
    generate_thaw_reminders,
)
from app.utils.auth import get_current_user

router = APIRouter()


def _get_ai() -> KitchenAI:
    return get_kitchen_ai()


# ── What Can I Make ──────────────────────────────────────────────

@router.post("/what-can-i-make")
async def what_can_i_make(
    body: WhatCanIMakeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ai = _get_ai()

    pantry = db.query(PantryItem).filter(
        PantryItem.user_id == current_user.id,
    ).all()
    pantry_data = [
        {
            "name": p.name,
            "canonical_name": p.canonical_name,
            "quantity": p.quantity,
            "unit": p.unit,
            "category": p.category,
            "location": p.location,
            "freshness_status": p.freshness_status,
        }
        for p in pantry
    ]

    tools = db.query(KitchenTool).filter(
        KitchenTool.user_id == current_user.id,
    ).all()
    tools_data = [
        {"name": t.name, "capabilities": t.capabilities or []}
        for t in tools
    ]

    suggestions = await ai.what_can_i_make(
        pantry=pantry_data,
        tools=tools_data,
        preferences={
            "dietary_restrictions": body.dietary_restrictions,
            "max_time_minutes": body.max_time_minutes,
            "preferred_cuisine": body.preferred_cuisine,
            "meal_type": body.meal_type,
        },
    )
    return {"suggestions": suggestions}


# ── Freshness Check (batch) ──────────────────────────────────────

@router.post("/freshness-check")
async def freshness_check(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ai = _get_ai()
    today_str = str(date.today())

    # Get items that have dates
    items = db.query(PantryItem).filter(
        PantryItem.user_id == current_user.id,
    ).all()

    items_with_dates = [
        i for i in items
        if i.purchase_date or i.opened_date or i.expiration_date
    ]

    if not items_with_dates:
        return {"results": [], "message": "No items with date information to check"}

    items_data = [
        {
            "id": str(i.id),
            "name": i.name,
            "category": i.category,
            "location": i.location,
            "purchase_date": str(i.purchase_date) if i.purchase_date else None,
            "expiration_date": str(i.expiration_date) if i.expiration_date else None,
            "opened_date": str(i.opened_date) if i.opened_date else None,
            "quantity": i.quantity,
            "unit": i.unit,
            "today": today_str,
        }
        for i in items_with_dates
    ]

    results = await ai.check_freshness_batch(items_data)

    # Update items in DB
    updated = 0
    item_map = {str(i.id): i for i in items_with_dates}
    for r in results:
        item = item_map.get(r.get("item_id"))
        if item and r.get("freshness_status"):
            old = item.freshness_status
            item.freshness_status = r["freshness_status"]
            exp = r.get("effective_expiration_date")
            if exp:
                try:
                    item.freshness_expires_at = date.fromisoformat(exp)
                except ValueError:
                    pass
            if old != item.freshness_status:
                updated += 1
    db.commit()

    return {"results": results, "items_updated": updated}


# ── Substitutions ────────────────────────────────────────────────

@router.post("/substitutions")
async def substitutions(
    body: SubstitutionRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ai = _get_ai()

    recipe = db.query(Recipe).options(
        joinedload(Recipe.ingredients),
    ).filter(
        Recipe.id == body.recipe_id,
        Recipe.user_id == current_user.id,
    ).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")

    pantry = db.query(PantryItem).filter(
        PantryItem.user_id == current_user.id,
    ).all()
    pantry_data = [
        {
            "id": str(p.id),
            "name": p.name,
            "canonical_name": p.canonical_name,
            "quantity": p.quantity,
            "unit": p.unit,
            "category": p.category,
        }
        for p in pantry
    ]

    recipe_data = {
        "name": recipe.name,
        "description": recipe.description,
        "ingredients": [
            {"ingredient_name": i.ingredient_name, "canonical_name": i.canonical_name}
            for i in recipe.ingredients
        ],
    }

    subs = await ai.suggest_substitutions(
        missing=body.missing_ingredient,
        recipe=recipe_data,
        pantry=pantry_data,
    )
    return {"substitutions": subs}


# ── Waste Analysis ───────────────────────────────────────────────

@router.post("/waste-analysis")
async def waste_analysis(
    days: int = 90,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ai = _get_ai()

    # Get waste summary from DB
    summary = get_waste_summary(db, current_user.id, days=days)

    if summary["total_items"] == 0:
        return {
            "analysis": {
                "total_items_wasted": 0,
                "total_estimated_cost": 0,
                "trend": "stable",
                "message": "No waste logged yet. Start logging waste to get insights.",
            },
            "db_summary": summary,
        }

    # Get AI analysis
    ai_analysis = await ai.analyze_waste(summary["logs"])

    return {
        "analysis": ai_analysis,
        "db_summary": {
            "total_items": summary["total_items"],
            "total_cost": summary["total_cost"],
            "by_reason": summary["by_reason"],
            "by_category": summary["by_category"],
            "most_wasted": summary["most_wasted"],
            "monthly": summary["monthly"],
            "trend": get_waste_trend(summary["monthly"]),
        },
    }


# ── Seasonal Suggestions ────────────────────────────────────────

@router.post("/seasonal-suggestions")
async def seasonal_suggestions(
    body: SeasonalRequest = SeasonalRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ai = _get_ai()
    month = body.month or date.today().month

    pantry = db.query(PantryItem).filter(
        PantryItem.user_id == current_user.id,
    ).all()
    pantry_data = [
        {"name": p.name, "category": p.category}
        for p in pantry
    ]

    result = await ai.seasonal_suggestions(month=month, pantry=pantry_data)
    return {"seasonal": result}


# ── Pantry Forecast ──────────────────────────────────────────────

@router.post("/pantry-forecast")
async def pantry_forecast(
    body: PantryForecastRequest = PantryForecastRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ai = _get_ai()
    today = date.today()
    start = date.fromisoformat(body.start_date) if body.start_date else today
    end = date.fromisoformat(body.end_date) if body.end_date else today + timedelta(days=7)

    pantry = db.query(PantryItem).filter(
        PantryItem.user_id == current_user.id,
    ).all()
    pantry_data = [
        {
            "name": p.name,
            "quantity": p.quantity,
            "unit": p.unit,
            "expiration_date": str(p.expiration_date) if p.expiration_date else None,
            "freshness_status": p.freshness_status,
        }
        for p in pantry
    ]

    # Get meal plans with ingredients
    plans = db.query(MealPlan).filter(
        MealPlan.user_id == current_user.id,
        MealPlan.plan_date.between(start, end),
        MealPlan.completed == False,
    ).all()

    plans_data = []
    for mp in plans:
        plan_entry = {
            "plan_date": str(mp.plan_date),
            "meal_type": mp.meal_type,
            "recipe_name": mp.custom_meal or "Custom",
            "servings": mp.servings or 4,
            "ingredients": [],
        }
        if mp.recipe_id:
            recipe = db.query(Recipe).options(
                joinedload(Recipe.ingredients),
            ).filter(Recipe.id == mp.recipe_id).first()
            if recipe:
                plan_entry["recipe_name"] = recipe.name
                ratio = (mp.servings or recipe.servings or 4) / (recipe.servings or 4)
                plan_entry["ingredients"] = [
                    {
                        "ingredient_name": i.ingredient_name,
                        "quantity": round((i.quantity or 0) * ratio, 2),
                        "unit": i.unit or "",
                    }
                    for i in recipe.ingredients
                ]
        plans_data.append(plan_entry)

    result = await ai.pantry_forecast(pantry=pantry_data, meal_plans=plans_data)
    return {"forecast": result}


# ── Smart Suggestions ────────────────────────────────────────────

@router.post("/smart-suggestions")
async def smart_suggestions(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ai = _get_ai()
    today = date.today()

    # Gather context
    expiring = db.query(PantryItem).filter(
        PantryItem.user_id == current_user.id,
        PantryItem.freshness_status.in_(["use_today", "use_soon"]),
    ).limit(10).all()

    low_stock = db.query(PantryItem).filter(
        PantryItem.user_id == current_user.id,
        PantryItem.min_quantity.isnot(None),
        PantryItem.quantity <= PantryItem.min_quantity,
    ).limit(10).all()

    recent_waste = db.query(WasteLog).filter(
        WasteLog.user_id == current_user.id,
        WasteLog.wasted_date >= today - timedelta(days=14),
    ).limit(5).all()

    todays_meals = db.query(MealPlan).filter(
        MealPlan.user_id == current_user.id,
        MealPlan.plan_date == today,
    ).all()

    pantry_count = db.query(PantryItem).filter(
        PantryItem.user_id == current_user.id,
    ).count()

    recipe_count = db.query(Recipe).filter(
        Recipe.user_id == current_user.id,
    ).count()

    context = {
        "expiring_items": [
            {"name": i.name, "freshness_status": i.freshness_status,
             "expiration_date": str(i.freshness_expires_at or i.expiration_date or "")}
            for i in expiring
        ],
        "low_stock": [
            {"name": i.name, "quantity": i.quantity, "unit": i.unit}
            for i in low_stock
        ],
        "recent_waste": [
            {"item_name": w.item_name, "reason": w.reason}
            for w in recent_waste
        ],
        "todays_meals": [
            {"meal_type": m.meal_type, "recipe_name": m.custom_meal or "Planned meal"}
            for m in todays_meals
        ],
        "pantry_count": pantry_count,
        "recipes_count": recipe_count,
        "current_month": today.strftime("%B %Y"),
    }

    # Add recipe names for today's meals
    for i, m in enumerate(todays_meals):
        if m.recipe_id:
            recipe = db.query(Recipe).filter(Recipe.id == m.recipe_id).first()
            if recipe:
                context["todays_meals"][i]["recipe_name"] = recipe.name

    result = await ai.smart_suggestions(context)
    return result


# ── Freshness Scan (on-demand) ───────────────────────────────────

@router.post("/freshness-scan")
async def freshness_scan(
    body: FreshnessScanRequest = FreshnessScanRequest(),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    ai = _get_ai() if body.force_ai else None
    result = await run_freshness_scan(db, current_user.id, ai=ai)

    # Also generate notifications
    freshness_alerts = generate_freshness_alerts(db, current_user.id)
    low_stock_alerts = generate_low_stock_alerts(db, current_user.id)
    thaw_reminders = generate_thaw_reminders(db, current_user.id)

    return {
        "scan": result,
        "notifications_generated": {
            "freshness": len(freshness_alerts),
            "low_stock": len(low_stock_alerts),
            "thaw": len(thaw_reminders),
        },
    }


# ── Notifications ────────────────────────────────────────────────

@router.get("/notifications")
def get_user_notifications(
    unread_only: bool = False,
    current_user: User = Depends(get_current_user),
):
    notifs = get_notifications(str(current_user.id), unread_only=unread_only)
    return {"notifications": notifs, "unread_count": sum(1 for n in notifs if not n.get("read"))}


@router.post("/notifications/{notification_id}/mark-read")
def mark_notification_read(
    notification_id: str,
    current_user: User = Depends(get_current_user),
):
    success = mark_read(str(current_user.id), notification_id)
    if not success:
        raise HTTPException(status_code=404, detail="Notification not found")
    return {"message": "Marked as read"}


@router.post("/notifications/mark-all-read")
def mark_all_notifications_read(
    current_user: User = Depends(get_current_user),
):
    count = mark_all_read(str(current_user.id))
    return {"message": f"Marked {count} notifications as read"}
