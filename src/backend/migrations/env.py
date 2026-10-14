"""Alembic environment for the EVO-TODO backend.

Alembic owns the application tables (`tasks`, `conversations`, `messages`).
Better Auth owns `user`, `session`, `account`, `verification` and `jwks` — those
are created by the frontend's Better Auth CLI and are deliberately excluded from
autogenerate so Alembic never tries to drop them.
"""

import os
import sys
from logging.config import fileConfig
from pathlib import Path

from alembic import context
from dotenv import load_dotenv
from sqlalchemy import engine_from_config, pool

BACKEND_DIR = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(BACKEND_DIR))

# .env is a fallback; real environment variables (Docker) win.
load_dotenv(BACKEND_DIR / ".env")

import models  # noqa: E402,F401  registers tables on Base.metadata
import sqlalchemy as sa  # noqa: E402
from database import Base  # noqa: E402

# Our tables carry foreign keys into Better Auth's `user` table, which lives
# outside this metadata. SQLAlchemy must resolve that table to sort and diff the
# foreign keys, so import the stub from repositories. include_object() below
# keeps it out of autogenerate, so Alembic never creates, alters or drops the
# real table.
import repositories.user_stub  # noqa: F401  registers stub on Base.metadata

config = context.config

if config.config_file_name is not None:
    fileConfig(config.config_file_name)

database_url = os.getenv("DATABASE_URL")
if not database_url:
    raise RuntimeError("DATABASE_URL must be configured to run Alembic")

# escape % so configparser interpolation does not eat URL-encoded passwords
config.set_main_option("sqlalchemy.url", database_url.replace("%", "%%"))

target_metadata = Base.metadata

# Owned by Better Auth on the frontend. Never create, drop or alter these here.
BETTER_AUTH_TABLES = frozenset(
    {"user", "session", "account", "verification", "jwks", "twofactor", "two_factor"}
)


def include_object(obj, name, type_, reflected, compare_to):
    """Hide Better Auth objects from autogenerate comparisons."""
    if type_ == "table" and name in BETTER_AUTH_TABLES:
        return False
    if type_ == "index" and getattr(obj, "table", None) is not None:
        return obj.table.name not in BETTER_AUTH_TABLES
    if type_ == "foreign_key_constraint":
        return not any(
            fk.target_fullname.split(".")[0] in BETTER_AUTH_TABLES
            for fk in obj.elements
        )
    return True


def run_migrations_offline() -> None:
    context.configure(
        url=config.get_main_option("sqlalchemy.url"),
        target_metadata=target_metadata,
        include_object=include_object,
        compare_type=True,
        literal_binds=True,
        dialect_opts={"paramstyle": "named"},
    )
    with context.begin_transaction():
        context.run_migrations()


def run_migrations_online() -> None:
    connectable = engine_from_config(
        config.get_section(config.config_ini_section, {}),
        prefix="sqlalchemy.",
        poolclass=pool.NullPool,
    )
    with connectable.connect() as connection:
        context.configure(
            connection=connection,
            target_metadata=target_metadata,
            include_object=include_object,
            compare_type=True,
        )
        with context.begin_transaction():
            context.run_migrations()


if context.is_offline_mode():
    run_migrations_offline()
else:
    run_migrations_online()
