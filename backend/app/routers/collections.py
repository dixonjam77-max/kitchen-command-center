from uuid import UUID

from fastapi import APIRouter, Depends, HTTPException
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.recipe import RecipeCollection, RecipeCollectionItem, Recipe
from app.models.user import User
from app.schemas.recipe import (
    RecipeCollectionCreate, RecipeCollectionUpdate,
    RecipeCollectionResponse, CollectionAddRecipeRequest,
    RecipeListResponse,
)
from app.utils.auth import get_current_user

router = APIRouter()


def _get_collection(db: Session, collection_id: UUID, user_id) -> RecipeCollection:
    coll = db.query(RecipeCollection).filter(
        RecipeCollection.id == collection_id,
        RecipeCollection.user_id == user_id,
    ).first()
    if not coll:
        raise HTTPException(status_code=404, detail="Collection not found")
    return coll


@router.get("/", response_model=list[dict])
def list_collections(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    collections = db.query(RecipeCollection).filter(
        RecipeCollection.user_id == current_user.id,
    ).order_by(RecipeCollection.sort_order.asc()).all()
    results = []
    for c in collections:
        data = RecipeCollectionResponse.model_validate(c).model_dump()
        data["recipe_count"] = len(c.items)
        results.append(data)
    return results


@router.post("/", response_model=RecipeCollectionResponse, status_code=201)
def create_collection(
    body: RecipeCollectionCreate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    coll = RecipeCollection(**body.model_dump(), user_id=current_user.id)
    db.add(coll)
    db.commit()
    db.refresh(coll)
    return coll


@router.patch("/{collection_id}", response_model=RecipeCollectionResponse)
def update_collection(
    collection_id: UUID,
    body: RecipeCollectionUpdate,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    coll = _get_collection(db, collection_id, current_user.id)
    for k, v in body.model_dump(exclude_unset=True).items():
        setattr(coll, k, v)
    db.commit()
    db.refresh(coll)
    return coll


@router.delete("/{collection_id}", status_code=204)
def delete_collection(
    collection_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    coll = _get_collection(db, collection_id, current_user.id)
    db.delete(coll)
    db.commit()


@router.post("/{collection_id}/recipes", status_code=201)
def add_recipe_to_collection(
    collection_id: UUID,
    body: CollectionAddRecipeRequest,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_collection(db, collection_id, current_user.id)
    recipe = db.query(Recipe).filter(
        Recipe.id == body.recipe_id, Recipe.user_id == current_user.id
    ).first()
    if not recipe:
        raise HTTPException(status_code=404, detail="Recipe not found")
    existing = db.query(RecipeCollectionItem).filter(
        RecipeCollectionItem.collection_id == collection_id,
        RecipeCollectionItem.recipe_id == body.recipe_id,
    ).first()
    if existing:
        raise HTTPException(status_code=400, detail="Recipe already in collection")
    item = RecipeCollectionItem(
        collection_id=collection_id,
        recipe_id=body.recipe_id,
        sort_order=body.sort_order,
    )
    db.add(item)
    db.commit()
    return {"message": "Recipe added to collection"}


@router.delete("/{collection_id}/recipes/{recipe_id}", status_code=204)
def remove_recipe_from_collection(
    collection_id: UUID,
    recipe_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_collection(db, collection_id, current_user.id)
    item = db.query(RecipeCollectionItem).filter(
        RecipeCollectionItem.collection_id == collection_id,
        RecipeCollectionItem.recipe_id == recipe_id,
    ).first()
    if not item:
        raise HTTPException(status_code=404, detail="Recipe not in collection")
    db.delete(item)
    db.commit()


@router.get("/{collection_id}/recipes", response_model=list[RecipeListResponse])
def list_collection_recipes(
    collection_id: UUID,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    _get_collection(db, collection_id, current_user.id)
    items = db.query(RecipeCollectionItem).filter(
        RecipeCollectionItem.collection_id == collection_id,
    ).order_by(RecipeCollectionItem.sort_order.asc()).all()
    recipe_ids = [i.recipe_id for i in items]
    recipes = db.query(Recipe).filter(Recipe.id.in_(recipe_ids)).all()
    return recipes
