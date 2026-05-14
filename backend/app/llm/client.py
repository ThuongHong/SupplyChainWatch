from __future__ import annotations

import argparse
import asyncio
import time
from dataclasses import dataclass
from datetime import UTC, datetime, timedelta
from typing import Any, Literal

import structlog
from openai import AsyncOpenAI
from tenacity import (
    AsyncRetrying,
    retry_if_exception,
    stop_after_attempt,
    wait_random_exponential,
)

from app.config import Settings, get_settings
from app.db.models import LLMUsageLog
from app.db.session import SessionLocal

logger = structlog.get_logger(__name__)

ModelTier = Literal["fast", "reasoning"]


@dataclass(frozen=True)
class LLMResult:
    """Normalized LLM response."""

    content: str
    model: str
    input_tokens: int | None
    output_tokens: int | None
    duration_ms: int


class LLMClient:
    """DashScope OpenAI-compatible async client with retry and circuit breaker."""

    def __init__(self, settings: Settings | None = None, openai_client: Any | None = None) -> None:
        self.settings = settings or get_settings()
        self._failure_count = 0
        self._disabled_until: datetime | None = None
        self._client = openai_client
        api_key = (
            self.settings.dashscope_api_key.get_secret_value()
            if self.settings.dashscope_api_key is not None
            else ""
        )
        if self._client is None and api_key:
            self._client = AsyncOpenAI(
                api_key=api_key,
                base_url=self.settings.dashscope_base_url,
            )

    async def complete(
        self,
        *,
        feature: str,
        system_prompt: str,
        user_prompt: str,
        tier: ModelTier = "fast",
        temperature: float = 0.3,
        max_tokens: int = 200,
        response_format: dict[str, str] | None = None,
    ) -> LLMResult | None:
        """Return an LLM completion, or None when fallback should be used."""
        models = self._models_for_tier(tier)
        primary_model = models[0]
        if not self.settings.llm_enabled:
            logger.info("llm_disabled", feature=feature, model=primary_model, fallback_used=True)
            self._log_usage(feature, primary_model, None, None, None, "disabled", None)
            return None
        if self._client is None:
            logger.warning(
                "llm_missing_api_key", feature=feature, model=primary_model, fallback_used=True
            )
            self._log_usage(feature, primary_model, None, None, None, "missing_api_key", None)
            return None
        if self._circuit_open():
            logger.warning(
                "llm_circuit_open",
                feature=feature,
                model=primary_model,
                disabled_until=self._disabled_until,
                fallback_used=True,
            )
            self._log_usage(feature, primary_model, None, None, None, "circuit_open", None)
            return None

        last_token_error: str | None = None
        for model in models:
            started = time.perf_counter()
            try:
                response = await self._create_completion(
                    model=model,
                    system_prompt=system_prompt,
                    user_prompt=user_prompt,
                    temperature=temperature,
                    max_tokens=max_tokens,
                    timeout=self._timeout_for_tier(tier),
                    response_format=response_format,
                )
            except Exception as exc:  # noqa: BLE001 - provider failures must fall back.
                duration_ms = int((time.perf_counter() - started) * 1000)
                if _is_token_limit_error(exc):
                    last_token_error = str(exc)
                    logger.warning(
                        "llm_token_limit_retry_next_model",
                        feature=feature,
                        model=model,
                        duration_ms=duration_ms,
                        error=str(exc),
                        fallback_models=models,
                    )
                    self._log_usage(
                        feature, model, None, None, duration_ms, "token_limit", str(exc)
                    )
                    continue
                self._record_failure()
                logger.error(
                    "llm_call_failed",
                    feature=feature,
                    model=model,
                    duration_ms=duration_ms,
                    error=str(exc),
                    fallback_used=True,
                )
                self._log_usage(feature, model, None, None, duration_ms, "error", str(exc))
                return None

            duration_ms = int((time.perf_counter() - started) * 1000)
            if self._finish_reason_from_response(response) == "length":
                last_token_error = "completion stopped because model output token limit was reached"
                logger.warning(
                    "llm_output_token_limit_retry_next_model",
                    feature=feature,
                    model=model,
                    duration_ms=duration_ms,
                    fallback_models=models,
                )
                input_tokens, output_tokens = self._usage_from_response(response)
                self._log_usage(
                    feature,
                    model,
                    input_tokens,
                    output_tokens,
                    duration_ms,
                    "token_limit",
                    last_token_error,
                )
                continue

            content = self._content_from_response(response)
            input_tokens, output_tokens = self._usage_from_response(response)
            self._failure_count = 0
            logger.info(
                "llm_call_succeeded",
                feature=feature,
                model=model,
                input_token_count=input_tokens,
                output_token_count=output_tokens,
                duration_ms=duration_ms,
            )
            self._log_usage(feature, model, input_tokens, output_tokens, duration_ms, "ok", None)
            return LLMResult(
                content=content,
                model=model,
                input_tokens=input_tokens,
                output_tokens=output_tokens,
                duration_ms=duration_ms,
            )

        logger.error(
            "llm_all_models_token_limited",
            feature=feature,
            models=models,
            error=last_token_error,
            fallback_used=True,
        )
        return None

    async def _create_completion(
        self,
        *,
        model: str,
        system_prompt: str,
        user_prompt: str,
        temperature: float,
        max_tokens: int,
        timeout: int,
        response_format: dict[str, str] | None,
    ) -> Any:
        kwargs: dict[str, Any] = {
            "model": model,
            "messages": [
                {"role": "system", "content": system_prompt},
                {"role": "user", "content": user_prompt},
            ],
            "temperature": temperature,
            "max_tokens": max_tokens,
            "timeout": timeout,
        }
        if response_format is not None:
            kwargs["response_format"] = response_format

        if self._client is None:
            raise RuntimeError("LLM client is not configured")

        async for attempt in AsyncRetrying(
            stop=stop_after_attempt(3),
            wait=wait_random_exponential(multiplier=1, max=8),
            retry=retry_if_exception(lambda exc: not _is_token_limit_error(exc)),
            reraise=True,
        ):
            with attempt:
                return await self._client.chat.completions.create(**kwargs)
        raise RuntimeError("LLM retry loop exited unexpectedly")

    def _record_failure(self) -> None:
        self._failure_count += 1
        if self._failure_count >= 5:
            self._disabled_until = datetime.now(UTC) + timedelta(minutes=5)
            logger.error(
                "llm_circuit_breaker_opened",
                failures=self._failure_count,
                disabled_until=self._disabled_until,
            )

    def _circuit_open(self) -> bool:
        if self._disabled_until is None:
            return False
        if datetime.now(UTC) >= self._disabled_until:
            self._disabled_until = None
            self._failure_count = 0
            return False
        return True

    def _model_for_tier(self, tier: ModelTier) -> str:
        if tier == "reasoning":
            return self.settings.llm_model_reasoning
        return self.settings.llm_model_fast

    def _models_for_tier(self, tier: ModelTier) -> list[str]:
        primary = self._model_for_tier(tier)
        fallback_csv = (
            self.settings.llm_model_reasoning_fallbacks
            if tier == "reasoning"
            else self.settings.llm_model_fast_fallbacks
        )
        return _dedupe([primary, *_split_csv(fallback_csv)])

    def _timeout_for_tier(self, tier: ModelTier) -> int:
        if tier == "reasoning":
            return self.settings.llm_timeout_reasoning
        return self.settings.llm_timeout_fast

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
        try:
            with SessionLocal() as db:
                db.add(
                    LLMUsageLog(
                        feature=feature,
                        model=model,
                        input_tokens=input_tokens,
                        output_tokens=output_tokens,
                        duration_ms=duration_ms,
                        status=status,
                        error=error[:1000] if error else None,
                    )
                )
                db.commit()
        except Exception as exc:  # noqa: BLE001 - logging must not block fallbacks.
            logger.warning("llm_usage_log_failed", feature=feature, error=str(exc))

    @staticmethod
    def _content_from_response(response: Any) -> str:
        choices = _get_value(response, "choices", [])
        first_choice = choices[0]
        message = _get_value(first_choice, "message", {})
        return str(_get_value(message, "content", "")).strip()

    @staticmethod
    def _usage_from_response(response: Any) -> tuple[int | None, int | None]:
        usage = _get_value(response, "usage", None)
        if usage is None:
            return None, None
        prompt_tokens = _get_value(usage, "prompt_tokens", None)
        completion_tokens = _get_value(usage, "completion_tokens", None)
        return _as_optional_int(prompt_tokens), _as_optional_int(completion_tokens)

    @staticmethod
    def _finish_reason_from_response(response: Any) -> str | None:
        choices = _get_value(response, "choices", [])
        if not choices:
            return None
        return _get_value(choices[0], "finish_reason", None)


def _get_value(value: Any, key: str, default: Any) -> Any:
    if isinstance(value, dict):
        return value.get(key, default)
    return getattr(value, key, default)


def _as_optional_int(value: Any) -> int | None:
    if value is None:
        return None
    return int(value)


def _split_csv(value: str) -> list[str]:
    return [item.strip() for item in value.split(",") if item.strip()]


def _dedupe(values: list[str]) -> list[str]:
    seen: set[str] = set()
    result: list[str] = []
    for value in values:
        if value in seen:
            continue
        seen.add(value)
        result.append(value)
    return result


def _is_token_limit_error(exc: BaseException) -> bool:
    text = str(exc).lower()
    token_markers = (
        "context_length",
        "context length",
        "maximum context",
        "token limit",
        "max tokens",
        "maximum tokens",
        "too many tokens",
        "input is too long",
    )
    return any(marker in text for marker in token_markers)


async def _test_ping() -> None:
    client = LLMClient()
    result = await client.complete(
        feature="test_ping",
        system_prompt="You are a maritime shipping analyst. Reply with JSON only.",
        user_prompt='Return {"status":"ok"} using no extra text.',
        tier="fast",
        temperature=0,
        max_tokens=40,
        response_format={"type": "json_object"},
    )
    if result is None:
        print("LLM unavailable; fallback path would be used.")
        return
    print(result.content)


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument(
        "--test-ping", action="store_true", help="Call DashScope with a trivial prompt"
    )
    args = parser.parse_args()
    if args.test_ping:
        asyncio.run(_test_ping())


if __name__ == "__main__":
    main()
