"""Goal routes: wiring, paging inputs, and the tenant boundary.

Hermetic — the repository is a `MagicMock`, so these prove the route calls the
right repository method with the right arguments and maps failures to the right
status code. They cannot prove a row persisted; that is
`test_goal_persistence.py`, which reads the database back through a fresh
session. Both are needed: a mock confirms a write was *prepared* as happily as
one that was thrown away.
"""

from datetime import datetime, timezone
from unittest.mock import MagicMock
from uuid import uuid4

import pytest
from fastapi.testclient import TestClient

from main import app, get_current_user, get_goal_repo
from models import Goal, GoalStatusEnum
from repositories.goal_repository import GoalRepository


@pytest.fixture
def client():
    """TestClient that runs lifespan per test, not at import time."""
    with TestClient(app) as c:
        yield c


def _goal(**overrides) -> Goal:
    values = dict(
        id=uuid4(),
        user_id="test-user",
        title="Run a half marathon",
        description=None,
        target_date=None,
        status=GoalStatusEnum.DRAFT,
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    values.update(overrides)
    return Goal(**values)


def _mock_repo() -> MagicMock:
    return MagicMock(spec=GoalRepository)


# --- Listing ----------------------------------------------------------------


def test_list_returns_the_paged_envelope_and_calls_the_repository(auth_as_tenant, client):
    repo = _mock_repo()
    repo.list_page_by_user.return_value = ([_goal(title="ONE")], False)
    app.dependency_overrides[get_goal_repo] = lambda: repo

    try:
        response = client.get(
            "/api/test-user/goals",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 200, response.text
        payload = response.json()
        # Envelope, not a bare array: a bare array cannot express "there is more".
        assert payload["goals"][0]["title"] == "ONE"
        assert payload["next_cursor"] is None
        # Owner is taken from the verified identity and always filtered on.
        repo.list_page_by_user.assert_called_once_with("test-user", None, 50)
    finally:
        app.dependency_overrides.clear()


def test_list_hands_the_route_back_a_next_cursor_when_more_remain(auth_as_tenant, client):
    repo = _mock_repo()
    repo.list_page_by_user.return_value = ([_goal(), _goal()], True)
    app.dependency_overrides[get_goal_repo] = lambda: repo

    try:
        response = client.get(
            "/api/test-user/goals?limit=2",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["next_cursor"]
    finally:
        app.dependency_overrides.clear()


def test_a_malformed_cursor_is_refused_rather_than_ignored(auth_as_tenant, client):
    repo = _mock_repo()
    app.dependency_overrides[get_goal_repo] = lambda: repo

    try:
        response = client.get(
            "/api/test-user/goals?cursor=not-a-real-cursor",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 400, response.text
        repo.list_page_by_user.assert_not_called()
    finally:
        app.dependency_overrides.clear()


def test_an_absurd_limit_is_capped_at_the_shared_ceiling(auth_as_tenant, client):
    repo = _mock_repo()
    repo.list_page_by_user.return_value = ([], False)
    app.dependency_overrides[get_goal_repo] = lambda: repo

    try:
        client.get(
            "/api/test-user/goals?limit=100000",
            headers={"Authorization": "Bearer fake-token"},
        )
        _args, _kwargs = repo.list_page_by_user.call_args
        assert _args[2] == 200
    finally:
        app.dependency_overrides.clear()


# --- Creating ---------------------------------------------------------------


def test_create_owns_the_goal_by_the_verified_identity(auth_as_tenant, client):
    repo = _mock_repo()

    def fake_create(goal):
        goal.id = uuid4()
        goal.created_at = datetime(2026, 1, 1, tzinfo=timezone.utc)
        return goal

    repo.create.side_effect = fake_create
    app.dependency_overrides[get_goal_repo] = lambda: repo

    try:
        response = client.post(
            "/api/test-user/goals",
            json={"title": "  Learn to sail  ", "status": "Active"},
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 201, response.text
        # The saved goal is what the route returns, trimmed.
        assert response.json()["title"] == "Learn to sail"
        assert response.json()["status"] == "Active"

        created = repo.create.call_args.args[0]
        assert created.user_id == "test-user"
        assert created.title == "Learn to sail"
    finally:
        app.dependency_overrides.clear()


def test_create_rejects_a_blank_title_before_touching_the_repository(auth_as_tenant, client):
    repo = _mock_repo()
    app.dependency_overrides[get_goal_repo] = lambda: repo

    try:
        response = client.post(
            "/api/test-user/goals",
            json={"title": "   "},
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 422, response.text
        repo.create.assert_not_called()
    finally:
        app.dependency_overrides.clear()


# --- Updating ---------------------------------------------------------------


def test_update_applies_only_the_fields_that_were_sent(auth_as_tenant, client):
    repo = _mock_repo()
    existing = _goal(title="BEFORE", description="keep me")
    repo.get_by_id_and_user.return_value = existing
    repo.update.side_effect = lambda goal: goal
    app.dependency_overrides[get_goal_repo] = lambda: repo

    try:
        response = client.put(
            f"/api/test-user/goals/{existing.id}",
            json={"status": "Completed"},
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 200, response.text
        assert response.json()["status"] == "Completed"
        # Untouched fields survive: `exclude_unset` is what makes this a partial edit.
        assert response.json()["title"] == "BEFORE"
        assert response.json()["description"] == "keep me"
        repo.update.assert_called_once()
    finally:
        app.dependency_overrides.clear()


def test_updating_a_goal_that_is_not_the_callers_is_a_404(auth_as_tenant, client):
    repo = _mock_repo()
    repo.get_by_id_and_user.return_value = None
    app.dependency_overrides[get_goal_repo] = lambda: repo

    try:
        response = client.put(
            f"/api/test-user/goals/{uuid4()}",
            json={"status": "Completed"},
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 404, response.text
        repo.update.assert_not_called()
    finally:
        app.dependency_overrides.clear()


# --- Tenant boundary --------------------------------------------------------


def test_a_mismatched_identity_cannot_list_goals(client):
    class _Repo:
        def list_page_by_user(self, *args, **kwargs):  # pragma: no cover - must not run
            raise AssertionError("the repository must not be reached on a 403")

    app.dependency_overrides[get_current_user] = lambda: "someone-else"
    app.dependency_overrides[get_goal_repo] = lambda: _Repo()

    try:
        response = client.get(
            "/api/test-user/goals",
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 403, response.text
    finally:
        app.dependency_overrides.clear()


def test_a_mismatched_identity_cannot_create_a_goal(client):
    repo = _mock_repo()
    app.dependency_overrides[get_current_user] = lambda: "someone-else"
    app.dependency_overrides[get_goal_repo] = lambda: repo

    try:
        response = client.post(
            "/api/test-user/goals",
            json={"title": "Planted"},
            headers={"Authorization": "Bearer fake-token"},
        )
        assert response.status_code == 403, response.text
        repo.create.assert_not_called()
    finally:
        app.dependency_overrides.clear()
