from __future__ import annotations

import asyncio
from typing import Any

from pydantic import SecretStr

from app.config import Settings
from app.llm.client import LLMClient
from app.llm.safety import validate_narrative


class NoLogLLMClient(LLMClient):
    def _log_usage(
        self,
        feature: str,
        model: str,
        input_tokens: int | None,
        output_tokens: int | None,
        duration_ms: int | None,
        status: str,
        error: str | None,
    ) -> None:
        return None


class FakeCompletions:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        return {
            "choices": [{"message": {"content": "BDI moved 5.0% to 120.0."}}],
            "usage": {"prompt_tokens": 12, "completion_tokens": 8},
        }


class FailingCompletions:
    def __init__(self) -> None:
        self.calls = 0

    async def create(self, **kwargs: Any) -> dict[str, Any]:
        self.calls += 1
        raise RuntimeError("provider down")


class TokenLimitThenOkCompletions:
    def __init__(self) -> None:
        self.calls: list[dict[str, Any]] = []

    async def create(self, **kwargs: Any) -> dict[str, Any]:
        self.calls.append(kwargs)
        if len(self.calls) == 1:
            raise RuntimeError("context length exceeded: too many tokens")
        return {
            "choices": [
                {
                    "message": {"content": "BDI moved 5.0% to 120.0."},
                    "finish_reason": "stop",
                }
            ],
            "usage": {"prompt_tokens": 12, "completion_tokens": 8},
        }


class FakeChat:
    def __init__(self, completions: Any) -> None:
        self.completions = completions


class FakeOpenAI:
    def __init__(self, completions: Any) -> None:
        self.chat = FakeChat(completions)


def _settings() -> Settings:
    return Settings(
        dashscope_api_key=SecretStr("test"),
        llm_model_fast="qwen3.6-flash",
        llm_model_fast_fallbacks="qwen3.5-flash,qwen3.6-flash-2026-04-16",
        llm_model_reasoning="deepseek-v4-flash",
        llm_model_reasoning_fallbacks="qwen3.6-flash",
    )


def test_client_uses_dashscope_model_and_returns_usage() -> None:
    completions = FakeCompletions()
    client = NoLogLLMClient(settings=_settings(), openai_client=FakeOpenAI(completions))

    result = asyncio.run(
        client.complete(
            feature="unit",
            system_prompt="system",
            user_prompt="user",
            tier="fast",
            max_tokens=50,
        )
    )

    assert result is not None
    assert result.model == "qwen3.6-flash"
    assert result.input_tokens == 12
    assert completions.calls[0]["model"] == "qwen3.6-flash"


def test_client_falls_back_to_next_model_on_token_limit() -> None:
    completions = TokenLimitThenOkCompletions()
    client = NoLogLLMClient(settings=_settings(), openai_client=FakeOpenAI(completions))

    result = asyncio.run(
        client.complete(
            feature="unit",
            system_prompt="system",
            user_prompt="user",
            tier="fast",
            max_tokens=50,
        )
    )

    assert result is not None
    assert result.model == "qwen3.5-flash"
    assert [call["model"] for call in completions.calls] == ["qwen3.6-flash", "qwen3.5-flash"]


def test_circuit_breaker_opens_after_five_failed_calls() -> None:
    completions = FailingCompletions()
    client = NoLogLLMClient(settings=_settings(), openai_client=FakeOpenAI(completions))

    for _ in range(5):
        result = asyncio.run(
            client.complete(feature="unit", system_prompt="system", user_prompt="user")
        )
        assert result is None

    calls_after_failures = completions.calls
    result = asyncio.run(
        client.complete(feature="unit", system_prompt="system", user_prompt="user")
    )

    assert result is None
    assert completions.calls == calls_after_failures


def test_validate_narrative_rejects_hallucinated_number() -> None:
    assert validate_narrative("BDI moved to 120.0 after a 5.0% change.", [120.0, 5.0])
    assert not validate_narrative("BDI moved to 120.0 and will reach 999.0.", [120.0, 5.0])
