"""
Background tasks for freshness scanning.

These can be triggered via:
  1. Celery beat (nightly scheduled scan)
  2. On-demand via API endpoint
  3. When an item is marked as opened

When Celery/Redis is not available, the scan runs synchronously via the API.
"""

import asyncio
import logging
from datetime import datetime, timezone

from app.database import SessionLocal
from app.models.user import User
from app.services.freshness import run_freshness_scan, update_item_freshness
from app.services.kitchen_ai import get_kitchen_ai
from app.services.notifications import (
    generate_freshness_alerts,
    generate_low_stock_alerts,
    generate_thaw_reminders,
    generate_meal_reminders,
    generate_maintenance_reminders,
)

logger = logging.getLogger(__name__)


async def _run_nightly_scan_for_user(user_id) -> dict:
    """Run the full nightly scan for a single user."""
    db = SessionLocal()
    try:
        ai = get_kitchen_ai()

        # 1. Run freshness scan
        scan_result = await run_freshness_scan(db, user_id, ai=ai)

        # 2. Generate all notification types
        freshness_alerts = generate_freshness_alerts(db, user_id)
        low_stock_alerts = generate_low_stock_alerts(db, user_id)
        thaw_reminders = generate_thaw_reminders(db, user_id)
        meal_reminders = generate_meal_reminders(db, user_id)
        maintenance_reminders = generate_maintenance_reminders(db, user_id)

        return {
            "user_id": str(user_id),
            "scan": scan_result,
            "notifications": {
                "freshness_alerts": len(freshness_alerts),
                "low_stock_alerts": len(low_stock_alerts),
                "thaw_reminders": len(thaw_reminders),
                "meal_reminders": len(meal_reminders),
                "maintenance_reminders": len(maintenance_reminders),
            },
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    except Exception as e:
        logger.error(f"Freshness scan failed for user {user_id}: {e}")
        return {"user_id": str(user_id), "error": str(e)}
    finally:
        db.close()


async def run_nightly_scan_all_users() -> list[dict]:
    """Run the nightly freshness scan for ALL users. Called by Celery beat or manually."""
    db = SessionLocal()
    try:
        users = db.query(User).all()
        user_ids = [u.id for u in users]
    finally:
        db.close()

    results = []
    for uid in user_ids:
        result = await _run_nightly_scan_for_user(uid)
        results.append(result)
        logger.info(f"Scanned user {uid}: {result.get('scan', {}).get('items_changed', 0)} items changed")

    return results


def sync_run_nightly_scan() -> list[dict]:
    """Synchronous wrapper for Celery task."""
    return asyncio.run(run_nightly_scan_all_users())


def sync_run_user_scan(user_id) -> dict:
    """Synchronous wrapper for single-user scan."""
    return asyncio.run(_run_nightly_scan_for_user(user_id))


# ── Celery task definitions (optional, only if Celery is configured) ──

try:
    from celery import Celery
    from app.config import get_settings

    settings = get_settings()
    celery_app = Celery(
        "kitchen_tasks",
        broker=settings.REDIS_URL,
        backend=settings.REDIS_URL,
    )

    @celery_app.task(name="freshness_scan.nightly")
    def celery_nightly_scan():
        """Celery task: run nightly freshness scan for all users."""
        return sync_run_nightly_scan()

    @celery_app.task(name="freshness_scan.user")
    def celery_user_scan(user_id: str):
        """Celery task: run freshness scan for a specific user."""
        return sync_run_user_scan(user_id)

    # Beat schedule: run nightly at 2 AM
    celery_app.conf.beat_schedule = {
        "nightly-freshness-scan": {
            "task": "freshness_scan.nightly",
            "schedule": 86400.0,  # 24 hours in seconds
        },
    }

except ImportError:
    # Celery not installed — tasks run synchronously via API
    celery_app = None
    logger.info("Celery not available. Background tasks will run synchronously.")
