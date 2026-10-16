"""Goal schemas: trimming, defaults, date-only targets, status values.

Hermetic — no database. Issue #17.

These pin the API contract the TypeScript types mirror: a title is trimmed and
must not be blank, a new goal defaults to `Draft`, `target_date` is a calendar
date (`YYYY-MM-DD`, never a timestamp), and all four statuses are accepted.
"""

from datetime import date, datetime, timezone

import pytest
from pydantic import ValidationError

from models import GoalCreate, GoalResponse, GoalStatusEnum, GoalUpdate


def test_a_new_goal_defaults_to_draft():
    assert GoalCreate(title="Run a half marathon").status is GoalStatusEnum.DRAFT


@pytest.mark.parametrize("status", list(GoalStatusEnum))
def test_every_status_is_accepted(status):
    assert GoalCreate(title="Ship it", status=status).status is status


def test_the_four_status_values_are_what_the_contract_says():
    assert [s.value for s in GoalStatusEnum] == ["Draft", "Active", "Paused", "Completed"]


def test_a_title_is_trimmed():
    assert GoalCreate(title="  Read more  ").title == "Read more"


@pytest.mark.parametrize("blank", ["", " ", "   ", "\t\n "])
def test_a_blank_title_is_rejected(blank):
    with pytest.raises(ValidationError):
        GoalCreate(title=blank)


def test_a_title_longer_than_200_characters_is_rejected():
    with pytest.raises(ValidationError):
        GoalCreate(title="a" * 201)


def test_a_target_date_is_a_calendar_date():
    goal = GoalCreate(title="Tax deadline", target_date="2026-04-15")
    assert goal.target_date == date(2026, 4, 15)


def test_a_target_date_serializes_without_a_time():
    goal = GoalResponse(
        id="00000000-0000-0000-0000-000000000000",
        title="Tax deadline",
        target_date=date(2026, 4, 15),
        created_at=datetime(2026, 1, 1, tzinfo=timezone.utc),
    )
    assert goal.model_dump(mode="json")["target_date"] == "2026-04-15"


def test_a_description_is_optional():
    assert GoalCreate(title="No description").description is None


def test_an_update_may_carry_one_field():
    update = GoalUpdate(status=GoalStatusEnum.PAUSED)
    assert update.model_dump(exclude_unset=True) == {"status": GoalStatusEnum.PAUSED}


def test_an_update_cannot_blank_a_title():
    with pytest.raises(ValidationError):
        GoalUpdate(title="   ")
