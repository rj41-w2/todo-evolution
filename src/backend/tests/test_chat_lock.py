"""The conversation advisory lock must key the same across processes.

Hermetic — no database, so this runs in the fast CI job.

The chat route serialises conversation creation per user with a PostgreSQL
advisory lock. The key for that lock is derived from the user id, and if that
derivation is not stable across processes the lock is decorative: each worker
takes a different lock, nothing serialises, and two concurrent requests each
create a conversation.

The derivation in use was `abs(hash(user_id)) % (2**31)`. Python randomises
string hashing per process unless `PYTHONHASHSEED` is pinned, so the same
user produced:

    process 1 -> 567807432
    process 2 -> 1557717699
    process 3 -> 2037350390

One worker hides this completely, which is why it survived. The test below
pins nothing and varies the seed deliberately, because that is the only way
to see the property the lock depends on.

The fix derives the key from `hashlib`, which is stable across processes,
machines, and Postgres versions. Doing it in Python rather than with
Postgres's own `hashtext()` keeps this test hermetic.
"""

import os
import subprocess
import sys
from pathlib import Path

BACKEND_DIR = Path(__file__).resolve().parents[1]

USER_ID = "a-user-id-that-must-key-identically"


def _key_under_seed(seed: str) -> str:
    """Compute the lock key in a fresh interpreter with a pinned hash seed."""
    code = (
        "import sys;"
        "sys.path.insert(0, %r);"
        "import main;"
        "print(main.conversation_lock_key(%r))" % (str(BACKEND_DIR), USER_ID)
    )
    # Inherit the real environment and vary only what is under test. An
    # earlier version of this built a minimal env, and setting HOME to /tmp
    # moved Python's user site-packages out from under it — the subprocess
    # could not import fastapi and failed for a reason that had nothing to do
    # with locking.
    env = {
        **os.environ,
        "PYTHONHASHSEED": seed,
        # `main` raises at import without these, and the value is never dialled.
        "DATABASE_URL": "postgresql://nobody:nothing@localhost:1/nothing",
        "CORS_ORIGINS": "http://localhost:3000",
    }
    result = subprocess.run(
        [sys.executable, "-c", code],
        cwd=BACKEND_DIR,
        env=env,
        capture_output=True,
        text=True,
        timeout=120,
    )
    assert result.returncode == 0, (
        f"could not read the lock key under seed {seed}:\n{result.stderr[-2000:]}"
    )
    return result.stdout.strip()


def test_the_lock_key_is_identical_across_processes():
    """The property the advisory lock depends on.

    `hash()` cannot satisfy this and no amount of care at the call site will
    make it. This is the regression guard for that.
    """
    seeds = ["1", "2", "3", "4", "5"]
    keys = {seed: _key_under_seed(seed) for seed in seeds}

    distinct = set(keys.values())
    assert len(distinct) == 1, (
        "the conversation lock key differs between processes, so the advisory "
        f"lock does not serialise anything across workers: {keys}"
    )


def test_the_lock_key_is_a_pg_advisory_lock_key():
    """Shape check: `pg_advisory_xact_lock(bigint)` must accept what we return.

    Advisory locks take either one `bigint` or two `int4`. A value that is too
    large, negative, or not an integer fails at the database with a cast
    error, which would surface as a 500 on the first chat request instead of
    as a test failure.
    """
    code = (
        "import sys;"
        "sys.path.insert(0, %r);"
        "import main;"
        "print(main.conversation_lock_key(%r))" % (str(BACKEND_DIR), USER_ID)
    )
    env = {
        **os.environ,
        "DATABASE_URL": "postgresql://nobody:nothing@localhost:1/nothing",
        "CORS_ORIGINS": "http://localhost:3000",
    }
    result = subprocess.run(
        [sys.executable, "-c", code], cwd=BACKEND_DIR, env=env,
        capture_output=True, text=True, timeout=120,
    )
    assert result.returncode == 0, result.stderr[-2000:]

    value = int(result.stdout.strip())
    assert -(2**63) <= value < 2**63, f"{value} is outside the signed 64-bit range"


def test_a_lock_key_is_not_reachable_through_python_hash():
    """Documents *why* the helper exists, so it is not casually inlined again.

    Not a test of the production function — a demonstration that the
    alternative it replaced is genuinely unstable, so nobody re-derives the key
    inline believing `hash()` is fine.
    """
    code = "print(abs(hash(%r)) %% (2**31))" % USER_ID
    values = set()
    for seed in ("1", "2", "3", "4", "5"):
        env = {**os.environ, "PYTHONHASHSEED": seed}
        out = subprocess.run(
            [sys.executable, "-c", code], env=env,
            capture_output=True, text=True, timeout=60,
        )
        values.add(out.stdout.strip())

    assert len(values) > 1, (
        "Python's string hash produced a stable value across seeds here, which "
        "would mean the environment pins PYTHONHASHSEED. The advisory lock is "
        "correct either way, but this file is why it does not rely on that."
    )