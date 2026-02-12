"""
Waste Analytics — analyzes waste patterns and generates insights.

Combines database aggregation with AI analysis for actionable recommendations.
"""

from datetime import date, timedelta
from collections import defaultdict

from sqlalchemy import func, extract
from sqlalchemy.orm import Session

from app.models.waste import WasteLog
from app.models.pantry import PantryItem


def get_waste_summary(db: Session, user_id, days: int = 90) -> dict:
    """
    Get waste statistics from the database for a user.
    Returns aggregated data suitable for charts and the AI analyzer.
    """
    cutoff = date.today() - timedelta(days=days)

    logs = db.query(WasteLog).filter(
        WasteLog.user_id == user_id,
        WasteLog.wasted_date >= cutoff,
    ).order_by(WasteLog.wasted_date.desc()).all()

    if not logs:
        return {
            "total_items": 0,
            "total_cost": 0.0,
            "by_reason": {},
            "by_category": {},
            "most_wasted": [],
            "monthly": [],
            "logs": [],
        }

    total_cost = sum(l.estimated_cost or 0 for l in logs)

    # Group by reason
    by_reason: dict[str, int] = defaultdict(int)
    for l in logs:
        by_reason[l.reason or "unknown"] += 1

    # Group by month
    monthly: dict[str, dict] = defaultdict(lambda: {"cost": 0.0, "count": 0})
    for l in logs:
        if l.wasted_date:
            key = l.wasted_date.strftime("%Y-%m")
            monthly[key]["cost"] += l.estimated_cost or 0
            monthly[key]["count"] += 1

    monthly_list = [
        {"month": k, "cost": round(v["cost"], 2), "count": v["count"]}
        for k, v in sorted(monthly.items())
    ]

    # Most wasted items (by frequency)
    item_counts: dict[str, dict] = defaultdict(lambda: {"count": 0, "total_cost": 0.0})
    for l in logs:
        name = l.item_name or "Unknown"
        item_counts[name]["count"] += 1
        item_counts[name]["total_cost"] += l.estimated_cost or 0

    most_wasted = sorted(
        [{"name": k, **v} for k, v in item_counts.items()],
        key=lambda x: x["count"],
        reverse=True,
    )[:10]

    # By category (join with pantry if possible)
    by_category: dict[str, float] = defaultdict(float)
    for l in logs:
        if l.pantry_item_id:
            item = db.query(PantryItem).filter(PantryItem.id == l.pantry_item_id).first()
            cat = item.category if item else "unknown"
        else:
            cat = "unknown"
        by_category[cat] += l.estimated_cost or 0

    # Serialize logs for AI analysis
    logs_data = [
        {
            "item_name": l.item_name,
            "quantity_wasted": l.quantity_wasted,
            "unit": l.unit,
            "reason": l.reason,
            "estimated_cost": l.estimated_cost,
            "wasted_date": str(l.wasted_date) if l.wasted_date else None,
            "category": by_category.get(l.item_name, "unknown") if isinstance(by_category.get(l.item_name), str) else "unknown",
        }
        for l in logs
    ]

    return {
        "total_items": len(logs),
        "total_cost": round(total_cost, 2),
        "by_reason": dict(by_reason),
        "by_category": {k: round(v, 2) for k, v in by_category.items()},
        "most_wasted": most_wasted,
        "monthly": monthly_list,
        "logs": logs_data,
    }


def get_waste_trend(monthly: list[dict]) -> str:
    """Determine if waste is improving, worsening, or stable based on monthly data."""
    if len(monthly) < 2:
        return "stable"

    recent = monthly[-1]["cost"] if monthly else 0
    previous = monthly[-2]["cost"] if len(monthly) >= 2 else 0

    if recent < previous * 0.8:
        return "improving"
    elif recent > previous * 1.2:
        return "worsening"
    return "stable"
