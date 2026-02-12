from logging.config import fileConfig
from sqlalchemy import create_engine, pool
from alembic import context

from app.config import get_settings
from app.database import Base
import app.models  # noqa: F401 — ensure all models are imported

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

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

config.set_main_option("sqlalchemy.url", _db_url)

target_metadata = Base.metadata


def run_migrations_offline():
    url = config.get_main_option("sqlalchemy.url")
    context.configure(url=url, target_metadata=target_metadata, literal_binds=True)
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online():
    connectable = create_engine(
        _db_url,
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(connection=connection, target_metadata=target_metadata)
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
