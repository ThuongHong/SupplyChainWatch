from __future__ import annotations

from datetime import UTC, datetime

from fastapi import APIRouter

from app.schemas.api import HealthResponse

router = APIRouter(tags=["health"])


@router.get("/health", response_model=HealthResponse)
async def health() -> dict[str, str]:
    """Return a lightweight liveness response."""
    return {"status": "ok", "checked_at": datetime.now(UTC).isoformat()}
