"""Starting a chat must mean starting a chat.

Needs a database. The behaviour under test is entirely about which row a
message lands in.

Issue #5's first acceptance criterion, and it was broken by construction rather
than by accident. When the client sends no `conversation_id` — which is exactly
what it does after "New chat", because `clearChat` sets the id to null — the
backend did this:

    conversation = conversation_repo.get_latest_by_user(user_id)
    if not conversation:
        conversation = conversation_repo.create_for_user(user_id)

It resumed the most recent conversation. So the button labelled "New chat"
appended to the old one. Demonstrated before the fix: two turns, one
conversation, two messages.

The server cannot tell "this is a new chat" from "the client forgot the id", so
it guessed — and the guess was the one that makes the feature impossible. The
resolution is for the server to stop guessing. No `conversation_id` now always
means a new conversation, and resuming is something the client asks for by
sending one.

That also removes the advisory lock. It existed only to stop two requests
racing to create *the* conversation for a user; when every unadorned request
creates its own, there is no race left to serialise.
"""

import json
import threading
import uuid

import pytest
import sqlalchemy as sa

from database import engine
from main import app, get_current_user

pytestmark = pytest.mark.integration

ALICE = "test-lifecycle-alice"


@pytest.fixture
def alice(monkeypatch):
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                'INSERT INTO "user" (id, name, email, "emailVerified",'
                ' "createdAt", "updatedAt")'
                " VALUES (:id, :id, :email, false, now(), now())"
                " ON CONFLICT (id) DO NOTHING"
            ),
            {"id": ALICE, "name": ALICE, "email": "lifecycle@test.invalid"},
        )
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-not-used")
    app.dependency_overrides[get_current_user] = lambda: ALICE
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        with engine.begin() as conn:
            # Cascades to conversations, messages and tasks.
            conn.execute(sa.text('DELETE FROM "user" WHERE id = :id'), {"id": ALICE})


def script_the_model(monkeypatch):
    """A model that answers without using any tool.

    `create` is installed as a class attribute, so it needs `self` — without
    it every call dies with "takes 0 positional arguments but 1 was given",
    which looks like a production fault.
    """

    async def create(self, **kwargs):
        return type(
            "R",
            (),
            {"choices": [type("C", (), {"message": type("M", (), {"content": "ok", "tool_calls": None})()})()]},
        )()

    monkeypatch.setattr(
        "main.get_openai_client",
        lambda: type("C", (), {"chat": type("K", (), {"completions": type("X", (), {"create": create})()})()})(),
    )


def _post(**body):
    from fastapi.testclient import TestClient

    return TestClient(app).post(f"/api/{ALICE}/chat", json=body)


def _conversations() -> list[str]:
    with engine.connect() as conn:
        return [
            r[0]
            for r in conn.execute(
                sa.text("SELECT id FROM conversations WHERE user_id = :u ORDER BY created_at"),
                {"u": ALICE},
            ).fetchall()
        ]


def _user_messages(conversation_id: str) -> list[str]:
    """What the user said in this conversation, in order.

    Assistant turns are stored in the same table and were initially asserted
    against here, which failed for a reason that had nothing to do with the
    conversation bug — every thread legitimately contains the model's replies.
    """
    return [c for role, c in _messages(conversation_id) if role == "user"]


def _messages(conversation_id: str) -> list[tuple]:
    with engine.connect() as conn:
        return [
            (r[0], r[1])
            for r in conn.execute(
                sa.text(
                    "SELECT role, content FROM messages"
                    " WHERE conversation_id = :c ORDER BY created_at"
                ),
                {"c": conversation_id},
            ).fetchall()
        ]


# --- Starting a new chat ---------------------------------------------------


def test_a_turn_with_no_conversation_id_starts_a_new_one(alice, monkeypatch):
    """The regression that made the "New chat" button impossible."""
    script_the_model(monkeypatch)

    first = _post(message="first")
    second = _post(message="second")  # no conversation_id — what clearChat leaves

    assert first.status_code == 200, first.text
    assert second.status_code == 200, second.text
    assert first.json()["conversation_id"] != second.json()["conversation_id"], (
        "a turn with no conversation_id resumed the most recent conversation, "
        "so 'New chat' appended to the old one instead of starting a new one"
    )
    assert len(_conversations()) == 2, (
        f"expected two conversations after two new chats, got {_conversations()}"
    )


def test_each_new_chat_is_its_own_thread(alice, monkeypatch):
    """Not merely a new id — a genuinely separate history.

    The middle turn also carries no id, so under the current semantics it gets
    a conversation of its own. An earlier version of this test expected it to
    land in the first one, which is exactly the behaviour being removed.
    """
    script_the_model(monkeypatch)

    a = _post(message="about invoices").json()["conversation_id"]
    groceries = _post(message="about groceries").json()["conversation_id"]
    b = _post(message="about invoices again").json()["conversation_id"]

    assert len({a, groceries, b}) == 3, "two of the three chats shared a conversation"
    assert len(_conversations()) == 3, f"expected three conversations, got {_conversations()}"

    assert _user_messages(a) == ["about invoices"], _user_messages(a)
    assert _user_messages(groceries) == ["about groceries"], _user_messages(groceries)
    assert _user_messages(b) == ["about invoices again"], _user_messages(b)


# --- Resuming --------------------------------------------------------------


def test_sending_a_conversation_id_appends_to_it(alice, monkeypatch):
    """The other half: resuming must still work."""
    script_the_model(monkeypatch)

    cid = _post(message="first").json()["conversation_id"]
    second = _post(message="second", conversation_id=cid)

    assert second.status_code == 200, second.text
    assert second.json()["conversation_id"] == cid
    assert _user_messages(cid) == ["first", "second"]
    assert len(_conversations()) == 1, "resuming created a second conversation"


def test_history_is_replayed_when_resuming(alice, monkeypatch):
    """The resumed thread's earlier turns must reach the model.

    Otherwise "resume" would silently start from nothing and the model would
    answer a follow-up question with no idea what it referred to.
    """
    script_the_model(monkeypatch)
    cid = _post(message="remember: my cat is called Rex").json()["conversation_id"]

    seen: list = []

    async def create(self, **kwargs):
        seen.extend(m.get("content") for m in kwargs["messages"])
        return type(
            "R",
            (),
            {"choices": [type("C", (), {"message": type("M", (), {"content": "ok", "tool_calls": None})()})()]},
        )()

    import main

    main.get_openai_client = lambda: type(
        "C", (), {"chat": type("K", (), {"completions": type("X", (), {"create": create})()})()})()

    _post(message="what is my cat called?", conversation_id=cid)

    assert any("Rex" in (m or "") for m in seen), (
        "the earlier turn was not replayed to the model; a resumed thread "
        f"would have no context. Messages sent: {seen}"
    )


def test_an_unknown_conversation_id_is_refused(alice, monkeypatch):
    """A stale id from localStorage must not silently start a new chat.

    The client keeps its id in localStorage, so it can outlive the row — for
    instance if the conversation was deleted server-side. Falling back to a new
    conversation would lose the user's intent without telling them.
    """
    script_the_model(monkeypatch)

    response = _post(message="hello", conversation_id=str(uuid.uuid4()))
    assert response.status_code == 404, response.text
    assert _conversations() == [], "an unknown conversation id created a conversation anyway"


# --- Concurrency -----------------------------------------------------------


def test_concurrent_turns_on_one_conversation_all_land_there(alice, monkeypatch):
    """Identity must hold under real concurrency.

    Four threads, the same conversation, no coordination between them. Each
    response must name that conversation, and every message must be in it —
    not scattered across conversations created by a racing "latest" lookup.
    """
    script_the_model(monkeypatch)
    cid = _post(message="seed").json()["conversation_id"]

    results: list[str] = []
    lock = threading.Lock()

    def send(n: int):
        from fastapi.testclient import TestClient

        response = TestClient(app).post(
            f"/api/{ALICE}/chat",
            json={"message": f"concurrent {n}", "conversation_id": cid},
        )
        assert response.status_code == 200, response.text
        with lock:
            results.append(response.json()["conversation_id"])

    threads = [threading.Thread(target=send, args=(i,)) for i in range(4)]
    for t in threads:
        t.start()
    for t in threads:
        t.join(timeout=120)

    assert len(results) == 4, f"only {len(results)} of 4 concurrent turns completed"
    assert set(results) == {cid}, (
        f"concurrent turns landed in more than one conversation: {set(results)}"
    )
    assert len(_conversations()) == 1, (
        f"concurrency created extra conversations: {_conversations()}"
    )
