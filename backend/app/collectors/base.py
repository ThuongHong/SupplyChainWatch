from __future__ import annotations

import time
from collections.abc import Callable, Iterable
from datetime import UTC, datetime
from typing import Any, Generic, TypeVar

import httpx
import structlog
from pydantic import BaseModel, ValidationError
from sqlalchemy.orm import Session

from app.db.models import CollectionLog

RecordT = TypeVar("RecordT", bound=BaseModel)
logger = structlog.get_logger(__name__)


class CollectorError(RuntimeError):
    """Raised when a collector cannot complete."""


class BaseCollector(Generic[RecordT]):
    """Base collector with retry, validation, politeness, and audit logging."""

    source: str
    record_model: type[RecordT]
    min_request_interval_seconds: float = 0

    def __init__(
        self,
        *,
        timeout_seconds: float = 30,
        max_retries: int = 3,
        backoff_seconds: float = 1,
        client: httpx.Client | None = None,
    ) -> None:
        self.timeout_seconds = timeout_seconds
        self.max_retries = max_retries
        self.backoff_seconds = backoff_seconds
        self._client = client
        self._last_request_at: float | None = None

    @property
    def client(self) -> httpx.Client:
        """Return the configured HTTP client."""
        if self._client is None:
            self._client = httpx.Client(timeout=self.timeout_seconds)
        return self._client

    def collect(self) -> list[dict[str, Any]]:
        """Collect raw dictionaries from the source."""
        raise NotImplementedError

    def validate(self, rows: Iterable[dict[str, Any]]) -> list[RecordT]:
        """Validate collected rows with the collector record model."""
        records: list[RecordT] = []
        for row in rows:
            records.append(self.record_model.model_validate(row))
        return records

    def request_json(self, method: str, url: str, **kwargs: Any) -> Any:
        """Make a polite HTTP request with exponential backoff."""
        self._respect_politeness_delay()
        for attempt in range(1, self.max_retries + 1):
            try:
                response = self.client.request(method, url, **kwargs)
                if response.status_code == 429:
                    logger.warning("rate_limited", source=self.source, url=url, attempt=attempt)
                response.raise_for_status()
                self._last_request_at = time.monotonic()
                return response.json()
            except httpx.HTTPError as exc:
                if attempt >= self.max_retries:
                    raise CollectorError(f"{self.source} request failed: {exc}") from exc
                sleep_for = self.backoff_seconds * (2 ** (attempt - 1))
                logger.warning(
                    "collector_retry",
                    source=self.source,
                    url=url,
                    attempt=attempt,
                    sleep_for=sleep_for,
                    error=str(exc),
                )
                time.sleep(sleep_for)
        raise CollectorError(f"{self.source} request failed")

    def run(
        self,
        *,
        db: Session | None = None,
        persist: Callable[[list[RecordT], Session | None], None] | None = None,
    ) -> list[RecordT]:
        """Collect, validate, optionally persist, and log the collector run."""
        started_at = datetime.now(UTC)
        log_row = CollectionLog(source=self.source, started_at=started_at, status="running")
        if db is not None:
            db.add(log_row)
            db.commit()
            db.refresh(log_row)

        try:
            records = self.validate(self.collect())
            if persist is not None:
                persist(records, db)
            self._finish_log(db, log_row, len(records), "success", None)
            return records
        except (CollectorError, ValidationError) as exc:
            self._finish_log(db, log_row, 0, "failed", str(exc))
            raise

    def _finish_log(
        self,
        db: Session | None,
        log_row: CollectionLog,
        rows_collected: int,
        status: str,
        error: str | None,
    ) -> None:
        if db is None:
            logger.info(
                "collector_finished",
                source=self.source,
                rows_collected=rows_collected,
                status=status,
                error=error,
            )
            return
        log_row.finished_at = datetime.now(UTC)
        log_row.rows_collected = rows_collected
        log_row.status = status
        log_row.error = error
        db.add(log_row)
        db.commit()

    def _respect_politeness_delay(self) -> None:
        if self.min_request_interval_seconds <= 0 or self._last_request_at is None:
            return
        elapsed = time.monotonic() - self._last_request_at
        remaining = self.min_request_interval_seconds - elapsed
        if remaining > 0:
            time.sleep(remaining)
