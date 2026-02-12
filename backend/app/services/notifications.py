"""
Notification Service — generates and manages user notifications.

For Phase 4 (web), notifications are stored in-memory and served via API.
Phase 5 (mobile) will add push notifications via Expo.
"""

from datetime import date, datetime, timedelta, timezone
from uuid import uuid4

from sqlalchemy.orm import Session

from app.models.pantry import PantryItem
from app.models.meal_plan import MealPlan
from app.models.recipe import Recipe


# In-memory notification store (per-user)
# In production, this would be a Redis-backed or DB-backed store.
_notifications: dict[str, list[dict]] = {}


def _add_notification(user_id: str, notif: dict) -> None:
    """Add a notification to the in-memory store."""
    uid = str(user_id)
    if uid not in _notifications:
        _notifications[uid] = []
    notif["id"] = str(uuid4())
    notif["created_at"] = datetime.now(timezone.utc).isoformat()
    notif["read"] = False
    _notifications[uid].insert(0, notif)
    # Keep max 50 notifications per user
    _notifications[uid] = _notifications[uid][:50]


def get_notifications(user_id: str, unread_only: bool = False) -> list[dict]:
    """Get notifications for a user."""
    uid = str(user_id)
    notifs = _notifications.get(uid, [])
    if unread_only:
        return [n for n in notifs if not n.get("read")]
    return notifs


def mark_read(user_id: str, notification_id: str) -> bool:
    """Mark a notification as read."""
    uid = str(user_id)
    for n in _notifications.get(uid, []):
        if n["id"] == notification_id:
            n["read"] = True
            return True
    return False


def mark_all_read(user_id: str) -> int:
    """Mark all notifications as read. Returns count marked."""
    uid = str(user_id)
    count = 0
    for n in _notifications.get(uid, []):
        if not n.get("read"):
            n["read"] = True
            count += 1
    return count


def clear_notifications(user_id: str) -> None:
    """Clear all notifications for a user."""
    _notifications[str(user_id)] = []


def generate_freshness_alerts(db: Session, user_id) -> list[dict]:
    """
    Generate freshness alert notifications for items that need attention.
    Called by the daily freshness scan or on-demand.
    """
    today = date.today()
    alerts = []

    # Items expiring today
    use_today_items = db.query(PantryItem).filter(
        PantryItem.user_id == user_id,
        PantryItem.freshness_status == "use_today",
    ).all()

    for item in use_today_items:
        notif = {
            "type": "freshness_alert",
            "severity": "high",
            "title": f"Use today: {item.name}",
            "message": f"Your {item.name} needs to be used today! ({item.quantity or '?'} {item.unit or ''} remaining)",
            "item_id": str(item.id),
            "action_type": "view_recipes",
            "action_label": "Find recipes",
        }
        _add_notification(str(user_id), notif)
        alerts.append(notif)

    # Items expiring soon
    use_soon_items = db.query(PantryItem).filter(
        PantryItem.user_id == user_id,
        PantryItem.freshness_status == "use_soon",
    ).all()

    for item in use_soon_items:
        notif = {
            "type": "freshness_alert",
            "severity": "medium",
            "title": f"Use soon: {item.name}",
            "message": f"Your {item.name} should be used within a few days.",
            "item_id": str(item.id),
            "action_type": "view_item",
            "action_label": "View item",
        }
        _add_notification(str(user_id), notif)
        alerts.append(notif)

    # Expired items
    expired_items = db.query(PantryItem).filter(
        PantryItem.user_id == user_id,
        PantryItem.freshness_status == "expired",
    ).all()

    for item in expired_items:
        notif = {
            "type": "freshness_alert",
            "severity": "critical",
            "title": f"Expired: {item.name}",
            "message": f"Your {item.name} has expired. Consider logging waste and removing it.",
            "item_id": str(item.id),
            "action_type": "log_waste",
            "action_label": "Log waste",
        }
        _add_notification(str(user_id), notif)
        alerts.append(notif)

    return alerts


def generate_low_stock_alerts(db: Session, user_id) -> list[dict]:
    """Generate low stock notifications for staple items."""
    alerts = []

    low_items = db.query(PantryItem).filter(
        PantryItem.user_id == user_id,
        PantryItem.is_staple == True,
        PantryItem.min_quantity.isnot(None),
        PantryItem.quantity <= PantryItem.min_quantity,
    ).all()

    for item in low_items:
        notif = {
            "type": "low_stock",
            "severity": "medium",
            "title": f"Low stock: {item.name}",
            "message": f"You're almost out of {item.name} ({item.quantity or 0} {item.unit or ''} remaining, min: {item.min_quantity}).",
            "item_id": str(item.id),
            "action_type": "add_to_grocery",
            "action_label": "Add to grocery list",
        }
        _add_notification(str(user_id), notif)
        alerts.append(notif)

    return alerts


def generate_thaw_reminders(db: Session, user_id) -> list[dict]:
    """
    Generate thaw reminders for upcoming meals with frozen ingredients.
    Checks meals 24-48 hours out for frozen ingredients.
    """
    today = date.today()
    tomorrow = today + timedelta(days=1)
    day_after = today + timedelta(days=2)
    alerts = []

    # Get meals planned for tomorrow and day after
    upcoming_meals = db.query(MealPlan).filter(
        MealPlan.user_id == user_id,
        MealPlan.plan_date.between(tomorrow, day_after),
        MealPlan.completed == False,
        MealPlan.recipe_id.isnot(None),
        MealPlan.thaw_reminder_sent == False,
    ).all()

    for meal in upcoming_meals:
        recipe = db.query(Recipe).filter(Recipe.id == meal.recipe_id).first()
        if not recipe:
            continue

        # Check if any recipe ingredients are frozen in pantry
        from app.models.recipe import RecipeIngredient
        ingredients = db.query(RecipeIngredient).filter(
            RecipeIngredient.recipe_id == recipe.id,
        ).all()

        for ing in ingredients:
            if not ing.canonical_name:
                continue
            frozen_item = db.query(PantryItem).filter(
                PantryItem.user_id == user_id,
                PantryItem.canonical_name == ing.canonical_name,
                PantryItem.location == "freezer",
            ).first()

            if frozen_item:
                notif = {
                    "type": "thaw_reminder",
                    "severity": "medium",
                    "title": f"Thaw reminder: {frozen_item.name}",
                    "message": (
                        f"Move {frozen_item.name} to the fridge tonight for "
                        f"{meal.plan_date.strftime('%A')}'s {meal.meal_type}: {recipe.name}"
                    ),
                    "item_id": str(frozen_item.id),
                    "meal_plan_id": str(meal.id),
                    "action_type": "view_meal",
                    "action_label": "View meal",
                }
                _add_notification(str(user_id), notif)
                alerts.append(notif)

        # Mark reminder as sent
        meal.thaw_reminder_sent = True

    db.commit()
    return alerts


def generate_meal_reminders(db: Session, user_id) -> list[dict]:
    """Generate reminders for today's upcoming meals."""
    today = date.today()
    alerts = []

    todays_meals = db.query(MealPlan).filter(
        MealPlan.user_id == user_id,
        MealPlan.plan_date == today,
        MealPlan.completed == False,
    ).all()

    for meal in todays_meals:
        recipe_name = meal.custom_meal or "a meal"
        if meal.recipe_id:
            recipe = db.query(Recipe).filter(Recipe.id == meal.recipe_id).first()
            recipe_name = recipe.name if recipe else recipe_name

        notif = {
            "type": "meal_reminder",
            "severity": "low",
            "title": f"Today's {meal.meal_type}: {recipe_name}",
            "message": f"You have {recipe_name} planned for {meal.meal_type} today.",
            "meal_plan_id": str(meal.id),
            "action_type": "view_meal",
            "action_label": "View meal",
        }
        _add_notification(str(user_id), notif)
        alerts.append(notif)

    return alerts


def generate_maintenance_reminders(db: Session, user_id) -> list[dict]:
    """Generate maintenance reminders for kitchen tools."""
    from app.models.tool import KitchenTool
    today = date.today()
    alerts = []

    tools = db.query(KitchenTool).filter(
        KitchenTool.user_id == user_id,
        KitchenTool.maintenance_interval_days.isnot(None),
        KitchenTool.last_maintained.isnot(None),
    ).all()

    for tool in tools:
        next_maintenance = tool.last_maintained + timedelta(days=tool.maintenance_interval_days)
        if next_maintenance <= today + timedelta(days=3):
            notif = {
                "type": "maintenance_reminder",
                "severity": "low",
                "title": f"Maintenance due: {tool.name}",
                "message": f"Time to {tool.maintenance_type or 'maintain'} your {tool.name}.",
                "tool_id": str(tool.id),
                "action_type": "view_tool",
                "action_label": "View tool",
            }
            _add_notification(str(user_id), notif)
            alerts.append(notif)

    return alerts
