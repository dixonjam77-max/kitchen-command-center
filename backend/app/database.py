import uuid
from datetime import datetime, timezone

from sqlalchemy import create_engine, Column, DateTime
from sqlalchemy.dialects.postgresql import UUID
from sqlalchemy.orm import sessionmaker, DeclarativeBase

from app.config import get_settings

settings = get_settings()

# Normalize DATABASE_URL: ensure we use psycopg v3 driver (not psycopg2)
_db_url = settings.DATABASE_URL
if _db_url.startswith("postgresql://"):
    _db_url = _db_url.replace("postgresql://", "postgresql+psycopg://", 1)
elif _db_url.startswith("postgres://"):
    _db_url = _db_url.replace("postgres://", "postgresql+psycopg://", 1)

# Cloud Postgres providers (Supabase, Neon) require SSL connections.
# For psycopg v3, SSL is configured via the connection URL, not connect_args.
_is_cloud = "supabase" in _db_url or "neon.tech" in _db_url or "pooler" in _db_url
if _is_cloud and "sslmode" not in _db_url:
    _db_url += ("&" if "?" in _db_url else "?") + "sslmode=require"

engine = create_engine(_db_url)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)


class Base(DeclarativeBase):
    pass


class BaseMixin:
    """Adds UUID primary key and timestamps to all models."""

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    created_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        nullable=False,
    )
    updated_at = Column(
        DateTime(timezone=True),
        default=lambda: datetime.now(timezone.utc),
        onupdate=lambda: datetime.now(timezone.utc),
        nullable=False,
    )


def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()
