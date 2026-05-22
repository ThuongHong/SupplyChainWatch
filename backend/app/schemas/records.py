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


class VesselRecord(BaseModel):
    """Validated AIS vessel static-data record."""

    mmsi: int
    imo: int | None = None
    name: str | None = None
    type: int | None = None
    type_label: str | None = None
    flag: str | None = None
    length: float | None = None
    width: float | None = None
    last_seen: datetime | None = None

    @field_validator("last_seen")
    @classmethod
    def ensure_utc(cls, value: datetime | None) -> datetime | None:
        """Normalize timestamps to UTC."""
        if value is None:
            return None
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


class PortWatchMetricRecord(BaseModel):
    """Validated normalized PortWatch/PortStraitWatch metric."""

    observed_at: datetime
    entity_type: str = Field(pattern="^(port|chokepoint|region)$")
    entity_id: str
    entity_name: str
    metric_name: str
    metric_value: float
    unit: str | None = None
    source: str
    source_entity_id: str | None = None
    metadata: dict[str, Any] | None = None

    @field_validator("observed_at")
    @classmethod
    def ensure_observed_at_utc(cls, value: datetime) -> datetime:
        """Normalize timestamps to UTC."""
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value.astimezone(UTC)
