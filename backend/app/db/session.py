from __future__ import annotations

from collections.abc import AsyncGenerator, Generator

from sqlalchemy import create_engine
from sqlalchemy.ext.asyncio import AsyncSession, async_sessionmaker, create_async_engine
from sqlalchemy.orm import Session, sessionmaker

from app.config import get_async_database_url, get_settings

engine = create_engine(
    get_settings().database_url,
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)
SessionLocal = sessionmaker(bind=engine, autoflush=False, autocommit=False, expire_on_commit=False)

async_engine = create_async_engine(
    get_async_database_url(),
    pool_pre_ping=True,
    pool_size=5,
    max_overflow=10,
)
AsyncSessionLocal = async_sessionmaker(async_engine, expire_on_commit=False)


def get_db() -> Generator[Session, None, None]:
    """Yield a database session for request/task scopes."""
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


async def get_async_db() -> AsyncGenerator[AsyncSession, None]:
    """Yield an async database session for API request scopes."""
    async with AsyncSessionLocal() as db:
        yield db
