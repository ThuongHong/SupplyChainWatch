from __future__ import annotations

from typing import Annotated

from fastapi import APIRouter, Depends, Request
from sqlalchemy.ext.asyncio import AsyncSession

from app.api.rate_limit import limiter
from app.db.session import get_async_db
from app.llm.story_mode import analyze_story
from app.schemas.api import StoryAnalyzeRequest, StoryAnalyzeResponse

router = APIRouter(prefix="/story", tags=["story"])


@router.post("/analyze", response_model=StoryAnalyzeResponse)
@limiter.limit("10/minute")
async def analyze_story_endpoint(
    request: Request,
    body: StoryAnalyzeRequest,
    db: Annotated[AsyncSession, Depends(get_async_db)],
) -> dict[str, object]:
    _ = request
    return await analyze_story(
        db,
        entity_a=body.entity_a.model_dump(),
        entity_b=body.entity_b.model_dump(),
        period_days=body.period_days,
    )
