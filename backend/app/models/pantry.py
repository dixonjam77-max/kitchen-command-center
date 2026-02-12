from sqlalchemy import Column, String, Float, Date, Boolean, Text, ForeignKey
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import relationship

from app.database import Base, BaseMixin


class PantryItem(BaseMixin, Base):
    __tablename__ = "pantry_items"

    user_id = Column(UUID(as_uuid=True), ForeignKey("users.id"), nullable=False, index=True)
    name = Column(String, nullable=False)
    canonical_name = Column(String, index=True)
    category = Column(String, index=True)
    subcategory = Column(String)
    quantity = Column(Float)
    unit = Column(String)
    location = Column(String, index=True)
    brand = Column(String)
    expiration_date = Column(Date)
    opened_date = Column(Date)
    purchase_date = Column(Date)
    freshness_status = Column(String, default="fresh")
    freshness_expires_at = Column(Date)
    min_quantity = Column(Float)
    is_staple = Column(Boolean, default=False)
    preferred_brand = Column(String)
    batch_info = Column(String)
    notes = Column(Text)

    user = relationship("User", back_populates="pantry_items")
