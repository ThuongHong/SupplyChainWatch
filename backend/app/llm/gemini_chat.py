from __future__ import annotations

from dataclasses import dataclass
from typing import Any, Callable

import httpx

from app.config import Settings, get_settings

HttpClientFactory = Callable[..., Any]


@dataclass(frozen=True)
class GeminiChatResult:
    """Normalized Gemini chat response."""

    answer: str
    model: str
    input_tokens: int | None
    output_tokens: int | None


class GeminiChatClient:
    """Small Gemini REST client for tab-aware dashboard explanations."""

    def __init__(
        self,
        settings: Settings | None = None,
        http_client_factory: HttpClientFactory = httpx.AsyncClient,
    ) -> None:
        self.settings = settings or get_settings()
        self.http_client_factory = http_client_factory

    async def answer(
        self,
        *,
        page: str,
        question: str,
        context: dict[str, Any],
    ) -> GeminiChatResult:
        """Ask Gemini to explain current-tab supply-chain metrics."""
        if self.settings.gemini_api_key is None:
            raise RuntimeError("GEMINI_API_KEY is not configured")

        model = self.settings.gemini_model
        url = f"{self.settings.gemini_base_url.rstrip('/')}/v1beta/models/{model}:generateContent"
        headers = {
            "x-goog-api-key": self.settings.gemini_api_key.get_secret_value(),
            "Content-Type": "application/json",
        }
        prompt = _build_prompt(page=page, question=question, context=context)
        payload = {
            "contents": [{"parts": [{"text": prompt}]}],
            "generationConfig": {
                "temperature": 0.2,
                "maxOutputTokens": 450,
                "thinkingConfig": _thinking_config_for_model(model),
            },
        }

        async with self.http_client_factory(timeout=self.settings.llm_timeout_fast) as client:
            response = await client.post(url, headers=headers, json=payload)
            response.raise_for_status()
            data = response.json()

        answer = _extract_text(data)
        usage = data.get("usageMetadata", {})
        return GeminiChatResult(
            answer=answer,
            model=model,
            input_tokens=_int_or_none(usage.get("promptTokenCount")),
            output_tokens=_int_or_none(usage.get("candidatesTokenCount")),
        )


async def answer_tab_question(
    settings: Settings | None = None,
    *,
    page: str,
    question: str,
    context: dict[str, Any],
) -> GeminiChatResult:
    """Answer a frontend chatbot question through Gemini."""
    return await GeminiChatClient(settings=settings).answer(
        page=page,
        question=question,
        context=context,
    )


def _build_prompt(*, page: str, question: str, context: dict[str, Any]) -> str:
    return (
        "You are GlobalSupplyWatch's in-app analyst assistant. "
        "Answer in the user's language. Explain only supply-chain metrics visible in the current tab. "
        "Use provided values as evidence. If an exact value is missing, say the UI did not provide it. "
        "Keep the answer concise and practical.\n\n"
        f"current tab: {page}\n"
        f"current tab context: {context}\n"
        f"user question: {question}"
    )


def _extract_text(data: dict[str, Any]) -> str:
    candidates = data.get("candidates")
    if not isinstance(candidates, list) or not candidates:
        raise RuntimeError("Gemini returned no candidates")
    content = candidates[0].get("content", {})
    parts = content.get("parts", [])
    texts = [part.get("text") for part in parts if isinstance(part, dict) and part.get("text")]
    if not texts:
        raise RuntimeError("Gemini returned an empty answer")
    return "\n".join(str(text) for text in texts).strip()


def _thinking_config_for_model(model: str) -> dict[str, object]:
    if model.startswith("gemini-2.5-flash"):
        return {"thinkingBudget": 0}
    if model.startswith("gemini-3.5-flash"):
        return {"thinkingLevel": "low"}
    return {}


def _int_or_none(value: object) -> int | None:
    return value if isinstance(value, int) else None
