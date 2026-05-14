# Advanced Specification: In-Memory Python Todo CLI App (Phase I)

## 1. System Overview
Develop a highly robust, feature-rich interactive Command-Line Interface (CLI) Todo application in Python. The application must store all state in-memory using advanced Python data structures (e.g., DataClasses or structured dictionaries). No external databases are allowed in this phase. 

## 2. Architectural Requirements
- **Separation of Concerns:** Keep the CLI presentation layer separate from the data management/logic layer. 
- **Language:** Python 3.10+
- **Data Persistence:** Strictly in-memory (data is cleared on app exit).
- **Libraries:** Use built-in libraries (like `datetime`, `uuid`). You may use `rich` or `colorama` for an enhanced terminal UI if applicable.

## 3. Core Features (Basic Level)
- **Add Task:** Create a new task with a title and description. Assign a unique ID (UUID or sequential integer).
- **Update Task:** Modify the title or description of an existing task.
- **Delete Task:** Remove a task from memory via its ID.
- **Complete Task:** Toggle the status of a task between "Pending" and "Completed".
- **View All Tasks:** Display a formatted list/table of all tasks.

## 4. Enhanced Features (Intermediate Level)
- **Priorities:** Assign priority levels to tasks (`High`, `Medium`, `Low`). Default is `Medium`.
- **Tags/Categories:** Add multiple tags to a task (e.g., `#work`, `#personal`, `#urgent`).
- **Search:** Search tasks by keywords in the title or description.
- **Filter:** Filter the task list by Status (Pending/Completed), Priority, or specific Tags.
- **Sort:** Order the displayed tasks by Priority or Due Date.

## 5. Complex Features (Advanced Level)
- **Due Dates & Times:** Attach specific due dates and times to tasks using Python's `datetime` module.
- **Recurring Tasks:** Allow tasks to be set as recurring (`Daily`, `Weekly`, `Monthly`). When a recurring task is marked as complete, automatically generate the next iteration of the task with the updated due date.
- **Reminders/Overdue Tracking:** When viewing tasks, clearly highlight tasks that are "Overdue" based on the current system time.

## 6. Error Handling & Validation
- Prevent crashes from invalid user inputs (e.g., entering strings when integers are expected).
- Validate date formats (e.g., enforce `YYYY-MM-DD HH:MM` format).
- Show clear, user-friendly error messages for actions like "Task ID not found".

## 7. Interactive Menu Loop
Provide a clean, continuous terminal prompt where the user can type commands or select options (e.g., `1. Add Task`, `2. View Tasks`, `3. Filter`, `0. Exit`) until they explicitly choose to quit.