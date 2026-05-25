from __future__ import annotations

import httpx
from fastapi import APIRouter, HTTPException, Request

from app.api.rate_limit import limiter
from app.config import get_settings
from app.llm.gemini_chat import answer_tab_question
from app.schemas.api import ChatAssistantRequest, ChatAssistantResponse

router = APIRouter(prefix="/chat", tags=["chat"])


@router.post("/assistant", response_model=ChatAssistantResponse)
@limiter.limit("20/minute")
async def chat_assistant(
    request: Request,
    body: ChatAssistantRequest,
) -> ChatAssistantResponse:
    """Explain active-tab metrics through Gemini."""
    _ = request
    try:
        result = await answer_tab_question(
            get_settings(),
            page=body.page,
            question=body.question,
            context=body.context,
        )
    except RuntimeError as exc:
        status_code = 503 if str(exc) == "GEMINI_API_KEY is not configured" else 502
        raise HTTPException(status_code=status_code, detail=str(exc)) from exc
    except httpx.HTTPError as exc:
        raise HTTPException(status_code=502, detail="Gemini API request failed") from exc

    return ChatAssistantResponse(
        answer=result.answer,
        model=result.model,
        input_tokens=result.input_tokens,
        output_tokens=result.output_tokens,
    )
