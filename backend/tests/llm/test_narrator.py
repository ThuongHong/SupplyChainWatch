from __future__ import annotations

import asyncio

from app.llm.client import LLMResult
from app.llm.narrator import enrich_insight_payload
from app.llm.prompts import build_narrative_prompt


class FakeNarratorClient:
    def __init__(self) -> None:
        self.system_prompt = ""
        self.user_prompt = ""

    async def complete(
        self,
        *,
        feature: str,
        system_prompt: str,
        user_prompt: str,
        tier: str = "fast",
        temperature: float = 0.3,
        max_tokens: int = 200,
        response_format: dict[str, str] | None = None,
    ) -> LLMResult:
        self.system_prompt = system_prompt
        self.user_prompt = user_prompt
        return LLMResult(
            content="FBX_GLOBAL moved 4.2% to 2380.0, while congestion sits at 18.0.",
            model="qwen3.5-flash",
            input_tokens=20,
            output_tokens=15,
            duration_ms=10,
        )


def test_narrative_prompt_contains_number_safety() -> None:
    system_prompt, user_prompt = build_narrative_prompt(
        {"index_name": "FBX_GLOBAL", "current_value": 2380.0}
    )

    assert "Use ONLY numbers provided" in system_prompt
    assert "FBX_GLOBAL" in user_prompt


def test_enrich_insight_payload_validates_output() -> None:
    payload = {
        "index_name": "FBX_GLOBAL",
        "current_value": 2380.0,
        "pct_change": 4.2,
        "related_signals": [{"signal_name": "congestion", "value": 18.0}],
    }
    fake_client = FakeNarratorClient()

    result = asyncio.run(
        enrich_insight_payload(payload, fallback="template", client=fake_client)  # type: ignore[arg-type]
    )

    assert result == (
        "FBX_GLOBAL moved 4.2% to 2380.0, while congestion sits at 18.0.",
        "qwen3.5-flash",
    )
    assert "Use ONLY numbers provided" in fake_client.system_prompt
