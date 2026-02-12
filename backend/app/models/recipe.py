from sqlalchemy import Column, String, Integer, Float, Date, Boolean, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, JSONB, ARRAY
from sqlalchemy.orm import relationship

from app.database import Base, BaseMixin


class Recipe(BaseMixin, Base):
    __tablename__ = "recipes"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    servings = Column(Integer, default=4)
    prep_time_minutes = Column(Integer)
    cook_time_minutes = Column(Integer)
    total_time_minutes = Column(Integer)
    instructions = Column(JSONB, default=list)
    source_type = Column(String)
    source_url = Column(String)
    source_attribution = Column(String)
    tags = Column(ARRAY(String), default=list)
    cuisine = Column(String)
    difficulty = Column(String)
    dietary_flags = Column(ARRAY(String), default=list)
    estimated_calories_per_serving = Column(Integer)
    estimated_macros = Column(JSONB)
    rating = Column(Float)
    photo_url = Column(String)
    is_favorite = Column(Boolean, default=False)
    version = Column(Integer, default=1)
    parent_recipe_id = Column(UUID(as_uuid=True), ForeignKey("recipes.id"), nullable=True)
    notes = Column(Text)

    user = relationship("User", back_populates="recipes")
    ingredients = relationship("RecipeIngredient", back_populates="recipe", cascade="all, delete-orphan")
    tools = relationship("RecipeTool", back_populates="recipe", cascade="all, delete-orphan")
    cook_logs = relationship("CookLog", back_populates="recipe", cascade="all, delete-orphan")
    parent_recipe = relationship("Recipe", remote_side="Recipe.id", backref="child_versions")


class RecipeIngredient(BaseMixin, Base):
    __tablename__ = "recipe_ingredients"

    recipe_id = Column(UUID(as_uuid=True), ForeignKey("recipes.id"), nullable=False, index=True)
    pantry_item_id = Column(UUID(as_uuid=True), ForeignKey("pantry_items.id"), nullable=True)
    ingredient_name = Column(String, nullable=False)
    canonical_name = Column(String, index=True)
    quantity = Column(Float)
    unit = Column(String)
    preparation = Column(String)
    group_name = Column(String)
    sort_order = Column(Integer)
    optional = Column(Boolean, default=False)
    substitutions = Column(Text)

    recipe = relationship("Recipe", back_populates="ingredients")


class RecipeTool(BaseMixin, Base):
    __tablename__ = "recipe_tools"

    recipe_id = Column(UUID(as_uuid=True), ForeignKey("recipes.id"), nullable=False, index=True)
    tool_id = Column(UUID(as_uuid=True), ForeignKey("kitchen_tools.id"), nullable=True)
    tool_name = Column(String, nullable=False)
    optional = Column(Boolean, default=False)
    notes = Column(Text)

    recipe = relationship("Recipe", back_populates="tools")


class RecipeCollection(BaseMixin, Base):
    __tablename__ = "recipe_collections"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    description = Column(Text)
    sort_order = Column(Integer)

    user = relationship("User", back_populates="recipe_collections")
    items = relationship("RecipeCollectionItem", back_populates="collection", cascade="all, delete-orphan")


class RecipeCollectionItem(Base):
    __tablename__ = "recipe_collection_items"

    collection_id = Column(UUID(as_uuid=True), ForeignKey("recipe_collections.id"), primary_key=True)
    recipe_id = Column(UUID(as_uuid=True), ForeignKey("recipes.id"), primary_key=True)
    sort_order = Column(Integer)

    collection = relationship("RecipeCollection", back_populates="items")
    recipe = relationship("Recipe")


class CookLog(BaseMixin, Base):
    __tablename__ = "cook_logs"

    recipe_id = Column(UUID(as_uuid=True), ForeignKey("recipes.id"), nullable=False, index=True)
    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    cooked_date = Column(Date, nullable=False)
    servings_made = Column(Integer)
    rating = Column(Float)
    modifications = Column(Text)
    photo_url = Column(String)
    notes = Column(Text)
    duration_minutes = Column(Integer)

    recipe = relationship("Recipe", back_populates="cook_logs")
    user = relationship("User", back_populates="cook_logs")
