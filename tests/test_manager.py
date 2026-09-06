import sys
import unittest
from datetime import datetime, timedelta
from pathlib import Path

sys.path.insert(0, str(Path(__file__).parents[1] / "src"))

from manager import TaskManager
from models import Recurrence, Status


class TaskManagerTests(unittest.TestCase):
    def test_reverse_due_date_sort_keeps_undated_tasks_last(self):
        manager = TaskManager()
        manager.add_task("undated", "")
        manager.add_task("dated", "", due_date=datetime.now())

        self.assertEqual([task.title for task in manager.sort_tasks("due_date", reverse=True)], ["dated", "undated"])

    def test_recurring_task_only_creates_next_instance_on_transition(self):
        manager = TaskManager()
        task = manager.add_task(
            "daily", "", due_date=datetime.now(), is_recurring=True, recurrence_period=Recurrence.DAILY
        )

        manager.update_task(task.id, status=Status.COMPLETED)
        manager.update_task(task.id, status=Status.COMPLETED)

        self.assertEqual(len(manager.tasks), 2)
        self.assertEqual(manager.tasks[1].due_date.date(), (task.due_date + timedelta(days=1)).date())

    def test_monthly_recurrence_uses_calendar_month(self):
        manager = TaskManager()
        task = manager.add_task(
            "monthly", "", due_date=datetime(2026, 1, 31), is_recurring=True, recurrence_period=Recurrence.MONTHLY
        )

        manager.update_task(task.id, status=Status.COMPLETED)

        self.assertEqual(manager.tasks[1].due_date, datetime(2026, 2, 28))


if __name__ == "__main__":
    unittest.main()
