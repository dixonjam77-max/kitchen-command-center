from sqlalchemy import Column, String, Integer, Date, Boolean, Text, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base, BaseMixin


class MealPlan(BaseMixin, Base):
    __tablename__ = "meal_plans"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    plan_date = Column(Date, nullable=False, index=True)
    meal_type = Column(String, nullable=False)
    recipe_id = Column(UUID(as_uuid=True), ForeignKey("recipes.id"), nullable=True)
    custom_meal = Column(String)
    servings = Column(Integer)
    notes = Column(Text)
    completed = Column(Boolean, default=False)
    completed_at = Column(DateTime(timezone=True))
    leftover_portions = Column(Integer)
    leftover_plan_id = Column(UUID(as_uuid=True), ForeignKey("meal_plans.id"), nullable=True)
    thaw_reminder_sent = Column(Boolean, default=False)
    prep_day_group = Column(String)
    sort_order = Column(Integer)

    user = relationship("User", back_populates="meal_plans")
    recipe = relationship("Recipe")
    leftover_source = relationship("MealPlan", remote_side="MealPlan.id")
