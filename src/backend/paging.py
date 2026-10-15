"""Keyset (cursor) pagination.

Issue #7. `LIMIT/OFFSET` looks simpler and is wrong here: the offset counts
rows, so anything inserted or deleted between two requests shifts everything
after it. A reader paging through tasks would see a task twice, or skip one
entirely, without anything failing.

Keyset paging anchors on the last row of the previous page instead of on a
count, so concurrent writes to rows *before* the cursor cannot affect the walk.

The cursor encodes the full sort key, which must include a tiebreaker. Ordering
by `created_at` alone leaves equal rows in an order the database does not
promise — and then a page boundary can fall between two rows the server did
not guarantee to be ordered, so the same task can appear on two pages or on
none.
"""

from __future__ import annotations

import base64
import binascii
from datetime import datetime
from uuid import UUID

DEFAULT_LIMIT = 50
MAX_LIMIT = 200


class InvalidCursor(ValueError):
    """Raised for a cursor this module cannot decode.

    Surfaced as a 400 rather than ignored. Ignoring a malformed cursor restarts
    the walk at the beginning, which silently duplicates the first page — the
    caller cannot tell that from a fresh request.
    """


def encode_cursor(sort_key: tuple[datetime, UUID]) -> str:
    """Opaque-enough cursor for the ``(created_at, id)`` keyset."""
    created_at, identifier = sort_key
    raw = f"{created_at.isoformat()}|{identifier}".encode()
    return base64.urlsafe_b64encode(raw).decode().rstrip("=")


def decode_cursor(cursor: str) -> tuple[datetime, UUID]:
    if not cursor:
        raise InvalidCursor("cursor is empty")

    padding = "=" * (-len(cursor) % 4)
    try:
        raw = base64.urlsafe_b64decode(cursor + padding).decode()
        created_at, _, identifier = raw.partition("|")
        if not created_at or not identifier:
            raise ValueError("missing a component")
        return datetime.fromisoformat(created_at), UUID(identifier)
    except (binascii.Error, ValueError, UnicodeDecodeError) as exc:
        raise InvalidCursor(f"cursor is not a valid keyset position: {cursor!r}") from exc


def clamp_limit(limit: int | None) -> int:
    """Bound a caller-supplied limit.

    The cap is the point: an unbounded `limit` is not a fast path, it is a way
    to ask for the whole table. A caller asking for more than the cap gets the
    cap, not an error, so a client never has to know the number.
    """
    if limit is None:
        return DEFAULT_LIMIT
    if limit < 1:
        raise InvalidCursor("limit must be at least 1")
    return min(limit, MAX_LIMIT)