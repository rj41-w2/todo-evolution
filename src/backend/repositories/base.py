"""Repository layer base: protocols and abstract implementation.

Protocols define narrow interfaces — only what callers (endpoints, MCP tools)
actually need. Implementations wrap SQLAlchemy Session and return SQLAlchemy
models; Pydantic conversion happens at the API boundary.
"""

from abc import ABC, abstractmethod
from typing import Generic, Protocol, TypeVar

from sqlalchemy.orm import Session

T = TypeVar("T")


class Repository(Protocol[T]):
    """Narrow read/write protocol — extend per entity with specific queries."""

    @abstractmethod
    def get(self, id: object) -> T | None: ...

    @abstractmethod
    def list(self, **filters) -> list[T]: ...

    @abstractmethod
    def create(self, obj: T) -> T: ...

    @abstractmethod
    def update(self, obj: T) -> T: ...

    @abstractmethod
    def delete(self, obj: T) -> None: ...

    @abstractmethod
    def exists(self, id: object) -> bool: ...


class SqlRepository(ABC, Generic[T]):
    """Base SQLAlchemy-backed repository.

    Subclasses implement entity-specific queries. All methods are scoped by
    `user_id` passed at call time (not stored) to enforce multi-tenancy.
    """

    def __init__(self, session: Session):
        self._session = session

    @property
    def session(self) -> Session:
        return self._session

    # --- Base CRUD (can be overridden) ---

    def get(self, id: object) -> T | None:
        return self._session.get(self._model, id)

    def list(self, **filters) -> list[T]:
        query = self._session.query(self._model)
        for attr, value in filters.items():
            query = query.filter(getattr(self._model, attr) == value)
        return query.all()

    def create(self, obj: T) -> T:
        self._session.add(obj)
        self._session.flush()
        self._session.refresh(obj)
        return obj

    def update(self, obj: T) -> T:
        self._session.flush()
        self._session.refresh(obj)
        return obj

    def delete(self, obj: T) -> None:
        self._session.delete(obj)
        self._session.flush()

    def exists(self, id: object) -> bool:
        return self._session.query(self._model).filter(self._model.id == id).first() is not None

    @property
    @abstractmethod
    def _model(self) -> type[T]:
        """The SQLAlchemy model class this repository manages."""
        ...