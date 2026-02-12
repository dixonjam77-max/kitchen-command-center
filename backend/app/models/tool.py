from sqlalchemy import Column, String, Integer, Float, Date, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID, ARRAY
from sqlalchemy.orm import relationship

from app.database import Base, BaseMixin


class KitchenTool(BaseMixin, Base):
    __tablename__ = "kitchen_tools"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    category = Column(String)
    brand = Column(String)
    model = Column(String)
    condition = Column(String)
    location = Column(String)
    purchase_date = Column(Date)
    capabilities = Column(ARRAY(String), default=list)
    last_maintained = Column(Date)
    maintenance_interval_days = Column(Integer)
    maintenance_type = Column(String)
    notes = Column(Text)

    user = relationship("User", back_populates="kitchen_tools")
    consumables = relationship("ToolConsumable", back_populates="tool", cascade="all, delete-orphan")


class ToolConsumable(BaseMixin, Base):
    __tablename__ = "tool_consumables"

    tool_id = Column(UUID(as_uuid=True), ForeignKey("kitchen_tools.id"), nullable=False, index=True)
    consumable_name = Column(String, nullable=False)
    quantity = Column(Float)
    unit = Column(String)
    min_quantity = Column(Float)
    notes = Column(Text)

    tool = relationship("KitchenTool", back_populates="consumables")
