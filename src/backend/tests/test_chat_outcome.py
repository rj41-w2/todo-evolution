"""A chat turn must report what actually happened to the user's data.

Needs a database, and runs the real MCP subprocess rather than a fake client.
The shape of a tool failure is not something to guess at: the real server
returns `isError=True` with plain English text, not JSON, which is precisely
what the route used to feed to `json.loads`.

Three failure points, three behaviours, and only one of them was correct
before issue #4:

    first LLM call fails          500, user's message survives   (was right)
    a tool fails                  500, nothing recorded          (was wrong)
    tools succeed, 2nd call fails 500, task exists, unrecorded   (was wrong)

The last two both violated the same thing: a task action could succeed while
the user was told the turn failed. That is worse than an error, because the
natural response to "it failed" is to ask again — and asking again creates a
second task.

MCP tools commit in their own subprocess, so there is no rollback to fall back
on. The only honest option is to record what happened and say so.
"""

import json
import uuid

import pytest
import sqlalchemy as sa
from fastapi.testclient import TestClient

from database import SessionLocal, engine
from main import app, get_current_user
from models import ChatRequest, Task

pytestmark = pytest.mark.integration

ALICE = "test-outcome-alice"


@pytest.fixture
def alice(monkeypatch):
    with engine.begin() as conn:
        conn.execute(
            sa.text(
                'INSERT INTO "user" (id, name, email, "emailVerified",'
                ' "createdAt", "updatedAt")'
                " VALUES (:id, :name, :email, false, now(), now())"
                " ON CONFLICT (id) DO NOTHING"
            ),
            {"id": ALICE, "name": ALICE, "email": "alice-outcome@test.invalid"},
        )
    monkeypatch.setenv("GEMINI_API_KEY", "test-key-not-used")
    app.dependency_overrides[get_current_user] = lambda: ALICE
    try:
        yield TestClient(app)
    finally:
        app.dependency_overrides.pop(get_current_user, None)
        with engine.begin() as conn:
            conn.execute(sa.text('DELETE FROM "user" WHERE id = :id'), {"id": ALICE})


# --- A model that does exactly what it is told ---------------------------


def _tool_call(name: str, arguments: dict, call_id: str = "call_1"):
    fn = type("F", (), {"name": name, "arguments": json.dumps(arguments)})()
    return type("T", (), {"id": call_id, "function": fn})()


def _response(text=None, tool_calls=None):
    message = type("M", (), {"content": text, "tool_calls": tool_calls})()
    return type("R", (), {"choices": [type("C", (), {"message": message})()]})()


def script_the_model(monkeypatch, script):
    """Make Gemini return `script[i]` on call i; an Exception is raised.

    Repeats the last entry once the script runs out, so a script can end in
    "keep failing" without special-casing.
    """
    state = {"n": 0}

    # `self` is required: this is installed as a class attribute, so it is
    # bound as a method and receives the instance as the first argument.
    # Without it every call dies with `create() takes 0 positional arguments
    # but 1 was given`, which looks like a production fault and is not.
    async def create(self, **kwargs):
        i = min(state["n"], len(script) - 1)
        state["n"] += 1
        item = script[i]
        if isinstance(item, Exception):
            raise item
        return item

    monkeypatch.setattr(
        "main.get_openai_client",
        lambda: type("C", (), {"chat": type("K", (), {"completions": type("C2", (), {"create": create})()})()})(),
    )


def _tasks() -> list[tuple]:
    with SessionLocal() as s:
        return sorted((t.title, t.status.value) for t in s.query(Task).filter(Task.user_id == ALICE).all())


def _messages() -> list[tuple]:
    with engine.connect() as conn:
        return [
            (row.role, row.content)
            for row in conn.execute(
                sa.text("SELECT role, content FROM messages WHERE user_id = :u ORDER BY created_at"),
                {"u": ALICE},
            )
        ]


# --- The behaviours -------------------------------------------------------


def test_a_failing_tool_does_not_crash_the_turn(alice, monkeypatch):
    """Asking to delete a task that does not exist is not an outage.

    Before #4 this returned 500 "AI Chatbot service is temporarily
    unavailable": the tool returned `isError=True` with the sentence
    `Error executing tool delete_task: Task not found with ID or name
    matching '...'`, `json.loads` raised on it, and that surfaced as a
    service outage. The user was told to retry a typo.
    """
    script_the_model(monkeypatch, [
        _response(tool_calls=[_tool_call("delete_task", {"task_id": "00000000-0000-0000-0000-000000000000"})]),
        _response(text="I could not find that task."),
    ])

    response = alice.post(f"/api/{ALICE}/chat", json={"message": "delete my task called grocery"})

    assert response.status_code == 200, (
        f"a missing task answered {response.status_code}: {response.text}"
    )
    body = response.json()
    assert body["outcome"] == "partial", f"expected a partial outcome, got {body['outcome']!r}"

    failed = [c for c in body["tool_calls"] if not c.get("ok", True)]
    assert len(failed) == 1, f"expected the failing tool to be reported: {body['tool_calls']}"
    assert failed[0]["tool"] == "delete_task"


def test_a_tool_that_succeeds_before_a_model_failure_is_still_reported(alice, monkeypatch):
    """The task exists, so the turn must not read as a failure.

    This is the case where a blind retry creates a duplicate task.
    """
    title = f"OUTCOME PROBE {uuid.uuid4().hex[:8]}"
    script_the_model(monkeypatch, [
        _response(tool_calls=[_tool_call("add_task", {"title": title})]),
        RuntimeError("model died after the tool ran"),
    ])

    response = alice.post(f"/api/{ALICE}/chat", json={"message": f"create a task called {title}"})

    assert response.status_code == 200, (
        f"the task was created but the user was told the turn failed: {response.text}"
    )
    body = response.json()
    assert body["outcome"] == "partial", f"expected partial, got {body['outcome']!r}"
    assert _tasks() == [(title, "Pending")], f"the created task is not in the database: {_tasks()}"

    # And the conversation must record what happened, not nothing.
    roles = [r for r, _ in _messages()]
    assert roles.count("assistant") == 1, (
        f"the turn left no record of the task it created: {roles}"
    )


def test_a_fully_failed_turn_is_marked_failed(alice, monkeypatch):
    """No tools succeeded and the model gave nothing — say so."""
    script_the_model(monkeypatch, [
        RuntimeError("model unavailable from the very first call"),
    ])

    response = alice.post(f"/api/{ALICE}/chat", json={"message": "hello"})

    assert response.status_code == 200, response.text
    assert response.json()["outcome"] == "failed", response.json()["outcome"]


def test_a_successful_turn_is_marked_completed(alice, monkeypatch):
    """The ordinary path must be unchanged — no regression in the happy case."""
    title = f"HAPPY PATH {uuid.uuid4().hex[:8]}"
    script_the_model(monkeypatch, [
        _response(tool_calls=[_tool_call("add_task", {"title": title})]),
        _response(text=f"Created '{title}' for you."),
    ])

    response = alice.post(f"/api/{ALICE}/chat", json={"message": f"create {title}"})

    assert response.status_code == 200, response.text
    body = response.json()
    assert body["outcome"] == "completed", body["outcome"]
    assert all(c.get("ok") for c in body["tool_calls"]), body["tool_calls"]
    assert _tasks() == [(title, "Pending")]


def test_one_failing_tool_does_not_abandon_the_others(alice, monkeypatch):
    """Tools in one turn are independent intents; a bad one is not a stop sign."""
    good = f"SURVIVED {uuid.uuid4().hex[:8]}"
    script_the_model(monkeypatch, [
        _response(tool_calls=[
            _tool_call("delete_task", {"task_id": "00000000-0000-0000-0000-000000000000"}, "call_1"),
            _tool_call("add_task", {"title": good}, "call_2"),
        ]),
        _response(text="One action failed, the other succeeded."),
    ])

    response = alice.post(f"/api/{ALICE}/chat", json={
        "message": f"delete the task called nothing then create {good}"
    })

    assert response.status_code == 200, response.text
    body = response.json()
    assert _tasks() == [(good, "Pending")], (
        f"the second tool did not run because the first failed: {_tasks()}"
    )
    oks = sorted((c["tool"], c.get("ok")) for c in body["tool_calls"])
    assert oks == [("add_task", True), ("delete_task", False)], oks


def test_the_reply_never_leaks_internals_when_a_tool_fails(alice, monkeypatch):
    """A driver error must not reach the user.

    The MCP server wraps any exception as
    `Error executing tool X: <original exception>`. For a missing task that is
    a friendly sentence; for a database failure it is
    `(psycopg2.OperationalError) connection to server at "host" ...`.
    """
    import contextlib

    @contextlib.asynccontextmanager
    async def _fake_stdio(params):
        yield (None, None)

    class _Result:
        isError = True
        content = [type("T", (), {
            "text": "Error executing tool add_task: (psycopg2.OperationalError) "
                    "connection to server at \"db.internal\" (10.0.0.4), port 5432 failed"
        })()]

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

        async def call_tool(self, name, arguments=None):
            return _Result()

    monkeypatch.setattr("main.stdio_client", _fake_stdio)
    monkeypatch.setattr("main.ClientSession", _FakeSession)
    # The first response must actually *ask for the tool*. An earlier version
    # scripted only the model's text, so `tool_calls` was empty, the fake tool
    # was never called, and the test passed against the very code it was meant
    # to catch. A guard that cannot fail is not a guard — which is why it was
    # run against the previous code before being believed.
    script_the_model(monkeypatch, [
        _response(tool_calls=[_tool_call("add_task", {"title": "should not appear"})]),
        _response(text="Sorry, that did not work."),
    ])

    response = alice.post(f"/api/{ALICE}/chat", json={"message": "create a task"})

    assert response.status_code == 200, response.text
    raw = response.text
    for leak in ("psycopg2", "10.0.0.4", "db.internal", "OperationalError"):
        assert leak not in raw, f"the response leaked {leak!r}: {raw}"

    stored = " ".join(content for _, content in _messages())
    for leak in ("psycopg2", "10.0.0.4", "db.internal"):
        assert leak not in stored, f"the persisted message leaked {leak!r}: {stored}"