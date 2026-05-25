from __future__ import annotations

import asyncio
from typing import Any

from pydantic import SecretStr

from app.config import Settings
from app.llm.gemini_chat import GeminiChatClient, answer_tab_question


class FakeGeminiResponse:
    status_code = 200

    def __init__(self) -> None:
        self.payload: dict[str, Any] | None = None
        self.headers: dict[str, str] | None = None
        self.url = ""

    def raise_for_status(self) -> None:
        return None

    def json(self) -> dict[str, Any]:
        return {
            "candidates": [
                {
                    "content": {
                        "parts": [
                            {
                                "text": (
                                    "BDI measures dry bulk shipping rates. "
                                    "Higher values usually mean tighter bulk capacity."
                                )
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
