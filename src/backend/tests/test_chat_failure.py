"""A failed AI turn must fail loudly but not lose the user's message.

Needs a real database — the whole point is what survives in it.

Issue #8's last acceptance criterion: CI should cover a failed AI/tool turn
*and its persisted outcome*. This is the behaviour that makes that outcome
worth asserting rather than assuming.

When Gemini is unavailable, the route answers 500 and — this is the part that
matters — the user's message stays in the database. The chat route commits it
before any LLM call rather than at the end of the request, so a model outage
costs the user their reply, not their input.

That ordering was a deliberate change (issue #12) and until now nothing tested
it. A turn that fails is the one case where a rollback is most tempting and
most wrong: rolling back would also discard something the user actually typed.

The failure path also has to stay a failure. Silently returning a generic
success with an empty reply would make the outage invisible, so the assertions
check the status code as well as the rows.
"""

import contextlib
import json
import uuid

import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient

from database import engine
from main import app, get_current_user
from models import ChatRequest, ChatResponse

pytestmark = pytest.mark.integration

ALICE = "test-chat-alice"


@pytest.fixture
def alice(monkeypatch):
    """A real row in Better Auth's `user` table so the FKs hold."""
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                'INSERT INTO "user" (id, name, email, "emailVerified",'
                ' "createdAt", "updatedAt")'
                " VALUES (:id, :name, :email, false, now(), now())"
                " ON CONFLICT (id) DO NOTHING"
            ),
            {"id": ALICE, "name": ALICE, "email": "alice-chat@test.invalid"},
        )

    # The route refuses to start without a key, before it does any work at all.
    # Without this the test passes locally off an untracked `.env` and fails in
    # CI for the wrong reason — and worse, it would be asserting that nothing
    # was persisted when the route had never reached the database.
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-not-used")

    app.dependency_overrides[get_current_user] = lambda: ALICE
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        with engine.begin() as conn:
            # Cascades to conversations, messages and tasks.
            conn.execute(sa.text('DELETE FROM "user" WHERE id = :id'), {"id": ALICE})


def _rows(table: str, **where) -> list[sa.Row]:
    clause = " AND ".join(f"{k} = :{k}" for k in where)
    with engine.connect() as conn:
        return conn.execute(
            sa.text(f"SELECT * FROM {table} WHERE {clause}"), where
        ).fetchall()


def _break_the_model(monkeypatch, exc: Exception):
    """Make the LLM call fail at the first completion."""

    class _Boom:
        async def create(self, **kwargs):
            raise exc

    monkeypatch.setattr(
        main_module(), "get_openai_client", lambda: type("C", (), {"chat": type("K", (), {"completions": _Boom()})()})()
    )

    # The MCP subprocess opens before the first completion. It needs no
    # database session of its own — see test_chat_session_scope.py.
    @contextlib.asynccontextmanager
    async def _fake_stdio(params):
        yield (None, None)

    class _FakeSession:
        def __init__(self, r, w):
            pass

        async def __aenter__(self):
            return self

        async def __aexit__(self, *exc):
            return False

        async def initialize(self):
            return None

        async def list_tools(self):
            return type("R", (), {"tools": []})()

    monkeypatch.setattr(main_module(), "stdio_client", _fake_stdio)
    monkeypatch.setattr(main_module(), "ClientSession", _FakeSession)


def main_module():
    import main

    return main


def _json(response):
    """Normalise the three shapes a chat response arrives in.

    `call_route` invokes the route function directly and gets a `ChatResponse`;
    `TestClient` gives a `Response`. Tests should not care which.
    """
    if isinstance(response, ChatResponse):
        return response.model_dump()
    if hasattr(response, "json"):
        return response.json()
    return json.loads(response)


def call_route(
    user_id: str,
    message: str,
    conversation_id: str | None = None,
    authenticated_user_id: str | None = None,
):
    """Invoke the chat route directly, whichever shape it has.

    The route used to take its repositories by dependency injection and now
    opens its own sessions. Supplying them when they are declared keeps this
    test meaningful against both: without it, calling the old shape would fail
    on a `Depends` object having no `.session`, which says nothing about
    persistence.
    """
    import asyncio
    import inspect

    from database import SessionLocal
    from repositories import SqlConversationRepository, SqlMessageRepository

    main = main_module()
    extra = {}
    session = SessionLocal()
    try:
        for name in inspect.signature(main.chat_with_agent).parameters:
            if name == "conversation_repo":
                extra[name] = SqlConversationRepository(session)
            elif name == "message_repo":
                extra[name] = SqlMessageRepository(session)

        kwargs = dict(
            user_id=user_id,
            chat_req=ChatRequest(message=message, conversation_id=conversation_id),
            authenticated_user_id=authenticated_user_id or user_id,
            **extra,
        )
        return asyncio.run(main.chat_with_agent(**kwargs))
    finally:
        session.close()


def test_a_failed_llm_call_still_persists_the_user_message(alice, monkeypatch):
    """The turn fails; the input survives. Neither is negotiable."""
    from fastapi import HTTPException

    _break_the_model(monkeypatch, RuntimeError("model unavailable"))
    message = f"a request that will never be answered {uuid.uuid4().hex[:8]}"

    response = call_route(ALICE, message)

    # Changed in issue #4. This used to assert a 500, and was right to: at the
    # time a failure and a success were indistinguishable except by status
    # code. The turn now reports `outcome`, so the status code no longer
    # carries that meaning and a failed model call is a 200 saying so.
    #
    # What has not changed is the point of the test: the failure must stay
    # visible. Asserting the status code alone would pass even if the response
    # claimed everything had gone fine.
    body = _json(response)
    assert body["outcome"] == "failed", (
        f"a failed model turn reported {body['outcome']!r}; an outage must not "
        "look like a completed turn"
    )

    stored = _rows("messages", user_id=ALICE)
    assert len(stored) == 1, f"expected exactly the user's message to survive, got {len(stored)}"
    assert stored[0].role == "user"
    assert stored[0].content == message

    # The assistant never got to speak, so it must not appear.
    assert not [r for r in stored if r.role == "assistant"], (
        "an assistant message was persisted for a turn that produced none"
    )

    conversations = _rows("conversations", user_id=ALICE)
    assert len(conversations) == 1, (
        "the conversation should exist even though the turn failed, otherwise "
        "the next attempt starts a new thread and the user's input is orphaned"
    )


def test_a_failed_turn_leaves_the_conversation_reusable(alice, monkeypatch):
    """A failure must not poison the thread the user retries on.

    The second attempt succeeds, and it must be appended to the same
    conversation rather than starting a fresh one — otherwise every transient
    outage would silently split the user's history.
    """
    from fastapi import HTTPException

    first = f"first attempt {uuid.uuid4().hex[:8]}"

    _break_the_model(monkeypatch, RuntimeError("model unavailable"))
    first_turn = call_route(ALICE, first)
    assert _json(first_turn)["outcome"] == "failed", (
        "the first turn was expected to fail, and to say so"
    )

    conversation_id = _rows("conversations", user_id=ALICE)[0].id

    # Now let the second turn through, with a model that answers.
    class _Answer:
        content = "here you go"

        class _M:
            content = "here you go"
            tool_calls = None

        choices = [type("C", (), {"message": _M()})()]

        async def create(self, **kwargs):
            return _Answer()

    import main

    monkeypatch.setattr(
        main, "get_openai_client",
        lambda: type("C", (), {"chat": type("K", (), {"completions": _Answer()})()})(),
    )

    response = alice.post(
        f"/api/{ALICE}/chat", json={"message": "second attempt", "conversation_id": str(conversation_id)}
    )
    assert response.status_code == 200, response.text
    assert response.json()["conversation_id"] == str(conversation_id), (
        "the retry started a new conversation; the user's history is now split"
    )

    messages = _rows("messages", user_id=ALICE)
    roles = [m.role for m in messages]
    assert roles.count("user") == 2, f"expected both user messages, got {roles}"
    assert roles.count("assistant") == 1, f"expected one assistant message, got {roles}"


def test_an_unauthenticated_turn_persists_nothing(alice, monkeypatch):
    """A rejected request must leave no trace — not even the input.

    The counterpart to the test above: we keep the user's message when the
    *model* fails, and drop it when the *request* is not authorized.
    """
    from fastapi import HTTPException

    app.dependency_overrides.pop(get_current_user, None)
    _break_the_model(monkeypatch, RuntimeError("should never be reached"))

    with pytest.raises(HTTPException) as excinfo:
        call_route(ALICE, "must not be stored", authenticated_user_id="someone-else")
    assert excinfo.value.status_code == 403

    assert _rows("messages", user_id=ALICE) == [], (
        "an unauthorized request wrote to the conversation"
    )