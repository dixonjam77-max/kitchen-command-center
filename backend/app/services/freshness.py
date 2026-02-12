"""
Freshness Engine — calculates and updates freshness status for pantry items.

Uses a combination of rule-based logic (freshness_rules table) and AI fallback
for items without known rules. Results are cached back to freshness_rules for
future use.
"""

from datetime import date, timedelta

from sqlalchemy.orm import Session

from app.models.pantry import PantryItem
from app.models.waste import FreshnessRule
from app.services.kitchen_ai import KitchenAI


# ── Rule-based freshness defaults (no AI needed) ────────────────────

DEFAULT_SHELF_LIFE = {
    # category -> (sealed_days, opened_days)
    "produce": (7, 4),
    "dairy": (14, 7),
    "meat": (5, 3),
    "seafood": (3, 2),
    "grains": (365, 180),
    "spices": (730, 365),
    "canned": (730, 5),
    "frozen": (180, 90),
    "condiments": (365, 90),
    "baking": (365, 180),
    "beverages": (365, 7),
    "snacks": (90, 14),
    "oils": (365, 180),
    "asian_pantry": (365, 90),
    "latin_pantry": (365, 90),
    "preserved": (365, 30),
    "alcohol": (730, 365),
}


def _status_from_days_remaining(days_left: int) -> str:
    """Convert days remaining to a freshness status."""
    if days_left <= 0:
        return "expired"
    elif days_left <= 1:
        return "use_today"
    elif days_left <= 4:
        return "use_soon"
    else:
        return "fresh"


def calculate_freshness_rule_based(
    item: PantryItem,
    rule: FreshnessRule | None = None,
) -> tuple[str, date | None]:
    """
    Calculate freshness using rule-based logic.
    Returns (freshness_status, effective_expiration_date).
    """
    today = date.today()

    # If we have a specific rule for this item
    if rule:
        if item.opened_date and rule.opened_shelf_life_days:
            effective_exp = item.opened_date + timedelta(days=rule.opened_shelf_life_days)
        elif item.purchase_date and rule.sealed_shelf_life_days:
            effective_exp = item.purchase_date + timedelta(days=rule.sealed_shelf_life_days)
        elif item.expiration_date:
            effective_exp = item.expiration_date
        else:
            return "fresh", None

        # Use the earlier of printed expiration and calculated expiration
        if item.expiration_date:
            effective_exp = min(effective_exp, item.expiration_date)

        days_left = (effective_exp - today).days
        return _status_from_days_remaining(days_left), effective_exp

    # Fall back to category defaults
    category = (item.category or "").lower()
    sealed_days, opened_days = DEFAULT_SHELF_LIFE.get(category, (30, 14))

    if item.opened_date:
        effective_exp = item.opened_date + timedelta(days=opened_days)
    elif item.purchase_date:
        effective_exp = item.purchase_date + timedelta(days=sealed_days)
    elif item.expiration_date:
        effective_exp = item.expiration_date
    else:
        return "fresh", None

    if item.expiration_date:
        effective_exp = min(effective_exp, item.expiration_date)

    # Special handling for frozen items
    if item.location and item.location.lower() == "freezer":
        frozen_days = 180
        if item.purchase_date:
            frozen_exp = item.purchase_date + timedelta(days=frozen_days)
            effective_exp = max(effective_exp, frozen_exp)

    days_left = (effective_exp - today).days
    return _status_from_days_remaining(days_left), effective_exp


async def update_item_freshness(
    db: Session,
    item: PantryItem,
    ai: KitchenAI | None = None,
    force_ai: bool = False,
) -> dict:
    """
    Update freshness for a single pantry item.
    Uses rule-based calculation first, falls back to AI if no rule exists.
    Returns a summary dict.
    """
    today = date.today()
    canonical = (item.canonical_name or "").lower().strip()

    # Look up freshness rule
    rule = None
    if canonical:
        rule = db.query(FreshnessRule).filter(
            FreshnessRule.canonical_name == canonical
        ).first()

    old_status = item.freshness_status

    if rule and not force_ai:
        # Rule-based calculation
        status, effective_exp = calculate_freshness_rule_based(item, rule)
        item.freshness_status = status
        item.freshness_expires_at = effective_exp
    elif ai and (force_ai or not rule):
        # AI-based calculation
        try:
            result = await ai.calculate_freshness(
                {
                    "name": item.name,
                    "category": item.category,
                    "location": item.location,
                    "purchase_date": str(item.purchase_date) if item.purchase_date else None,
                    "expiration_date": str(item.expiration_date) if item.expiration_date else None,
                    "opened_date": str(item.opened_date) if item.opened_date else None,
                    "quantity": item.quantity,
                    "unit": item.unit,
                    "today": str(today),
                },
                rule={
                    "sealed_shelf_life_days": rule.sealed_shelf_life_days,
                    "opened_shelf_life_days": rule.opened_shelf_life_days,
                    "storage_location": rule.storage_location,
                    "freezable": rule.freezable,
                    "storage_tips": rule.storage_tips,
                } if rule else None,
            )
            item.freshness_status = result.get("freshness_status", "fresh")
            exp_str = result.get("effective_expiration_date")
            if exp_str:
                try:
                    item.freshness_expires_at = date.fromisoformat(exp_str)
                except ValueError:
                    pass

            # Cache the AI result as a new freshness rule if none exists
            if not rule and canonical:
                _cache_freshness_rule(db, canonical, item, result)

        except Exception:
            # If AI fails, fall back to rule-based with category defaults
            status, effective_exp = calculate_freshness_rule_based(item)
            item.freshness_status = status
            item.freshness_expires_at = effective_exp
    else:
        # No AI available, use category defaults
        status, effective_exp = calculate_freshness_rule_based(item)
        item.freshness_status = status
        item.freshness_expires_at = effective_exp

    db.commit()

    return {
        "item_id": str(item.id),
        "name": item.name,
        "old_status": old_status,
        "new_status": item.freshness_status,
        "effective_expiration": str(item.freshness_expires_at) if item.freshness_expires_at else None,
        "changed": old_status != item.freshness_status,
    }


def _cache_freshness_rule(
    db: Session,
    canonical: str,
    item: PantryItem,
    ai_result: dict,
) -> None:
    """Cache an AI freshness result as a freshness_rule for future lookups."""
    today = date.today()
    exp_str = ai_result.get("effective_expiration_date")
    exp_date = None
    try:
        exp_date = date.fromisoformat(exp_str) if exp_str else None
    except (ValueError, TypeError):
        pass

    sealed_days = None
    opened_days = None
    if exp_date and item.purchase_date and not item.opened_date:
        sealed_days = (exp_date - item.purchase_date).days
    if exp_date and item.opened_date:
        opened_days = (exp_date - item.opened_date).days

    new_rule = FreshnessRule(
        canonical_name=canonical,
        category=item.category,
        sealed_shelf_life_days=sealed_days,
        opened_shelf_life_days=opened_days,
        storage_location=item.location,
        storage_tips=ai_result.get("storage_tips"),
        freezable=None,
        frozen_shelf_life_days=None,
        source="AI estimate",
    )
    db.add(new_rule)
    try:
        db.flush()
    except Exception:
        db.rollback()


async def run_freshness_scan(
    db: Session,
    user_id,
    ai: KitchenAI | None = None,
) -> dict:
    """
    Run a full freshness scan for a user's pantry.
    Updates all items that have dates (purchase, opened, or expiration).
    Returns summary of changes.
    """
    items = db.query(PantryItem).filter(
        PantryItem.user_id == user_id,
    ).all()

    results = []
    changes = 0
    alerts = []

    for item in items:
        # Only process items with date info
        if not (item.purchase_date or item.opened_date or item.expiration_date):
            continue

        result = await update_item_freshness(db, item, ai=ai)
        results.append(result)

        if result["changed"]:
            changes += 1
            if result["new_status"] in ("use_today", "expired"):
                alerts.append({
                    "item_id": result["item_id"],
                    "name": result["name"],
                    "status": result["new_status"],
                    "old_status": result["old_status"],
                })

    return {
        "items_scanned": len(results),
        "items_changed": changes,
        "alerts": alerts,
        "details": results,
    }
