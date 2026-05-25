from __future__ import annotations

from fastapi import APIRouter

from app.tasks.jobs import collect_all

router = APIRouter(prefix="/sync", tags=["sync"])


@router.post("/force")
async def force_sync() -> dict[str, str]:
    """Force run all collectors and recalculate risks/insights in the background."""
    task = collect_all.delay()
    return {"status": "queued", "task_id": task.id}


@router.get("/tasks/{task_id}")
async def sync_status(task_id: str) -> dict[str, object]:
    """Return Celery task status for a force sync request."""
    task = collect_all.AsyncResult(task_id)
    failed = task.failed()
    return {
        "task_id": task_id,
        "status": task.status.lower(),
        "ready": task.ready(),
        "successful": task.successful(),
        "error": str(task.result) if failed else None,
    }
