"""Live drift guard: the database must sit on a revision this repo knows.

Opt-in, like every other test that needs a real PostgreSQL. Run it with:

    pytest -m integration

This exists because of issue #10, and it is the *only* test in the suite that
would have caught it.

The backend container could not start against the live database. Alembic
aborted with `Can't locate revision identified by '351b75580900'`, and every
frontend proxy call then failed with `ENOTFOUND backend` because the container
had died. That identifier was nowhere in the repository — no commit on any
branch, no file, no cache. A migration had been generated locally, applied to
the database, and then deleted instead of committed.

The boot gate missed it. `alembic upgrade head --sql` renders the chain
*committed here*, which proves the repository is internally consistent. It says
nothing about what the database thinks its revision is, because the disagreement
lives entirely on the database side. That is the gap this file closes.

Note this is deliberately not a CI gate. CI has no PostgreSQL service and every
backend test is hermetic against a lazy engine, so promoting this to a gate
means standing up a database and Better Auth's migrations in CI — a larger
change than the bug warrants. Until then, run it against Neon by hand.
"""

import pytest
from sqlalchemy import text

pytestmark = pytest.mark.integration


def _current_version() -> str | None:
    from database import engine

    with engine.connect() as conn:
        row = conn.execute(text("SELECT version_num FROM alembic_version")).fetchone()
    return row[0] if row else None


def test_live_database_sits_on_a_known_revision():
    """`alembic_version` must name a revision present in `migrations/versions/`.

    Note the asymmetry that makes this worth writing: an unknown value is
    fatal, but a *known* value that is merely behind is fine. `upgrade head`
    handles catching up, and this test must not fail merely because someone
    has not run migrations yet — only because the pointer names something
    that no code in this repository can resolve.
    """
    from _migration_chain import read_chain

    chain = read_chain()
    version = _current_version()

    assert version is not None, (
        "alembic_version is empty — run `alembic upgrade head` before the "
        "backend starts"
    )

    if version not in chain.revisions:
        known = ", ".join(f"{r} ({chain.files[r]})" for r in sorted(chain.revisions))
        raise AssertionError(
            f"the database is stamped with revision {version!r}, which is not "
            f"in migrations/versions/. This repository knows only: {known}.\n\n"
            "This is issue #10. Two things to know before fixing it:\n\n"
            "  1. `alembic stamp` does NOT work here. It fails with the same\n"
            "     \"Can't locate revision\" error, because it resolves the\n"
            "     current revision before writing the new one. Update the row\n"
            "     directly instead:\n\n"
            "       UPDATE alembic_version SET version_num = '<revision>';\n\n"
            "  2. Do NOT stamp to head. That skips whatever the database has\n"
            "     not actually applied, silently and permanently. Re-anchor to\n"
            "     the revision whose schema the database really has — verify by\n"
            "     diffing the live schema against that revision applied to a\n"
            "     scratch database — then `alembic upgrade head` to apply the\n"
            "     rest."
        )

    if not chain.dangling:
        assert version in chain.reachable_from(next(iter(chain.heads))), (
            f"revision {version!r} exists in the repo but is unreachable from "
            f"head — the committed chain is broken, see "
            "test_bootability.py::test_alembic_chain_committed_here_is_sound"
        )


def test_live_database_has_no_unapplied_schema_behind_the_pointer():
    """Whatever the pointer claims must actually be applied.

    A `stamp` that jumps ahead leaves the schema behind the pointer and no
    process ever notices — the migrations believe they ran, and the queries
    that needed them quietly lose their index. Issue #10 was one `CREATE INDEX`
    away from being exactly this.
    """
    from _migration_chain import read_chain

    chain = read_chain()
    version = _current_version()
    if version is None or version not in chain.revisions:
        pytest.skip("alembic_version is not on a known revision; see the other test")

    expected = {
        "ix_messages_conversation_id_created_at",
    }
    from database import engine

    with engine.connect() as conn:
        present = {
            row[0]
            for row in conn.execute(
                text("SELECT indexname FROM pg_indexes WHERE schemaname='public'")
            ).fetchall()
        }

    missing = sorted(expected - present)
    assert not missing, (
        f"alembic_version says {version!r}, but these objects committed by the "
        f"chain are absent from the database: {missing}. The pointer has run "
        "ahead of the schema. Re-apply with `alembic upgrade head` after "
        "re-anchoring — do not stamp further forward."
    )