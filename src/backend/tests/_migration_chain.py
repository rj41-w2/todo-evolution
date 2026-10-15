"""Read the committed Alembic revision chain from disk.

Both migration guards need the same answer to "which revisions does this
repository actually know about?", and that answer must have exactly one
source. Alembic can supply it (`ScriptDirectory.walk_revisions`), but it
raises on a chain it cannot resolve — which is the state we want to
*report*, not crash on. So this module parses the files directly and always
returns a description of the chain, well-formed or not.

Shared by:

* `test_bootability.py` — hermetic, asserts the chain committed here is sound.
* `test_migration_drift.py` — opt-in, asserts the *database* sits on a
  revision from that chain.
"""

from __future__ import annotations

import ast
from dataclasses import dataclass
from pathlib import Path

VERSIONS_DIR = Path(__file__).resolve().parents[1] / "migrations" / "versions"


@dataclass(frozen=True)
class Chain:
    """The committed chain. `revisions` maps revision id -> down_revision."""

    revisions: dict[str, str | None]
    files: dict[str, str]  # revision id -> filename

    @property
    def dangling(self) -> dict[str, str | None]:
        """`down_revision` values naming a revision this repo does not have."""
        return {
            rev: down
            for rev, down in self.revisions.items()
            if down is not None and down not in self.revisions
        }

    @property
    def heads(self) -> set[str]:
        """Revisions nothing else builds on — more than one means a branch."""
        parents = {d for d in self.revisions.values() if d is not None}
        return set(self.revisions) - parents

    @property
    def root(self) -> str | None:
        return next(iter(self.revisions), None)

    def reachable_from(self, head: str | None = None) -> set[str]:
        """Revisions on the path from `head` back to the root."""
        if head is None:
            return set(self.revisions)
        seen: set[str] = set()
        cursor: str | None = head
        while cursor is not None and cursor in self.revisions and cursor not in seen:
            seen.add(cursor)
            cursor = self.revisions[cursor]
        return seen


def read_chain() -> Chain:
    """Parse every migration file in `versions/` into a `Chain`.

    Only module-level annotated assignments are read. A `revision =` inside a
    function body is not part of the chain, and a naive tree walk would
    happily pick one up.
    """
    revisions: dict[str, str | None] = {}
    files: dict[str, str] = {}

    for path in sorted(VERSIONS_DIR.glob("*.py")):
        if path.name.startswith("_"):
            continue
        tree = ast.parse(path.read_text())
        found: dict[str, object] = {}
        for node in tree.body:  # module level only
            if isinstance(node, ast.AnnAssign) and isinstance(node.target, ast.Name):
                try:
                    found[node.target.id] = ast.literal_eval(node.value)
                except (ValueError, SyntaxError):
                    continue
        rev = found.get("revision")
        if rev is None:
            continue
        down = found.get("down_revision")
        revisions[rev] = down if isinstance(down, str) else None
        files[rev] = path.name

    return Chain(revisions=revisions, files=files)