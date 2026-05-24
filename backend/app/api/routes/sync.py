from __future__ import annotations

from fastapi import APIRouter

from app.tasks.jobs import collect_all

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/force")
async def force_sync() -> dict[str, str]:
    """Force run all collectors and recalculate risks/insights in the background."""
    task = collect_all.delay()
    return {"status": "queued", "task_id": task.id}
