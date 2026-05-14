import sys
import os
from datetime import datetime
from typing import List

# Ensure we can import from the current directory
sys.path.append(os.path.dirname(os.path.abspath(__file__)))

from manager import TaskManager
from models import Status, Priority, Recurrence, Task

def clear_screen():
    os.system('cls' if os.name == 'nt' else 'clear')

def print_header(text: str):
    print("\n" + "=" * 50)
    print(f"{text:^50}")
    print("=" * 50)

def get_input(prompt: str, required: bool = True) -> str:
    while True:
        val = input(prompt).strip()
        if not val and required:
            print("Error: This field is required.")
            continue
        return val

def get_date_input(prompt: str) -> datetime:
    while True:
        val = input(prompt + " (YYYY-MM-DD HH:MM) or leave blank: ").strip()
        if not val:
            return None
        try:
            return datetime.strptime(val, "%Y-%m-%d %H:%M")
        except ValueError:
            print("Error: Invalid date format. Use YYYY-MM-DD HH:MM")

def display_tasks(tasks: List[Task], title: str = "Task List"):
    print_header(title)
    if not tasks:
        print("No tasks found.")
        return
    
    # Simple table headers
    print(f"{'ID':<4} | {'Title':<20} | {'Status':<12} | {'Priority':<8} | {'Due Date'}")
    print("-" * 70)
    for task in tasks:
        due_str = task.due_date.strftime("%Y-%m-%d %H:%M") if task.due_date else "N/A"
        print(f"{task.id:<4} | {task.title[:20]:<20} | {task.status.value:<12} | {task.priority.value:<8} | {due_str}")

def main():
    manager = TaskManager()
    
    while True:
        print_header("TODO APP - PHASE I")
        print("1. Add Task")
        print("2. List All Tasks")
        print("3. Update Task Status")
        print("4. Delete Task")
        print("5. Filter Tasks")
        print("6. Sort Tasks")
        print("7. View Overdue Tasks")
        print("8. Exit")
        
        choice = input("\nSelect an option: ").strip()
        
        try:
            if choice == '1':
                title = get_input("Enter title: ")
                desc = get_input("Enter description: ")
                
                print("\nPriority: 1. Low, 2. Medium, 3. High")
                p_choice = input("Select priority (default 2): ").strip()
                priority = { '1': Priority.LOW, '2': Priority.MEDIUM, '3': Priority.HIGH }.get(p_choice, Priority.MEDIUM)
                
                tags = input("Enter tags (comma separated): ").strip().split(',')
                tags = [t.strip() for t in tags if t.strip()]
                
                due_date = get_date_input("Enter due date")
                
                is_rec = input("Is this a recurring task? (y/n): ").lower() == 'y'
                recurrence = Recurrence.NONE
                if is_rec:
                    print("\nRecurrence: 1. Daily, 2. Weekly, 3. Monthly")
                    r_choice = input("Select recurrence: ").strip()
                    recurrence = { '1': Recurrence.DAILY, '2': Recurrence.WEEKLY, '3': Recurrence.MONTHLY }.get(r_choice, Recurrence.DAILY)
                
                manager.add_task(title, desc, priority, tags, due_date, is_rec, recurrence)
                print("\nTask added successfully!")

            elif choice == '2':
                display_tasks(manager.tasks)

            elif choice == '3':
                tid = int(get_input("Enter task ID: "))
                print("\nStatus: 1. Pending, 2. In Progress, 3. Completed")
                s_choice = input("Select new status: ").strip()
                status = { '1': Status.PENDING, '2': Status.IN_PROGRESS, '3': Status.COMPLETED }.get(s_choice)
                
                if status:
                    if manager.update_task(tid, status=status):
                        print("\nTask updated successfully!")
                    else:
                        print("\nError: Task not found.")
                else:
                    print("\nError: Invalid status choice.")

            elif choice == '4':
                tid = int(get_input("Enter task ID to delete: "))
                if manager.delete_task(tid):
                    print("\nTask deleted.")
                else:
                    print("\nError: Task not found.")

            elif choice == '5':
                print("\nFilter by: 1. Status, 2. Priority, 3. Tag")
                f_choice = input("Select filter: ").strip()
                filtered = []
                if f_choice == '1':
                    print("\n1. Pending, 2. In Progress, 3. Completed")
                    s = { '1': Status.PENDING, '2': Status.IN_PROGRESS, '3': Status.COMPLETED }.get(input("Select status: "))
                    filtered = manager.filter_tasks(status=s)
                elif f_choice == '2':
                    print("\n1. Low, 2. Medium, 3. High")
                    p = { '1': Priority.LOW, '2': Priority.MEDIUM, '3': Priority.HIGH }.get(input("Select priority: "))
                    filtered = manager.filter_tasks(priority=p)
                elif f_choice == '3':
                    tag = input("Enter tag: ").strip()
                    filtered = manager.filter_tasks(tag=tag)
                display_tasks(filtered, "Filtered Tasks")

            elif choice == '6':
                print("\nSort by: 1. ID, 2. Due Date, 3. Priority")
                s_choice = input("Select sort: ").strip()
                sort_key = { '1': 'id', '2': 'due_date', '3': 'priority' }.get(s_choice, 'id')
                sorted_tasks = manager.sort_tasks(by=sort_key)
                display_tasks(sorted_tasks, f"Sorted Tasks (by {sort_key})")

            elif choice == '7':
                display_tasks(manager.check_overdue(), "Overdue Tasks")

            elif choice == '8':
                print("Goodbye!")
                break
            
            else:
                print("Invalid choice. Please try again.")

        except ValueError as e:
            print(f"Error: Invalid input. {e}")
        except Exception as e:
            print(f"An unexpected error occurred: {e}")
        
        input("\nPress Enter to continue...")
        clear_screen()

if __name__ == "__main__":
    main()
