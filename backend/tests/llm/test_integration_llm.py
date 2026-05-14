from __future__ import annotations

import asyncio

import pytest

from app.config import get_settings
from app.llm.client import LLMClient


@pytest.mark.llm
def test_dashscope_ping_real_api() -> None:
    settings = get_settings()
    if settings.dashscope_api_key is None or not settings.dashscope_api_key.get_secret_value():
        pytest.skip("DASHSCOPE_API_KEY is not configured")

    result = asyncio.run(
        LLMClient(settings=settings).complete(
            feature="integration_ping",
            system_prompt="You are a maritime shipping analyst. Return JSON only.",
            user_prompt='Return {"status":"ok"} using no extra text.',
            temperature=0,
            max_tokens=40,
            response_format={"type": "json_object"},
        )
    )

    assert result is not None
    assert "ok" in result.content
