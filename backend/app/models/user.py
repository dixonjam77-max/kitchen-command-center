from sqlalchemy import Column, String, Text
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import relationship

from app.database import Base, BaseMixin


class User(BaseMixin, Base):
    __tablename__ = "users"

    email = Column(String, unique=True, index=True, nullable=False)
    name = Column(String)
    password_hash = Column(String, nullable=False)
    preferences = Column(JSONB, default=dict)

    pantry_items = relationship("PantryItem", back_populates="user", cascade="all, delete-orphan")
    kitchen_tools = relationship("KitchenTool", back_populates="user", cascade="all, delete-orphan")
    recipes = relationship("Recipe", back_populates="user", cascade="all, delete-orphan")
    recipe_collections = relationship("RecipeCollection", back_populates="user", cascade="all, delete-orphan")
    cook_logs = relationship("CookLog", back_populates="user", cascade="all, delete-orphan")
    meal_plans = relationship("MealPlan", back_populates="user", cascade="all, delete-orphan")
    grocery_lists = relationship("GroceryList", back_populates="user", cascade="all, delete-orphan")
    waste_logs = relationship("WasteLog", back_populates="user", cascade="all, delete-orphan")
