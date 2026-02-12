from sqlalchemy import Column, String, Integer, Float, Boolean, Text, ForeignKey, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base, BaseMixin


class GroceryList(BaseMixin, Base):
    __tablename__ = "grocery_lists"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    status = Column(String, default="active")
    store = Column(String)
    estimated_cost = Column(Float)
    notes = Column(Text)

    user = relationship("User", back_populates="grocery_lists")
    items = relationship("GroceryListItem", back_populates="grocery_list", cascade="all, delete-orphan")


class GroceryListItem(BaseMixin, Base):
    __tablename__ = "grocery_list_items"

    list_id = Column(UUID(as_uuid=True), ForeignKey("grocery_lists.id"), nullable=False, index=True)
    item_name = Column(String, nullable=False)
    canonical_name = Column(String)
    quantity = Column(Float)
    unit = Column(String)
    category = Column(String)
    store_section_order = Column(Integer)
    pantry_item_id = Column(UUID(as_uuid=True), ForeignKey("pantry_items.id"), nullable=True)
    estimated_price = Column(Float)
    checked = Column(Boolean, default=False)
    checked_at = Column(DateTime(timezone=True))
    added_to_pantry = Column(Boolean, default=False)
    source = Column(String)
    notes = Column(Text)

    grocery_list = relationship("GroceryList", back_populates="items")
