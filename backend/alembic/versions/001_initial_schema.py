"""Initial schema — all tables

Revision ID: 001
Revises:
Create Date: 2025-01-01 00:00:00.000000
"""
from typing import Sequence, Union
from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY

revision: str = "001"
down_revision: Union[str, None] = None
branch_labels: Union[str, Sequence[str], None] = None
depends_on: Union[str, Sequence[str], None] = None


def upgrade() -> None:
    # --- users ---
    op.create_table(
        "users",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("email", sa.String, unique=True, index=True, nullable=False),
        sa.Column("name", sa.String),
        sa.Column("password_hash", sa.String, nullable=False),
        sa.Column("preferences", JSONB, server_default="{}"),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # --- pantry_items ---
    op.create_table(
        "pantry_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("canonical_name", sa.String, index=True),
        sa.Column("category", sa.String, index=True),
        sa.Column("subcategory", sa.String),
        sa.Column("quantity", sa.Float),
        sa.Column("unit", sa.String),
        sa.Column("location", sa.String, index=True),
        sa.Column("brand", sa.String),
        sa.Column("expiration_date", sa.Date),
        sa.Column("opened_date", sa.Date),
        sa.Column("purchase_date", sa.Date),
        sa.Column("freshness_status", sa.String, server_default="fresh"),
        sa.Column("freshness_expires_at", sa.Date),
        sa.Column("min_quantity", sa.Float),
        sa.Column("is_staple", sa.Boolean, server_default="false"),
        sa.Column("preferred_brand", sa.String),
        sa.Column("batch_info", sa.String),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # --- kitchen_tools ---
    op.create_table(
        "kitchen_tools",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("category", sa.String),
        sa.Column("brand", sa.String),
        sa.Column("model", sa.String),
        sa.Column("condition", sa.String),
        sa.Column("location", sa.String),
        sa.Column("purchase_date", sa.Date),
        sa.Column("capabilities", ARRAY(sa.String), server_default="{}"),
        sa.Column("last_maintained", sa.Date),
        sa.Column("maintenance_interval_days", sa.Integer),
        sa.Column("maintenance_type", sa.String),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # --- tool_consumables ---
    op.create_table(
        "tool_consumables",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("tool_id", UUID(as_uuid=True), sa.ForeignKey("kitchen_tools.id"), nullable=False, index=True),
        sa.Column("consumable_name", sa.String, nullable=False),
        sa.Column("quantity", sa.Float),
        sa.Column("unit", sa.String),
        sa.Column("min_quantity", sa.Float),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # --- recipes ---
    op.create_table(
        "recipes",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("servings", sa.Integer, server_default="4"),
        sa.Column("prep_time_minutes", sa.Integer),
        sa.Column("cook_time_minutes", sa.Integer),
        sa.Column("total_time_minutes", sa.Integer),
        sa.Column("instructions", JSONB, server_default="[]"),
        sa.Column("source_type", sa.String),
        sa.Column("source_url", sa.String),
        sa.Column("source_attribution", sa.String),
        sa.Column("tags", ARRAY(sa.String), server_default="{}"),
        sa.Column("cuisine", sa.String),
        sa.Column("difficulty", sa.String),
        sa.Column("dietary_flags", ARRAY(sa.String), server_default="{}"),
        sa.Column("estimated_calories_per_serving", sa.Integer),
        sa.Column("estimated_macros", JSONB),
        sa.Column("rating", sa.Float),
        sa.Column("photo_url", sa.String),
        sa.Column("is_favorite", sa.Boolean, server_default="false"),
        sa.Column("version", sa.Integer, server_default="1"),
        sa.Column("parent_recipe_id", UUID(as_uuid=True), sa.ForeignKey("recipes.id"), nullable=True),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # --- recipe_ingredients ---
    op.create_table(
        "recipe_ingredients",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("recipe_id", UUID(as_uuid=True), sa.ForeignKey("recipes.id"), nullable=False, index=True),
        sa.Column("pantry_item_id", UUID(as_uuid=True), sa.ForeignKey("pantry_items.id"), nullable=True),
        sa.Column("ingredient_name", sa.String, nullable=False),
        sa.Column("canonical_name", sa.String, index=True),
        sa.Column("quantity", sa.Float),
        sa.Column("unit", sa.String),
        sa.Column("preparation", sa.String),
        sa.Column("group_name", sa.String),
        sa.Column("sort_order", sa.Integer),
        sa.Column("optional", sa.Boolean, server_default="false"),
        sa.Column("substitutions", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # --- recipe_tools ---
    op.create_table(
        "recipe_tools",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("recipe_id", UUID(as_uuid=True), sa.ForeignKey("recipes.id"), nullable=False, index=True),
        sa.Column("tool_id", UUID(as_uuid=True), sa.ForeignKey("kitchen_tools.id"), nullable=True),
        sa.Column("tool_name", sa.String, nullable=False),
        sa.Column("optional", sa.Boolean, server_default="false"),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # --- recipe_collections ---
    op.create_table(
        "recipe_collections",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("description", sa.Text),
        sa.Column("sort_order", sa.Integer),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # --- recipe_collection_items ---
    op.create_table(
        "recipe_collection_items",
        sa.Column("collection_id", UUID(as_uuid=True), sa.ForeignKey("recipe_collections.id"), primary_key=True),
        sa.Column("recipe_id", UUID(as_uuid=True), sa.ForeignKey("recipes.id"), primary_key=True),
        sa.Column("sort_order", sa.Integer),
    )

    # --- cook_logs ---
    op.create_table(
        "cook_logs",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("recipe_id", UUID(as_uuid=True), sa.ForeignKey("recipes.id"), nullable=False, index=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("cooked_date", sa.Date, nullable=False),
        sa.Column("servings_made", sa.Integer),
        sa.Column("rating", sa.Float),
        sa.Column("modifications", sa.Text),
        sa.Column("photo_url", sa.String),
        sa.Column("notes", sa.Text),
        sa.Column("duration_minutes", sa.Integer),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # --- meal_plans ---
    op.create_table(
        "meal_plans",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("plan_date", sa.Date, nullable=False, index=True),
        sa.Column("meal_type", sa.String, nullable=False),
        sa.Column("recipe_id", UUID(as_uuid=True), sa.ForeignKey("recipes.id"), nullable=True),
        sa.Column("custom_meal", sa.String),
        sa.Column("servings", sa.Integer),
        sa.Column("notes", sa.Text),
        sa.Column("completed", sa.Boolean, server_default="false"),
        sa.Column("completed_at", sa.DateTime(timezone=True)),
        sa.Column("leftover_portions", sa.Integer),
        sa.Column("leftover_plan_id", UUID(as_uuid=True), sa.ForeignKey("meal_plans.id"), nullable=True),
        sa.Column("thaw_reminder_sent", sa.Boolean, server_default="false"),
        sa.Column("prep_day_group", sa.String),
        sa.Column("sort_order", sa.Integer),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # --- grocery_lists ---
    op.create_table(
        "grocery_lists",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("name", sa.String, nullable=False),
        sa.Column("status", sa.String, server_default="active"),
        sa.Column("store", sa.String),
        sa.Column("estimated_cost", sa.Float),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # --- grocery_list_items ---
    op.create_table(
        "grocery_list_items",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("list_id", UUID(as_uuid=True), sa.ForeignKey("grocery_lists.id"), nullable=False, index=True),
        sa.Column("item_name", sa.String, nullable=False),
        sa.Column("canonical_name", sa.String),
        sa.Column("quantity", sa.Float),
        sa.Column("unit", sa.String),
        sa.Column("category", sa.String),
        sa.Column("store_section_order", sa.Integer),
        sa.Column("pantry_item_id", UUID(as_uuid=True), sa.ForeignKey("pantry_items.id"), nullable=True),
        sa.Column("estimated_price", sa.Float),
        sa.Column("checked", sa.Boolean, server_default="false"),
        sa.Column("checked_at", sa.DateTime(timezone=True)),
        sa.Column("added_to_pantry", sa.Boolean, server_default="false"),
        sa.Column("source", sa.String),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # --- waste_log ---
    op.create_table(
        "waste_log",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("user_id", UUID(as_uuid=True), sa.ForeignKey("users.id"), nullable=False, index=True),
        sa.Column("pantry_item_id", UUID(as_uuid=True), sa.ForeignKey("pantry_items.id"), nullable=True),
        sa.Column("item_name", sa.String),
        sa.Column("quantity_wasted", sa.Float),
        sa.Column("unit", sa.String),
        sa.Column("reason", sa.String),
        sa.Column("wasted_date", sa.Date),
        sa.Column("estimated_cost", sa.Float),
        sa.Column("notes", sa.Text),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )

    # --- freshness_rules ---
    op.create_table(
        "freshness_rules",
        sa.Column("id", UUID(as_uuid=True), primary_key=True),
        sa.Column("canonical_name", sa.String, unique=True, index=True, nullable=False),
        sa.Column("category", sa.String),
        sa.Column("sealed_shelf_life_days", sa.Integer),
        sa.Column("opened_shelf_life_days", sa.Integer),
        sa.Column("storage_location", sa.String),
        sa.Column("storage_tips", sa.Text),
        sa.Column("freezable", sa.Boolean),
        sa.Column("frozen_shelf_life_days", sa.Integer),
        sa.Column("source", sa.String),
        sa.Column("created_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(timezone=True), nullable=False, server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("freshness_rules")
    op.drop_table("waste_log")
    op.drop_table("grocery_list_items")
    op.drop_table("grocery_lists")
    op.drop_table("meal_plans")
    op.drop_table("cook_logs")
    op.drop_table("recipe_collection_items")
    op.drop_table("recipe_collections")
    op.drop_table("recipe_tools")
    op.drop_table("recipe_ingredients")
    op.drop_table("recipes")
    op.drop_table("tool_consumables")
    op.drop_table("kitchen_tools")
    op.drop_table("pantry_items")
    op.drop_table("users")
