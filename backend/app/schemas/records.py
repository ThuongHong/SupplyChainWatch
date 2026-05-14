from __future__ import annotations

from datetime import UTC, date, datetime
from typing import Any

from pydantic import BaseModel, ConfigDict, Field, field_validator


class VesselPositionRecord(BaseModel):
    """Validated vessel position record."""

    model_config = ConfigDict(extra="allow")

    time: datetime = Field(default_factory=lambda: datetime.now(UTC))
    mmsi: int
    lat: float = Field(ge=-90, le=90)
    lon: float = Field(ge=-180, le=180)
    sog: float | None = None
    cog: float | None = None
    nav_status: int | None = None

    @field_validator("time")
    @classmethod
    def ensure_utc(cls, value: datetime) -> datetime:
        """Normalize timestamps to UTC."""
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


class FreightIndexRecord(BaseModel):
    """Validated freight index record."""

    time: datetime
    index_name: str
    value: float
    source: str
    metadata: dict[str, Any] | None = None

    @field_validator("time")
    @classmethod
    def ensure_utc(cls, value: datetime) -> datetime:
        """Normalize timestamps to UTC."""
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)


class BunkerPriceRecord(BaseModel):
    """Validated bunker price record."""

    time: datetime
    port_code: str
    fuel_type: str
    price_usd_per_ton: float = Field(gt=0)


class TradeFlowRecord(BaseModel):
    """Validated trade-flow record."""

    time: date
    reporter_code: str | None = None
    partner_code: str | None = None
    commodity_code: str | None = None
    flow: str | None = None
    value_usd: float | None = None
    weight_kg: float | None = None
