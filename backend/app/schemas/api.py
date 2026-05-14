from __future__ import annotations

from datetime import datetime
from typing import Any, Literal

from pydantic import BaseModel, Field


class HealthResponse(BaseModel):
    status: str
    checked_at: datetime


class IndexSummary(BaseModel):
    index_name: str
    points: int
    first_time: datetime | None
    last_time: datetime | None


class IndexPoint(BaseModel):
    time: datetime
    index_name: str
    value: float
    source: str
    metadata: dict[str, Any] | None = None


class ForecastResponse(BaseModel):
    id: int
    created_at: datetime
    index_name: str
    horizon_days: int
    predictions: list[dict[str, Any]]
    metrics: dict[str, Any]
    model_name: str | None = None
    model_params: dict[str, Any] | None = None
    commentary: str | None = None


class VesselSnapshotItem(BaseModel):
    time: datetime
    mmsi: int
    lat: float
    lon: float
    sog: float | None = None
    cog: float | None = None
    nav_status: int | None = None
    name: str | None = None
    type: int | None = None
    type_label: str | None = None
    flag: str | None = None


class VesselDetail(BaseModel):
    vessel: dict[str, Any] | None
    track: list[VesselSnapshotItem]


class PortResponse(BaseModel):
    id: int
    locode: str | None = None
    name: str
    country: str
    region: str | None = None
    lat: float | None = None
    lon: float | None = None
    radius_km: float
    twenty_ft_eq_units_year: int | None = None


class PortCongestionResponse(BaseModel):
    time: datetime
    port_id: int
    port_name: str | None = None
    anchored_count: int
    moored_count: int
    underway_count: int
    total_in_area: int
    avg_dwell_hours: float | None = None
    median_speed: float | None = None


class ChokepointResponse(BaseModel):
    id: int
    name: str
    vessel_count: int | None = None
    median_speed: float | None = None
    risk_score: float | None = None
    time: datetime | None = None


class ChokepointTimelinePoint(BaseModel):
    time: datetime
    chokepoint_id: int
    vessel_count: int
    median_speed: float | None = None
    risk_score: float | None = None


class AnomalyResponse(BaseModel):
    id: int
    detected_at: datetime
    entity_type: str
    entity_id: str
    severity: str
    metric: str | None = None
    observed: float | None = None
    expected: float | None = None
    z_score: float | None = None
    description: str | None = None
    explanation: str | None = None
    acknowledged: bool = False


class InsightResponse(BaseModel):
    id: int
    generated_at: datetime
    category: str | None = None
    title: str
    narrative: str
    narrative_llm: str | None = None
    narrative_model: str | None = None
    narrative_generated_at: datetime | None = None
    metrics: dict[str, Any] | None = None
    priority: int = 0


class StoryEntity(BaseModel):
    type: Literal["index", "port", "chokepoint"]
    id: str = Field(min_length=1, max_length=100, pattern=r"^[A-Za-z0-9_\- .]+$")


class StoryAnalyzeRequest(BaseModel):
    entity_a: StoryEntity
    entity_b: StoryEntity
    period_days: int = Field(default=90, ge=30, le=365)


class StoryAnalyzeResponse(BaseModel):
    headline: str
    narrative: str
    key_findings: list[str]
    caveats: list[str]


class CorrelationCell(BaseModel):
    index_a: str
    index_b: str
    correlation: float | None
    lag_days: int = 0
    overlap: int = 0


class OverviewStats(BaseModel):
    latest_bdi: float | None = None
    latest_fbx: float | None = None
    active_vessels: int = 0
    high_severity_anomalies: int = 0
    generated_at: datetime


class ErrorResponse(BaseModel):
    detail: str = Field(examples=["Unexpected server error"])
