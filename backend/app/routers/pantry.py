import re
from datetime import date, timedelta, timezone, datetime
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.pantry import PantryItem
from app.models.waste import WasteLog
from app.models.user import User
from app.schemas.pantry import (
    PantryItemCreate, PantryItemUpdate, PantryItemResponse,
    AdjustQuantityRequest, WasteRequest,
)
from app.utils.auth import get_current_user
from app.utils.pagination import paginate

router = APIRouter()


def make_canonical(name: str) -> str:
    """Generate canonical_name by lowercasing and stripping brand info in parens."""
    name = re.sub(r"\(.*?\)", "", name)
    name = re.sub(r",.*$", "", name)
    return name.strip().lower()


def _get_item(db: Session, item_id: UUID, user_id) -> PantryItem:
    item = db.query(PantryItem).filter(
        PantryItem.id == item_id, PantryItem.user_id == user_id
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Pantry item not found")
    return item


@router.get("/", response_model=dict)
def list_items(
    search: str | None = None,
    category: str | None = None,
    location: str | None = None,
    freshness_status: str | None = None,
    is_staple: bool | None = None,
    sort_by: str = "name",
    sort_dir: str = "asc",
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(PantryItem).filter(PantryItem.user_id == current_user.id)
    if search:
        q = q.filter(PantryItem.name.ilike(f"%{search}%"))
    if category:
        q = q.filter(PantryItem.category == category)
    if location:
        q = q.filter(PantryItem.location == location)
    if freshness_status:
        q = q.filter(PantryItem.freshness_status == freshness_status)
    if is_staple is not None:
        q = q.filter(PantryItem.is_staple == is_staple)
    sort_col = getattr(PantryItem, sort_by, PantryItem.name)
    q = q.order_by(sort_col.desc() if sort_dir == "desc" else sort_col.asc())
    result = paginate(q, skip, limit)
    result["items"] = [PantryItemResponse.model_validate(i) for i in result["items"]]
    return result


@router.post("/", response_model=PantryItemResponse, status_code=201)
def create_item(
    body: PantryItemCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = PantryItem(
        **body.model_dump(),
        user_id=current_user.id,
        canonical_name=make_canonical(body.name),
    )
    db.add(item)
    db.commit()
    db.refresh(item)
    return item


@router.get("/expiring", response_model=list[PantryItemResponse])
def expiring_items(
    days: int = Query(7, ge=1),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    cutoff = date.today() + timedelta(days=days)
    items = db.query(PantryItem).filter(
        PantryItem.user_id == current_user.id,
        (PantryItem.expiration_date <= cutoff) | (PantryItem.freshness_expires_at <= cutoff),
        PantryItem.freshness_status != "expired",
    ).order_by(PantryItem.expiration_date.asc()).all()
    return items


@router.get("/low-stock", response_model=list[PantryItemResponse])
def low_stock(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    items = db.query(PantryItem).filter(
        PantryItem.user_id == current_user.id,
        PantryItem.min_quantity.isnot(None),
        PantryItem.quantity <= PantryItem.min_quantity,
    ).order_by(PantryItem.name.asc()).all()
    return items


@router.get("/freshness-dashboard", response_model=dict)
def freshness_dashboard(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    base = db.query(PantryItem).filter(PantryItem.user_id == current_user.id)
    use_today = base.filter(PantryItem.freshness_status == "use_today").all()
    use_soon = base.filter(PantryItem.freshness_status == "use_soon").all()
    expired = base.filter(PantryItem.freshness_status == "expired").all()
    return {
        "use_today": [PantryItemResponse.model_validate(i) for i in use_today],
        "use_soon": [PantryItemResponse.model_validate(i) for i in use_soon],
        "expired": [PantryItemResponse.model_validate(i) for i in expired],
        "counts": {
            "use_today": len(use_today),
            "use_soon": len(use_soon),
            "expired": len(expired),
        },
    }


@router.post("/import/receipt", response_model=dict)
def import_receipt(
    current_user: User = Depends(get_current_user),
):
    return {"message": "AI receipt parsing coming in Phase 2", "items": []}


@router.get("/{item_id}", response_model=PantryItemResponse)
def get_item(
    item_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_item(db, item_id, current_user.id)


@router.patch("/{item_id}", response_model=PantryItemResponse)
def update_item(
    item_id: UUID,
    body: PantryItemUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = _get_item(db, item_id, current_user.id)
    data = body.model_dump(exclude_unset=True)
    if "name" in data:
        data["canonical_name"] = make_canonical(data["name"])
    for k, v in data.items():
        setattr(item, k, v)
    item.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return item


@router.delete("/{item_id}", status_code=204)
def delete_item(
    item_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = _get_item(db, item_id, current_user.id)
    db.delete(item)
    db.commit()


@router.post("/{item_id}/adjust", response_model=PantryItemResponse)
def adjust_quantity(
    item_id: UUID,
    body: AdjustQuantityRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = _get_item(db, item_id, current_user.id)
    current = item.quantity or 0
    item.quantity = max(0, current + body.amount)
    item.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return item


@router.post("/{item_id}/open", response_model=PantryItemResponse)
def mark_opened(
    item_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = _get_item(db, item_id, current_user.id)
    item.opened_date = date.today()
    if item.freshness_status == "fresh":
        item.freshness_status = "use_soon"
    item.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(item)
    return item


@router.post("/{item_id}/waste", response_model=dict)
def log_waste(
    item_id: UUID,
    body: WasteRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    item = _get_item(db, item_id, current_user.id)
    waste = WasteLog(
        user_id=current_user.id,
        pantry_item_id=item.id,
        item_name=item.name,
        quantity_wasted=body.quantity_wasted or item.quantity,
        unit=body.unit or item.unit,
        reason=body.reason,
        wasted_date=date.today(),
        notes=body.notes,
    )
    db.add(waste)
    if body.quantity_wasted and item.quantity and body.quantity_wasted < item.quantity:
        item.quantity -= body.quantity_wasted
    else:
        db.delete(item)
    db.commit()
    return {"message": "Waste logged", "waste_id": str(waste.id)}
