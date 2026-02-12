"""
Import / Export router — CSV import, CSV export, Google Doc / text import.
"""

import csv
import io
import json
import uuid
from datetime import date

from fastapi import APIRouter, Depends, HTTPException, UploadFile, File, Form
from fastapi.responses import StreamingResponse
from sqlalchemy.orm import Session

from app.database import get_db
from app.models.user import User
from app.models.pantry import PantryItem
from app.models.tool import KitchenTool
from app.models.recipe import Recipe, RecipeIngredient, RecipeTool
from app.utils.auth import get_current_user
from app.services.kitchen_ai import get_kitchen_ai

router = APIRouter()


def _make_canonical(name: str) -> str:
    """Generate a canonical name from a display name."""
    return name.lower().strip()


# ── CSV Import ────────────────────────────────────────────────────────

@router.post("/pantry/csv")
async def import_pantry_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import pantry items from a CSV file.

    Expected columns: name, category, quantity, unit, location, brand,
    expiration_date, notes (all optional except name).
    """
    content = await file.read()
    text = content.decode("utf-8-sig")  # handle BOM
    reader = csv.DictReader(io.StringIO(text))

    items_created = []
    errors = []

    for row_num, row in enumerate(reader, start=2):
        name = (row.get("name") or row.get("Name") or "").strip()
        if not name:
            errors.append(f"Row {row_num}: missing name, skipped")
            continue

        try:
            qty = float(row.get("quantity") or row.get("Quantity") or 0) or None
        except ValueError:
            qty = None

        exp_str = (row.get("expiration_date") or row.get("Expiration Date") or "").strip()
        exp_date = None
        if exp_str:
            try:
                exp_date = date.fromisoformat(exp_str)
            except ValueError:
                errors.append(f"Row {row_num}: invalid expiration_date '{exp_str}'")

        item = PantryItem(
            id=uuid.uuid4(),
            user_id=current_user.id,
            name=name,
            canonical_name=_make_canonical(name),
            category=(row.get("category") or row.get("Category") or "").strip() or None,
            quantity=qty,
            unit=(row.get("unit") or row.get("Unit") or "").strip() or None,
            location=(row.get("location") or row.get("Location") or "").strip() or None,
            brand=(row.get("brand") or row.get("Brand") or "").strip() or None,
            expiration_date=exp_date,
            notes=(row.get("notes") or row.get("Notes") or "").strip() or None,
        )
        db.add(item)
        items_created.append({"name": name, "category": item.category})

    db.commit()
    return {
        "imported": len(items_created),
        "errors": errors,
        "items": items_created,
    }


@router.post("/tools/csv")
async def import_tools_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import kitchen tools from a CSV file.

    Expected columns: name, category, brand, model, condition, location,
    capabilities (semicolon-separated), notes.
    """
    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    items_created = []
    errors = []

    for row_num, row in enumerate(reader, start=2):
        name = (row.get("name") or row.get("Name") or "").strip()
        if not name:
            errors.append(f"Row {row_num}: missing name, skipped")
            continue

        caps_raw = (row.get("capabilities") or row.get("Capabilities") or "").strip()
        capabilities = [c.strip() for c in caps_raw.split(";") if c.strip()] if caps_raw else []

        tool = KitchenTool(
            id=uuid.uuid4(),
            user_id=current_user.id,
            name=name,
            category=(row.get("category") or row.get("Category") or "").strip() or None,
            brand=(row.get("brand") or row.get("Brand") or "").strip() or None,
            model=(row.get("model") or row.get("Model") or "").strip() or None,
            condition=(row.get("condition") or row.get("Condition") or "").strip() or None,
            location=(row.get("location") or row.get("Location") or "").strip() or None,
            capabilities=capabilities,
            notes=(row.get("notes") or row.get("Notes") or "").strip() or None,
        )
        db.add(tool)
        items_created.append({"name": name, "category": tool.category})

    db.commit()
    return {
        "imported": len(items_created),
        "errors": errors,
        "items": items_created,
    }


@router.post("/recipes/csv")
async def import_recipes_csv(
    file: UploadFile = File(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import recipes from a CSV file.

    Expected columns: name, description, servings, prep_time_minutes,
    cook_time_minutes, total_time_minutes, cuisine, difficulty, tags (semicolon-separated),
    ingredients (semicolon-separated), instructions (pipe-separated steps).
    """
    content = await file.read()
    text = content.decode("utf-8-sig")
    reader = csv.DictReader(io.StringIO(text))

    items_created = []
    errors = []

    for row_num, row in enumerate(reader, start=2):
        name = (row.get("name") or row.get("Name") or "").strip()
        if not name:
            errors.append(f"Row {row_num}: missing name, skipped")
            continue

        try:
            servings = int(row.get("servings") or row.get("Servings") or 4)
        except ValueError:
            servings = 4

        tags_raw = (row.get("tags") or row.get("Tags") or "").strip()
        tags = [t.strip() for t in tags_raw.split(";") if t.strip()] if tags_raw else []

        instructions_raw = (row.get("instructions") or row.get("Instructions") or "").strip()
        instructions = []
        if instructions_raw:
            for i, step_text in enumerate(instructions_raw.split("|"), start=1):
                if step_text.strip():
                    instructions.append({"step": i, "text": step_text.strip()})

        def _int_or_none(val: str | None) -> int | None:
            if not val:
                return None
            try:
                return int(val)
            except ValueError:
                return None

        recipe = Recipe(
            id=uuid.uuid4(),
            user_id=current_user.id,
            name=name,
            description=(row.get("description") or row.get("Description") or "").strip() or None,
            servings=servings,
            prep_time_minutes=_int_or_none(row.get("prep_time_minutes") or row.get("Prep Time")),
            cook_time_minutes=_int_or_none(row.get("cook_time_minutes") or row.get("Cook Time")),
            total_time_minutes=_int_or_none(row.get("total_time_minutes") or row.get("Total Time")),
            instructions=instructions or None,
            cuisine=(row.get("cuisine") or row.get("Cuisine") or "").strip() or None,
            difficulty=(row.get("difficulty") or row.get("Difficulty") or "").strip() or None,
            tags=tags,
            dietary_flags=[],
            source_type="csv_import",
        )
        db.add(recipe)

        # Parse ingredients (semicolon-separated: "2 cups flour; 1 tsp salt")
        ingredients_raw = (row.get("ingredients") or row.get("Ingredients") or "").strip()
        if ingredients_raw:
            for sort_order, ing_str in enumerate(ingredients_raw.split(";"), start=1):
                ing_str = ing_str.strip()
                if not ing_str:
                    continue
                ingredient = RecipeIngredient(
                    id=uuid.uuid4(),
                    recipe_id=recipe.id,
                    ingredient_name=ing_str,
                    canonical_name=_make_canonical(ing_str),
                    sort_order=sort_order,
                )
                db.add(ingredient)

        items_created.append({"name": name, "cuisine": recipe.cuisine})

    db.commit()
    return {
        "imported": len(items_created),
        "errors": errors,
        "items": items_created,
    }


# ── CSV Export ────────────────────────────────────────────────────────

@router.get("/pantry/csv")
def export_pantry_csv(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export all pantry items as a CSV download."""
    items = db.query(PantryItem).filter(PantryItem.user_id == current_user.id).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "name", "category", "quantity", "unit", "location", "brand",
        "expiration_date", "opened_date", "purchase_date", "freshness_status",
        "is_staple", "notes",
    ])
    for item in items:
        writer.writerow([
            item.name, item.category or "", item.quantity or "",
            item.unit or "", item.location or "", item.brand or "",
            str(item.expiration_date) if item.expiration_date else "",
            str(item.opened_date) if item.opened_date else "",
            str(item.purchase_date) if item.purchase_date else "",
            item.freshness_status or "", item.is_staple, item.notes or "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=pantry_export.csv"},
    )


@router.get("/tools/csv")
def export_tools_csv(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export all kitchen tools as a CSV download."""
    tools = db.query(KitchenTool).filter(KitchenTool.user_id == current_user.id).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "name", "category", "brand", "model", "condition", "location",
        "capabilities", "last_maintained", "notes",
    ])
    for tool in tools:
        writer.writerow([
            tool.name, tool.category or "", tool.brand or "", tool.model or "",
            tool.condition or "", tool.location or "",
            ";".join(tool.capabilities or []),
            str(tool.last_maintained) if tool.last_maintained else "",
            tool.notes or "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=tools_export.csv"},
    )


@router.get("/recipes/csv")
def export_recipes_csv(
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Export all recipes as a CSV download."""
    recipes = db.query(Recipe).filter(Recipe.user_id == current_user.id).all()

    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow([
        "name", "description", "servings", "prep_time_minutes", "cook_time_minutes",
        "total_time_minutes", "cuisine", "difficulty", "tags", "dietary_flags",
        "ingredients", "rating", "source_type", "source_url",
    ])
    for recipe in recipes:
        # Collect ingredient names
        ingredients = db.query(RecipeIngredient).filter(
            RecipeIngredient.recipe_id == recipe.id
        ).order_by(RecipeIngredient.sort_order).all()
        ing_str = "; ".join(
            f"{i.quantity or ''} {i.unit or ''} {i.ingredient_name}".strip()
            for i in ingredients
        )

        writer.writerow([
            recipe.name, recipe.description or "", recipe.servings,
            recipe.prep_time_minutes or "", recipe.cook_time_minutes or "",
            recipe.total_time_minutes or "", recipe.cuisine or "",
            recipe.difficulty or "", ";".join(recipe.tags or []),
            ";".join(recipe.dietary_flags or []), ing_str,
            recipe.rating or "", recipe.source_type or "", recipe.source_url or "",
        ])

    output.seek(0)
    return StreamingResponse(
        iter([output.getvalue()]),
        media_type="text/csv",
        headers={"Content-Disposition": "attachment; filename=recipes_export.csv"},
    )


# ── Google Doc / Text Import ──────────────────────────────────────────

@router.post("/google-doc")
async def import_google_doc(
    doc_type: str = Form("pantry"),
    text: str = Form(...),
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Import items from unstructured text (Google Docs, pasted notes).

    Supported doc_type values: pantry, recipes, tools, grocery.
    The AI will parse the text and extract structured items.
    """
    if doc_type not in ("pantry", "recipes", "tools", "grocery"):
        raise HTTPException(400, f"Invalid doc_type: {doc_type}. Must be pantry, recipes, tools, or grocery.")

    ai = get_kitchen_ai()
    parsed_items = await ai.import_google_doc(text, doc_type)

    created = []

    if doc_type == "pantry":
        for item_data in parsed_items:
            item = PantryItem(
                id=uuid.uuid4(),
                user_id=current_user.id,
                name=item_data.get("name", "Unknown"),
                canonical_name=_make_canonical(item_data.get("name", "unknown")),
                category=item_data.get("category"),
                quantity=item_data.get("quantity"),
                unit=item_data.get("unit"),
                location=item_data.get("location"),
                brand=item_data.get("brand"),
                notes=item_data.get("notes"),
            )
            db.add(item)
            created.append({"name": item.name, "category": item.category})

    elif doc_type == "tools":
        for item_data in parsed_items:
            tool = KitchenTool(
                id=uuid.uuid4(),
                user_id=current_user.id,
                name=item_data.get("name", "Unknown"),
                category=item_data.get("category"),
                brand=item_data.get("brand"),
                condition=item_data.get("condition"),
                capabilities=item_data.get("capabilities", []),
                notes=item_data.get("notes"),
            )
            db.add(tool)
            created.append({"name": tool.name, "category": tool.category})

    elif doc_type == "recipes":
        for recipe_data in parsed_items:
            recipe = Recipe(
                id=uuid.uuid4(),
                user_id=current_user.id,
                name=recipe_data.get("name", "Imported Recipe"),
                description=recipe_data.get("description"),
                servings=recipe_data.get("servings", 4),
                prep_time_minutes=recipe_data.get("prep_time_minutes"),
                cook_time_minutes=recipe_data.get("cook_time_minutes"),
                total_time_minutes=recipe_data.get("total_time_minutes"),
                instructions=recipe_data.get("instructions"),
                cuisine=recipe_data.get("cuisine"),
                difficulty=recipe_data.get("difficulty"),
                tags=recipe_data.get("tags", []),
                dietary_flags=recipe_data.get("dietary_flags", []),
                source_type="google_doc",
                source_attribution=recipe_data.get("source_attribution"),
            )
            db.add(recipe)

            for sort_order, ing in enumerate(recipe_data.get("ingredients", []), start=1):
                ingredient = RecipeIngredient(
                    id=uuid.uuid4(),
                    recipe_id=recipe.id,
                    ingredient_name=ing.get("ingredient_name", ""),
                    canonical_name=_make_canonical(ing.get("ingredient_name", "")),
                    quantity=ing.get("quantity"),
                    unit=ing.get("unit"),
                    preparation=ing.get("preparation"),
                    group_name=ing.get("group_name"),
                    sort_order=sort_order,
                    optional=ing.get("optional", False),
                )
                db.add(ingredient)

            for tool_data in recipe_data.get("tools", []):
                rt = RecipeTool(
                    id=uuid.uuid4(),
                    recipe_id=recipe.id,
                    tool_name=tool_data.get("tool_name", ""),
                    optional=tool_data.get("optional", False),
                    notes=tool_data.get("notes"),
                )
                db.add(rt)

            created.append({"name": recipe.name, "cuisine": recipe.cuisine})

    elif doc_type == "grocery":
        # Return parsed items for the frontend to add to a grocery list
        db.commit()
        return {
            "imported": len(parsed_items),
            "items": parsed_items,
            "message": "Grocery items parsed. Add them to a grocery list from the Grocery page.",
        }

    db.commit()
    return {
        "imported": len(created),
        "items": created,
    }


# ── Recipe Sharing ────────────────────────────────────────────────────

@router.get("/recipes/{recipe_id}/share")
async def get_shareable_recipe(
    recipe_id: str,
    db: Session = Depends(get_db),
    current_user: User = Depends(get_current_user),
):
    """Get a shareable version of a recipe with AI-generated share card."""
    recipe = db.query(Recipe).filter(
        Recipe.id == recipe_id,
        Recipe.user_id == current_user.id,
    ).first()

    if not recipe:
        raise HTTPException(404, "Recipe not found")

    ingredients = db.query(RecipeIngredient).filter(
        RecipeIngredient.recipe_id == recipe.id
    ).order_by(RecipeIngredient.sort_order).all()

    tools = db.query(RecipeTool).filter(
        RecipeTool.recipe_id == recipe.id
    ).all()

    recipe_dict = {
        "name": recipe.name,
        "description": recipe.description,
        "servings": recipe.servings,
        "prep_time_minutes": recipe.prep_time_minutes,
        "cook_time_minutes": recipe.cook_time_minutes,
        "total_time_minutes": recipe.total_time_minutes,
        "instructions": recipe.instructions,
        "cuisine": recipe.cuisine,
        "difficulty": recipe.difficulty,
        "tags": recipe.tags or [],
        "dietary_flags": recipe.dietary_flags or [],
        "source_attribution": recipe.source_attribution,
        "ingredients": [
            {
                "ingredient_name": i.ingredient_name,
                "quantity": i.quantity,
                "unit": i.unit,
                "preparation": i.preparation,
                "group_name": i.group_name,
                "optional": i.optional,
            }
            for i in ingredients
        ],
        "tools": [
            {"tool_name": t.tool_name, "optional": t.optional, "notes": t.notes}
            for t in tools
        ],
    }

    # Generate AI share card
    ai = get_kitchen_ai()
    try:
        share_card = await ai.generate_share_card(recipe_dict)
    except Exception:
        share_card = {
            "title": recipe.name,
            "tagline": recipe.description or "",
            "highlights": [],
            "emoji": "🍳",
        }

    return {
        "recipe": recipe_dict,
        "share_card": share_card,
    }
