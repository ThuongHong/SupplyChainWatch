from __future__ import annotations

import json
from typing import Any

BASE_SAFETY = (
    "You are a maritime shipping analyst. Use ONLY numbers provided in the input. "
    "Never invent or estimate figures not given. Use neutral analyst tone. "
    "Use 'may', 'coincides with', and 'suggests'; never assert causation unless the "
    "input explicitly proves it. Avoid marketing language and filler phrases such as "
    '"It\'s worth noting that" and "Interestingly".'
)


def build_narrative_prompt(payload: dict[str, Any]) -> tuple[str, str]:
    system_prompt = (
        f"{BASE_SAFETY} Write 2-3 sentences, maximum 80 words. Use only the supplied "
        "facts and numbers. Do not include bullets."
    )
    return system_prompt, _json_prompt("Enrich this priority insight.", payload)


def build_story_prompt(payload: dict[str, Any]) -> tuple[str, str]:
    system_prompt = (
        f"{BASE_SAFETY} Return valid JSON with keys headline, narrative, key_findings, "
        "and caveats. The narrative must be 3-4 paragraphs. key_findings must contain "
        "3 concise strings. caveats must contain 2 concise strings."
    )
    return system_prompt, _json_prompt(
        "Analyze the relationship between these two entities.", payload
    )


def build_forecast_prompt(payload: dict[str, Any]) -> tuple[str, str]:
    system_prompt = (
        f"{BASE_SAFETY} Write at most 2 sentences. Mention MAPE explicitly. Frame the "
        "forecast as directional, not certain."
    )
    return system_prompt, _json_prompt("Write forecast commentary.", payload)


def build_anomaly_prompt(payload: dict[str, Any]) -> tuple[str, str]:
    system_prompt = (
        f"{BASE_SAFETY} Write exactly 3 sentences. Sentence 1 restates the anomaly "
        "factually. Sentences 2-3 list plausible factors that are present in the input "
        "using hedged language. Do not write the final disclaimer."
    )
    return system_prompt, _json_prompt("Explain possible factors for this anomaly.", payload)


def build_port_switch_prompt(payload: dict[str, Any]) -> tuple[str, str]:
    system_prompt = (
        f"{BASE_SAFETY} Write one paragraph for a shipping or logistics operator. "
        "State the switch-port action, the pressure signal, and the caveat in plain "
        "language. Do not include bullets. Do not use numbers absent from the input."
    )
    return system_prompt, _json_prompt("Write a switch-port recommendation narrative.", payload)


def _json_prompt(instruction: str, payload: dict[str, Any]) -> str:
    return f"{instruction}\nInput JSON:\n{json.dumps(payload, sort_keys=True, default=str)}"
