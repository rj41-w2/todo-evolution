"""A saved conversation must be findable, not just addressable.

Needs a database.

Issue #13/#15. `POST /chat` accepts a `conversation_id` and appends to it, but
nothing could *find* a conversation: no list endpoint, and no way to read a
thread's history. Resuming worked only on the browser that started it, from
`localStorage`. On a second device a user's threads were unreachable.

The ordering trap is the reason this needs its own test. `conversations`
has an `updated_at` column with an `onupdate`, and it looks exactly like the
thing to sort by. Nothing ever updates a conversation row — messages do not
touch it — so it stays permanently equal to `created_at`. Sorting by it lists
threads in the order they were *started*, putting a week-old conversation
that has been busy all week below one from ten minutes ago.
"""

import uuid

import pytest
import sqlalchemy as sa

from database import engine
from main import app, get_current_user

pytestmark = pytest.mark.integration

ALICE = "test-list-alice"
BOB = "test-list-bob"


def script_the_model(monkeypatch):
    async def create(self, **kwargs):
        return type(
            "R",
            (),
            {"choices": [type("C", (), {"message": type("M", (), {"content": "ok", "tool_calls": None})()})()]},
        )()

    monkeypatch.setenv("GEMINI_API_KEY", "test-key-not-used")
    monkeypatch.setattr(
        "main.get_openai_client",
        lambda: type("C", (), {"chat": type("K", (), {"completions": type("X", (), {"create": create})()})()})(),
    )


@pytest.fixture
def alice():
    with engine.begin() as conn:
        for uid, email in ((ALICE, "list-alice@test.invalid"), (BOB, "list-bob@test.invalid")):
            conn.execute(
                sa.text(
                    'INSERT INTO "user" (id, name, email, "emailVerified",'
                    ' "createdAt", "updatedAt")'
                    " VALUES (:id, :id, :email, false, now(), now())"
                    " ON CONFLICT (id) DO NOTHING"
                ),
                {"id": uid, "email": email},
            )
    app.dependency_overrides[get_current_user] = lambda: ALICE
    try:
        yield
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        with engine.begin() as conn:
            for uid in (ALICE, BOB):
                conn.execute(sa.text('DELETE FROM "user" WHERE id = :id'), {"id": uid})


def _turn(message: str, conversation_id: str | None = None):
    from fastapi.testclient import TestClient

    body = {"message": message}
    if conversation_id:
        body["conversation_id"] = conversation_id
    return TestClient(app).post(f"/api/{ALICE}/chat", json=body)


def _list():
    from fastapi.testclient import TestClient

    return TestClient(app).get(f"/api/{ALICE}/conversations")


def _messages_of(conversation_id: str):
    from fastapi.testclient import TestClient

    return TestClient(app).get(f"/api/{ALICE}/conversations/{conversation_id}/messages")


# --- Listing ---------------------------------------------------------------


def test_a_new_conversation_appears_in_the_list(alice, monkeypatch):
    script_the_model(monkeypatch)
    cid = _turn("first thing").json()["conversation_id"]

    response = _list()
    assert response.status_code == 200, response.text
    entries = response.json()["conversations"]
    assert [e["id"] for e in entries] == [cid], entries


def test_the_most_recently_active_conversation_is_first(alice, monkeypatch):
    """The `updated_at` trap.

    The second conversation is started last but never used again; the first is
    older and gets a message afterwards. Ordering by activity must put the
    first on top. Ordering by `conversations.created_at` — the only column
    that looks like it could work — gets it backwards.
    """
    script_the_model(monkeypatch)

    busy = _turn("the original topic").json()["conversation_id"]
    _turn("a different topic, never revisited")

    _turn("following up on the original topic", conversation_id=busy)

    entries = _list().json()["conversations"]
    assert entries[0]["id"] == busy, (
        "the conversation used most recently did not come first; ordering is "
        f"by conversation creation, not by activity. Order: {[e['id'] for e in entries]}"
    )


def test_each_entry_carries_a_preview_and_a_count(alice, monkeypatch):
    script_the_model(monkeypatch)
    cid = _turn("what tasks do I have?").json()["conversation_id"]
    _turn("list them", conversation_id=cid)

    entry = _list().json()["conversations"][0]
    assert entry["preview"] == "ok", (
        f"preview is {entry['preview']!r}; expected the last message in the "
        "thread, which is what a user recognises their chat by"
    )
    assert entry["message_count"] == 4, (
        f"message_count is {entry['message_count']}; two turns are four messages"
    )
    assert entry["last_activity_at"] is not None


def test_a_conversation_with_no_messages_still_appears(alice, monkeypatch):
    """Created but never written to — it must not vanish from the list.

    Hiding it would make a freshly-started conversation disappear from the
    switcher, which reads as the app losing the user's work.
    """
    script_the_model(monkeypatch)
    cid = _turn("hello").json()["conversation_id"]

    with engine.begin() as conn:
        conn.execute(sa.text("DELETE FROM messages WHERE conversation_id = :c"), {"c": cid})

    entries = _list().json()["conversations"]
    assert [e["id"] for e in entries] == [cid], entries
    assert entries[0]["preview"] is None, entries[0]
    assert entries[0]["message_count"] == 0


def test_the_list_contains_only_your_own_conversations(alice, monkeypatch):
    script_the_model(monkeypatch)
    mine = _turn("mine").json()["conversation_id"]

    # Bob's conversation, written with the repository rather than by
    # impersonating him through the route.
    with engine.begin() as conn:
        bob_conv = conn.execute(
            sa.text(
                "INSERT INTO conversations (id, user_id) VALUES (:i, :u) RETURNING id"
            ),
            {"i": str(uuid.uuid4()), "u": BOB},
        ).scalar_one()
        conn.execute(
            sa.text(
                "INSERT INTO messages (id, user_id, conversation_id, role, content, created_at)"
                " VALUES (:i, :u, :c, 'user', 'bob private', now())"
            ),
            {"i": str(uuid.uuid4()), "u": BOB, "c": bob_conv},
        )

    entries = _list().json()["conversations"]
    assert [e["id"] for e in entries] == [mine], (
        f"another user's conversation appeared in the list: {entries}"
    )


def test_a_user_with_no_conversations_gets_an_empty_list(alice, monkeypatch):
    script_the_model(monkeypatch)
    body = _list().json()
    assert body["conversations"] == [], body


# --- Reading a thread ------------------------------------------------------


def test_a_thread_can_be_read_back_in_order(alice, monkeypatch):
    script_the_model(monkeypatch)
    cid = _turn("remember: the cat is Rex").json()["conversation_id"]
    _turn("what is my cat called?", conversation_id=cid)

    response = _messages_of(cid)
    assert response.status_code == 200, response.text
    messages = response.json()["messages"]
    assert [m["content"] for m in messages if m["role"] == "user"] == [
        "remember: the cat is Rex",
        "what is my cat called?",
    ], messages


def test_another_users_thread_is_not_readable(alice, monkeypatch):
    """Tenancy, on a route that takes a conversation id in the path.

    A conversation id is a UUID, so guessing one is not the threat — using a
    known one is. Bob's id in alice's path must not return his content.
    """
    script_the_model(monkeypatch)
    with engine.begin() as conn:
        bob_conv = conn.execute(
            sa.text("INSERT INTO conversations (id, user_id) VALUES (:i, :u) RETURNING id"),
            {"i": str(uuid.uuid4()), "u": BOB},
        ).scalar_one()
        conn.execute(
            sa.text(
                "INSERT INTO messages (id, user_id, conversation_id, role, content, created_at)"
                " VALUES (:i, :u, :c, 'user', 'bob private', now())"
            ),
            {"i": str(uuid.uuid4()), "u": BOB, "c": bob_conv},
        )

    response = _messages_of(bob_conv)
    assert response.status_code == 404, (
        f"reading another user's thread answered {response.status_code}: {response.text}"
    )
    assert "bob private" not in response.text


def test_an_unknown_thread_is_not_found(alice, monkeypatch):
    script_the_model(monkeypatch)
    assert _messages_of(str(uuid.uuid4())).status_code == 404