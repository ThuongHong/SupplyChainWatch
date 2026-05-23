from __future__ import annotations

from datetime import date, datetime
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
    # PortWatch trade metrics — supplementary, present when PortWatch has data for this port
    portwatch_n_total: int | None = None
    portwatch_portcalls: int | None = None


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
    event_type: str | None = None
    confidence: float | None = None
    affected_entities: list[dict[str, Any]] | None = None
    source_metrics: dict[str, Any] | None = None
    attention_level: str | None = None


class RiskScoreResponse(BaseModel):
    entity_id: str
    entity_name: str
    entity_type: Literal["port", "chokepoint", "region"]
    score: float
    severity: str
    component_scores: dict[str, Any]
    missing_components: list[str] | None = None
    reasons: list[str] | None = None
    source_metrics: dict[str, Any] | None = None
    freshness_status: str
    as_of: datetime
    lat: float | None = None
    lon: float | None = None


class DataFreshnessResponse(BaseModel):
    source: str
    latest_observed_at: datetime | None = None
    latest_collected_at: datetime | None = None
    freshness_status: str
    rows: int = 0


class DataCoverageResponse(BaseModel):
    source: str
    entity_type: str
    entity_id: str
    entity_name: str
    first_observed_at: datetime | None = None
    latest_observed_at: datetime | None = None
    observed_rows: int = 0
    expected_days: int = 0
    missing_days: int = 0
    freshness_status: str
    last_collection_status: str | None = None
    updated_at: datetime | None = None
    metadata: dict[str, Any] | None = None


class RiskFeatureSnapshotResponse(BaseModel):
    snapshot_date: datetime | date
    entity_type: str
    entity_id: str
    entity_name: str
    risk_score: float | None = None
    severity: str | None = None
    feature_values: dict[str, Any]
    baseline_values: dict[str, Any]
    z_scores: dict[str, Any]
    deltas: dict[str, Any]
    missing_features: list[str] | None = None
    source_freshness: dict[str, Any] | None = None
    driver_metadata: dict[str, Any] | None = None
    feature_schema_version: str


class RiskEntityHistoryResponse(BaseModel):
    entity_id: str
    coverage: list[DataCoverageResponse]
    snapshots: list[RiskFeatureSnapshotResponse]
    data_sufficiency: dict[str, Any]


class RiskStoryEventResponse(BaseModel):
    event_key: str
    event_time: datetime
    entity_type: str
    entity_id: str
    entity_name: str
    event_type: str
    severity: str
    metric: str
    observed: float | None = None
    expected: float | None = None
    z_score: float | None = None
    percent_change: float | None = None
    drivers: dict[str, Any] | None = None
    source_metrics: dict[str, Any] | None = None
    narrative: str
    confidence: float
    attention_level: str
    data_sufficiency: dict[str, Any] | None = None


class EntityRiskForecastResponse(BaseModel):
    forecast_key: str | None = None
    created_at: datetime | None = None
    entity_type: str | None = None
    entity_id: str
    entity_name: str | None = None
    horizon_days: int
    predictions: list[dict[str, Any]]
    confidence: float
    train_window_start: date | None = None
    train_window_end: date | None = None
    data_sufficiency_status: str
    unavailable_reason: str | None = None
    key_drivers: list[str] | None = None
    metrics: dict[str, Any]
    model_name: str | None = None
    model_params: dict[str, Any] | None = None
    feature_schema_version: str | None = None


class DisruptionPropagationResponse(BaseModel):
    id: int
    source_entity_type: str
    source_entity_id: str
    source_entity_name: str
    target_entity_type: str
    target_entity_id: str
    target_entity_name: str
    route_lane: str | None = None
    severity: str
    confidence: float
    explanation: str
    source_metrics: dict[str, Any] | None = None
    started_at: datetime
    updated_at: datetime
    status: str


class VesselWatchlistResponse(BaseModel):
    mmsi: int
    reason: str
    source_rule: str
    priority: int
    active: bool
    entity_type: str | None = None
    entity_id: str | None = None
    expires_at: datetime | None = None
    metadata: dict[str, Any] | None = None


class VesselEnrichmentResponse(BaseModel):
    mmsi: int
    source: str
    fetched_at: datetime
    expires_at: datetime
    status: str
    confidence: float | None = None
    data: dict[str, Any] | None = None
    error: str | None = None


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
