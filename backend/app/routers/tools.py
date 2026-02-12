from datetime import date, timedelta, datetime, timezone
from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException, Query
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.tool import KitchenTool, ToolConsumable
from app.models.user import User
from app.schemas.tool import (
    KitchenToolCreate, KitchenToolUpdate, KitchenToolResponse,
    ToolConsumableCreate, ToolConsumableUpdate, ToolConsumableResponse,
    MaintenanceRequest,
)
from app.utils.auth import get_current_user
from app.utils.pagination import paginate

router = APIRouter()


def _get_tool(db: Session, tool_id: UUID, user_id) -> KitchenTool:
    tool = db.query(KitchenTool).filter(
        KitchenTool.id == tool_id, KitchenTool.user_id == user_id
    ).first()
    if not tool:
        raise HTTPException(status_code=404, detail="Tool not found")
    return tool


@router.get("/", response_model=dict)
def list_tools(
    search: str | None = None,
    category: str | None = None,
    skip: int = Query(0, ge=0),
    limit: int = Query(50, ge=1, le=100),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    q = db.query(KitchenTool).filter(KitchenTool.user_id == current_user.id)
    if search:
        q = q.filter(KitchenTool.name.ilike(f"%{search}%"))
    if category:
        q = q.filter(KitchenTool.category == category)
    q = q.order_by(KitchenTool.name.asc())
    result = paginate(q, skip, limit)
    result["items"] = [KitchenToolResponse.model_validate(i) for i in result["items"]]
    return result


@router.post("/", response_model=KitchenToolResponse, status_code=201)
def create_tool(
    body: KitchenToolCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tool = KitchenTool(**body.model_dump(), user_id=current_user.id)
    db.add(tool)
    db.commit()
    db.refresh(tool)
    return tool


@router.get("/maintenance-due", response_model=list[KitchenToolResponse])
def maintenance_due(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tools = db.query(KitchenTool).filter(
        KitchenTool.user_id == current_user.id,
        KitchenTool.maintenance_interval_days.isnot(None),
    ).all()
    due = []
    today = date.today()
    for t in tools:
        if t.last_maintained is None:
            due.append(t)
        elif t.last_maintained + timedelta(days=t.maintenance_interval_days) <= today:
            due.append(t)
    return due


@router.get("/{tool_id}", response_model=KitchenToolResponse)
def get_tool(
    tool_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    return _get_tool(db, tool_id, current_user.id)


@router.patch("/{tool_id}", response_model=KitchenToolResponse)
def update_tool(
    tool_id: UUID,
    body: KitchenToolUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tool = _get_tool(db, tool_id, current_user.id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(tool, k, v)
    tool.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(tool)
    return tool


@router.delete("/{tool_id}", status_code=204)
def delete_tool(
    tool_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tool = _get_tool(db, tool_id, current_user.id)
    db.delete(tool)
    db.commit()


@router.post("/{tool_id}/maintain", response_model=KitchenToolResponse)
def log_maintenance(
    tool_id: UUID,
    body: MaintenanceRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    tool = _get_tool(db, tool_id, current_user.id)
    tool.last_maintained = date.today()
    if body.notes:
        tool.notes = body.notes
    tool.updated_at = datetime.now(timezone.utc)
    db.commit()
    db.refresh(tool)
    return tool


@router.get("/{tool_id}/consumables", response_model=list[ToolConsumableResponse])
def list_consumables(
    tool_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_tool(db, tool_id, current_user.id)  # verify ownership
    return db.query(ToolConsumable).filter(ToolConsumable.tool_id == tool_id).all()


@router.post("/{tool_id}/consumables", response_model=ToolConsumableResponse, status_code=201)
def add_consumable(
    tool_id: UUID,
    body: ToolConsumableCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_tool(db, tool_id, current_user.id)
    consumable = ToolConsumable(**body.model_dump(), tool_id=tool_id)
    db.add(consumable)
    db.commit()
    db.refresh(consumable)
    return consumable


@router.patch("/{tool_id}/consumables/{consumable_id}", response_model=ToolConsumableResponse)
def update_consumable(
    tool_id: UUID,
    consumable_id: UUID,
    body: ToolConsumableUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_tool(db, tool_id, current_user.id)
    consumable = db.query(ToolConsumable).filter(
        ToolConsumable.id == consumable_id, ToolConsumable.tool_id == tool_id
    ).first()
    if not consumable:
        raise HTTPException(status_code=404, detail="Consumable not found")
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(consumable, k, v)
    db.commit()
    db.refresh(consumable)
    return consumable
