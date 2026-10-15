import os
from sqlalchemy import create_engine
from sqlalchemy.ext.declarative import declarative_base
from sqlalchemy.orm import sessionmaker
from dotenv import load_dotenv

load_dotenv()

DATABASE_URL = os.getenv("DATABASE_URL")
if not DATABASE_URL:
    raise RuntimeError("DATABASE_URL must be configured")

# For Neon DB / PostgreSQL, we use the postgresql driver
engine = create_engine(DATABASE_URL, pool_pre_ping=True, pool_recycle=300)
SessionLocal = sessionmaker(autocommit=False, autoflush=False, bind=engine)

Base = declarative_base()

def get_db():
    """One transaction per request.

    This dependency *is* the transaction boundary for every route that uses it.
    It used to yield the session and close it, with no commit anywhere — and
    since `SqlRepository.create/update` only `flush()`, closing an
    open transaction rolls it back. The result was that `POST /tasks` answered
    **201 Created** and `PUT /tasks/{id}` answered **200**, while writing
    nothing: the task the UI showed as created vanished on refresh.

    Nothing caught it because the endpoint tests hand the app a
    `MagicMock(spec=TaskRepository)` and assert the repository was *called*.
    A mock cannot tell you that the row was thrown away a millisecond later.
    `DELETE` survived only because that one route reached past the repository
    and called `task_repo.session.commit()` by hand.

    Commit on success, roll back on failure, always close. The chat route does
    not use this dependency — it opens its own sessions so that no connection
    is held across an LLM call — so this does not reintroduce that problem.
    """
    db = SessionLocal()
    try:
        yield db
        db.commit()
    except Exception:
        db.rollback()
        raise
    finally:
        db.close()
