from __future__ import annotations

import asyncio
from typing import Any

from pydantic import SecretStr
from fastapi import HTTPException

from app.config import Settings
from app.api.routes.chat import deep_insight
from app.llm.gemini_chat import GeminiChatClient, answer_tab_question, generate_deep_insight
from app.schemas.api import DeepInsightRequest


class FakeGeminiResponse:
    status_code = 200

    def __init__(self, text: str | None = None) -> None:
        self.payload: dict[str, Any] | None = None
        self.headers: dict[str, str] | None = None
        self.url = ""
        self.text = text or (
            "BDI measures dry bulk shipping rates. "
            "Higher values usually mean tighter bulk capacity."
        )

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": self.text
                            }
                        ]
                    }
                }
            ],
            "usageMetadata": {"promptTokenCount": 30, "candidatesTokenCount": 18},
        }


class FakeAsyncClient:
    def __init__(self, response: FakeGeminiResponse) -> None:
        self.response = response

    async def __aenter__(self) -> FakeAsyncClient:
        return self

    async def __aexit__(self, *args: object) -> None:
        return None

    async def post(
        self,
        url: str,
        *,
        headers: dict[str, str],
        json: dict[str, Any],
    ) -> FakeGeminiResponse:
        self.response.url = url
        self.response.headers = headers
        self.response.payload = json
        return self.response


def test_gemini_chat_client_calls_generate_content_with_secret_header() -> None:
    response = FakeGeminiResponse()
    settings = Settings(gemini_api_key=SecretStr("test-key"), gemini_model="gemini-3.5-flash")
    client = GeminiChatClient(settings=settings, http_client_factory=lambda **_: FakeAsyncClient(response))

    result = asyncio.run(
        client.answer(
            page="indices",
            question="BDI la gi?",
            context={"latest_bdi": 1200, "latest_fbx": 1800},
        )
    )

    assert response.url.endswith("/v1beta/models/gemini-3.5-flash:generateContent")
    assert response.headers == {"x-goog-api-key": "test-key", "Content-Type": "application/json"}
    assert response.payload is not None
    prompt = response.payload["contents"][0]["parts"][0]["text"]
    assert "current tab: indices" in prompt
    assert "latest_bdi" in prompt
    assert result.answer.startswith("BDI measures dry bulk")
    assert result.model == "gemini-3.5-flash"


def test_answer_tab_question_raises_when_gemini_key_missing() -> None:
    settings = Settings(gemini_api_key=None)

    try:
        asyncio.run(answer_tab_question(settings, page="dashboard", question="Explain risk", context={}))
    except RuntimeError as exc:
        assert str(exc) == "GEMINI_API_KEY is not configured"
    else:
        raise AssertionError("missing Gemini key should fail instead of using demo fallback")


def test_generate_deep_insight_returns_structured_blocks() -> None:
    response = FakeGeminiResponse(
        text=(
            '{"signal":"Port risk concentrated in Shanghai.",'
            '"so_what":"This can affect near-term routing decisions.",'
            '"next_steps":["Inspect affected port","Review forecast uncertainty"],'
            '"caveats":["Uses visible dashboard values only"]}'
        )
    )
    settings = Settings(gemini_api_key=SecretStr("test-key"), gemini_model="gemini-3.5-flash")
    client = GeminiChatClient(settings=settings, http_client_factory=lambda **_: FakeAsyncClient(response))

    result = asyncio.run(
        client.deep_insight(
            page="dashboard",
            context={"decisionBrief": {"headline": "Shanghai needs review now."}},
        )
    )

    assert response.payload is not None
    prompt = response.payload["contents"][0]["parts"][0]["text"]
    assert "Return valid JSON only" in prompt
    assert "signal" in prompt
    assert "decisionBrief" in prompt
    assert result.signal == "Port risk concentrated in Shanghai."
    assert result.next_steps == ["Inspect affected port", "Review forecast uncertainty"]
    assert result.model == "gemini-3.5-flash"


def test_generate_deep_insight_rejects_invalid_json() -> None:
    response = FakeGeminiResponse(text="not json")
    settings = Settings(gemini_api_key=SecretStr("test-key"))
    client = GeminiChatClient(settings=settings, http_client_factory=lambda **_: FakeAsyncClient(response))

    try:
        asyncio.run(client.deep_insight(page="dashboard", context={}))
    except RuntimeError as exc:
        assert str(exc) == "Gemini returned invalid deep insight JSON"
    else:
        raise AssertionError("invalid Gemini JSON should fail")


def test_generate_deep_insight_raises_when_gemini_key_missing() -> None:
    settings = Settings(gemini_api_key=None)

    try:
        asyncio.run(generate_deep_insight(settings, page="dashboard", context={}))
    except RuntimeError as exc:
        assert str(exc) == "GEMINI_API_KEY is not configured"
    else:
        raise AssertionError("missing Gemini key should fail")


def test_deep_insight_route_maps_runtime_error_to_502(monkeypatch: object) -> None:
    async def fake_generate_deep_insight(*_: object, **__: object) -> object:
        raise RuntimeError("Gemini returned invalid deep insight JSON")

    monkeypatch.setattr("app.api.routes.chat.generate_deep_insight", fake_generate_deep_insight)

    try:
        route_handler = getattr(deep_insight, "__wrapped__", deep_insight)
        asyncio.run(
            route_handler(
                object(),  # type: ignore[arg-type]
                DeepInsightRequest(page="dashboard", context={}),
            )
        )
    except HTTPException as exc:
        assert exc.status_code == 502
        assert exc.detail == "Gemini returned invalid deep insight JSON"
    else:
        raise AssertionError("invalid Gemini JSON should map to 502")
