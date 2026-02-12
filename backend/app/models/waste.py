from sqlalchemy import Column, String, Integer, Float, Date, Boolean, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base, BaseMixin


class WasteLog(BaseMixin, Base):
    __tablename__ = "waste_log"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    pantry_item_id = Column(UUID(as_uuid=True), ForeignKey("pantry_items.id"), nullable=True)
    item_name = Column(String)
    quantity_wasted = Column(Float)
    unit = Column(String)
    reason = Column(String)
    wasted_date = Column(Date)
    estimated_cost = Column(Float)
    notes = Column(Text)

    user = relationship("User", back_populates="waste_logs")


class FreshnessRule(BaseMixin, Base):
    __tablename__ = "freshness_rules"

    canonical_name = Column(String, unique=True, index=True, nullable=False)
    category = Column(String)
    sealed_shelf_life_days = Column(Integer)
    opened_shelf_life_days = Column(Integer)
    storage_location = Column(String)
    storage_tips = Column(Text)
    freezable = Column(Boolean)
    frozen_shelf_life_days = Column(Integer)
    source = Column(String)
