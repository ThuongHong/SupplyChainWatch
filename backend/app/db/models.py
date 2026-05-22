from __future__ import annotations

from datetime import date, datetime
from typing import Any

from geoalchemy2 import Geography  # type: ignore[import-untyped]
from sqlalchemy import REAL, BigInteger, Boolean, Date, DateTime, Float, Integer, Text, func
from sqlalchemy.dialects.postgresql import JSONB
from sqlalchemy.orm import DeclarativeBase, Mapped, mapped_column


class Base(DeclarativeBase):
    """Base class for ORM models."""


class Vessel(Base):
    __tablename__ = "vessels"

    mmsi: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    imo: Mapped[int | None] = mapped_column(BigInteger)
    name: Mapped[str | None] = mapped_column(Text)
    type: Mapped[int | None] = mapped_column(Integer)
    type_label: Mapped[str | None] = mapped_column(Text)
    flag: Mapped[str | None] = mapped_column(Text)
    dwt: Mapped[int | None] = mapped_column(Integer)
    length: Mapped[float | None] = mapped_column(REAL)
    width: Mapped[float | None] = mapped_column(REAL)
    last_seen: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))


class Port(Base):
    __tablename__ = "ports"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    locode: Mapped[str | None] = mapped_column(Text, unique=True)
    name: Mapped[str] = mapped_column(Text)
    country: Mapped[str] = mapped_column(Text)
    region: Mapped[str | None] = mapped_column(Text)
    geom: Mapped[Any] = mapped_column(Geography(geometry_type="POINT", srid=4326))
    radius_km: Mapped[float] = mapped_column(REAL, default=20)
    twenty_ft_eq_units_year: Mapped[int | None] = mapped_column(BigInteger)


class Chokepoint(Base):
    __tablename__ = "chokepoints"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    name: Mapped[str] = mapped_column(Text)
    geom: Mapped[Any] = mapped_column(Geography(geometry_type="POLYGON", srid=4326))


class VesselPosition(Base):
    __tablename__ = "vessel_positions"

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    mmsi: Mapped[int] = mapped_column(BigInteger, primary_key=True)
    lat: Mapped[float] = mapped_column(Float)
    lon: Mapped[float] = mapped_column(Float)
    sog: Mapped[float | None] = mapped_column(REAL)
    cog: Mapped[float | None] = mapped_column(REAL)
    nav_status: Mapped[int | None] = mapped_column(Integer)


class FreightIndex(Base):
    __tablename__ = "freight_indices"

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    index_name: Mapped[str] = mapped_column(Text, primary_key=True)
    value: Mapped[float] = mapped_column(Float)
    source: Mapped[str] = mapped_column(Text)
    metadata_: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB)


class BunkerPrice(Base):
    __tablename__ = "bunker_prices"

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    port_code: Mapped[str] = mapped_column(Text, primary_key=True)
    fuel_type: Mapped[str] = mapped_column(Text, primary_key=True)
    price_usd_per_ton: Mapped[float] = mapped_column(Float)


class PortCongestion(Base):
    __tablename__ = "port_congestion"

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    port_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    anchored_count: Mapped[int] = mapped_column(Integer)
    moored_count: Mapped[int] = mapped_column(Integer)
    underway_count: Mapped[int] = mapped_column(Integer)
    total_in_area: Mapped[int] = mapped_column(Integer)
    avg_dwell_hours: Mapped[float | None] = mapped_column(REAL)
    median_speed: Mapped[float | None] = mapped_column(REAL)


class ChokepointStatus(Base):
    __tablename__ = "chokepoint_status"

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    chokepoint_id: Mapped[int] = mapped_column(Integer, primary_key=True)
    vessel_count: Mapped[int] = mapped_column(Integer)
    median_speed: Mapped[float | None] = mapped_column(REAL)
    risk_score: Mapped[float | None] = mapped_column(REAL)


class TradeFlow(Base):
    __tablename__ = "trade_flows"

    time: Mapped[date] = mapped_column(Date, primary_key=True)
    reporter_code: Mapped[str | None] = mapped_column(Text, primary_key=True)
    partner_code: Mapped[str | None] = mapped_column(Text, primary_key=True)
    commodity_code: Mapped[str | None] = mapped_column(Text, primary_key=True)
    flow: Mapped[str | None] = mapped_column(Text)
    value_usd: Mapped[float | None] = mapped_column(Float)
    weight_kg: Mapped[float | None] = mapped_column(Float)


class CollectionLog(Base):
    __tablename__ = "collection_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    finished_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    source: Mapped[str] = mapped_column(Text)
    rows_collected: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str | None] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)


class PortWatchMetric(Base):
    __tablename__ = "portwatch_metrics"

    observed_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    entity_type: Mapped[str] = mapped_column(Text, primary_key=True)
    entity_id: Mapped[str] = mapped_column(Text, primary_key=True)
    entity_name: Mapped[str] = mapped_column(Text)
    metric_name: Mapped[str] = mapped_column(Text, primary_key=True)
    metric_value: Mapped[float] = mapped_column(Float)
    unit: Mapped[str | None] = mapped_column(Text)
    source: Mapped[str] = mapped_column(Text, primary_key=True)
    source_entity_id: Mapped[str | None] = mapped_column(Text)
    metadata_: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB)
    collected_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )


class PortRiskScore(Base):
    __tablename__ = "port_risk_scores"

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    port_id: Mapped[int | None] = mapped_column(Integer)
    entity_id: Mapped[str] = mapped_column(Text, primary_key=True)
    entity_name: Mapped[str] = mapped_column(Text)
    score: Mapped[float] = mapped_column(REAL)
    severity: Mapped[str] = mapped_column(Text)
    component_scores: Mapped[dict[str, Any]] = mapped_column(JSONB)
    missing_components: Mapped[list[str] | None] = mapped_column(JSONB)
    reasons: Mapped[list[str] | None] = mapped_column(JSONB)
    source_metrics: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    freshness_status: Mapped[str] = mapped_column(Text, default="fresh")
    as_of: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class ChokepointRiskScore(Base):
    __tablename__ = "chokepoint_risk_scores"

    time: Mapped[datetime] = mapped_column(DateTime(timezone=True), primary_key=True)
    chokepoint_id: Mapped[int | None] = mapped_column(Integer)
    entity_id: Mapped[str] = mapped_column(Text, primary_key=True)
    entity_name: Mapped[str] = mapped_column(Text)
    score: Mapped[float] = mapped_column(REAL)
    severity: Mapped[str] = mapped_column(Text)
    component_scores: Mapped[dict[str, Any]] = mapped_column(JSONB)
    missing_components: Mapped[list[str] | None] = mapped_column(JSONB)
    reasons: Mapped[list[str] | None] = mapped_column(JSONB)
    source_metrics: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    freshness_status: Mapped[str] = mapped_column(Text, default="fresh")
    as_of: Mapped[datetime] = mapped_column(DateTime(timezone=True))


class VesselWatchlist(Base):
    __tablename__ = "vessel_watchlist"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mmsi: Mapped[int] = mapped_column(BigInteger, unique=True)
    reason: Mapped[str] = mapped_column(Text)
    source_rule: Mapped[str] = mapped_column(Text)
    priority: Mapped[int] = mapped_column(Integer, default=5)
    active: Mapped[bool] = mapped_column(Boolean, default=True)
    entity_type: Mapped[str | None] = mapped_column(Text)
    entity_id: Mapped[str | None] = mapped_column(Text)
    expires_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    created_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    updated_at: Mapped[datetime | None] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    metadata_: Mapped[dict[str, Any] | None] = mapped_column("metadata", JSONB)


class VesselEnrichmentCache(Base):
    __tablename__ = "vessel_enrichment_cache"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    mmsi: Mapped[int] = mapped_column(BigInteger)
    source: Mapped[str] = mapped_column(Text)
    fetched_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    expires_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(REAL)
    data: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    error: Mapped[str | None] = mapped_column(Text)


class DisruptionPropagation(Base):
    __tablename__ = "disruption_propagation"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    source_entity_type: Mapped[str] = mapped_column(Text)
    source_entity_id: Mapped[str] = mapped_column(Text)
    source_entity_name: Mapped[str] = mapped_column(Text)
    target_entity_type: Mapped[str] = mapped_column(Text)
    target_entity_id: Mapped[str] = mapped_column(Text)
    target_entity_name: Mapped[str] = mapped_column(Text)
    route_lane: Mapped[str | None] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(Text)
    confidence: Mapped[float] = mapped_column(REAL)
    explanation: Mapped[str] = mapped_column(Text)
    source_metrics: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    started_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    updated_at: Mapped[datetime] = mapped_column(DateTime(timezone=True))
    status: Mapped[str] = mapped_column(Text, default="active")


class LLMUsageLog(Base):
    __tablename__ = "llm_usage_log"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    timestamp: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    feature: Mapped[str] = mapped_column(Text)
    model: Mapped[str] = mapped_column(Text)
    input_tokens: Mapped[int | None] = mapped_column(Integer)
    output_tokens: Mapped[int | None] = mapped_column(Integer)
    duration_ms: Mapped[int | None] = mapped_column(Integer)
    status: Mapped[str] = mapped_column(Text)
    error: Mapped[str | None] = mapped_column(Text)


class Anomaly(Base):
    __tablename__ = "anomalies"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    detected_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    entity_type: Mapped[str] = mapped_column(Text)
    entity_id: Mapped[str] = mapped_column(Text)
    severity: Mapped[str] = mapped_column(Text)
    metric: Mapped[str | None] = mapped_column(Text)
    observed: Mapped[float | None] = mapped_column(Float)
    expected: Mapped[float | None] = mapped_column(Float)
    z_score: Mapped[float | None] = mapped_column(Float)
    description: Mapped[str | None] = mapped_column(Text)
    explanation: Mapped[str | None] = mapped_column(Text)
    acknowledged: Mapped[bool] = mapped_column(Boolean, default=False)


class Forecast(Base):
    __tablename__ = "forecasts"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    created_at: Mapped[datetime] = mapped_column(DateTime(timezone=True), server_default=func.now())
    index_name: Mapped[str] = mapped_column(Text)
    horizon_days: Mapped[int] = mapped_column(Integer)
    predictions: Mapped[list[dict[str, Any]]] = mapped_column(JSONB)
    metrics: Mapped[dict[str, Any]] = mapped_column(JSONB)
    model_name: Mapped[str | None] = mapped_column(Text)
    model_params: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    commentary: Mapped[str | None] = mapped_column(Text)


class Insight(Base):
    __tablename__ = "insights"

    id: Mapped[int] = mapped_column(Integer, primary_key=True)
    generated_at: Mapped[datetime] = mapped_column(
        DateTime(timezone=True), server_default=func.now()
    )
    category: Mapped[str | None] = mapped_column(Text)
    title: Mapped[str] = mapped_column(Text)
    narrative: Mapped[str] = mapped_column(Text)
    narrative_llm: Mapped[str | None] = mapped_column(Text)
    narrative_model: Mapped[str | None] = mapped_column(Text)
    narrative_generated_at: Mapped[datetime | None] = mapped_column(DateTime(timezone=True))
    metrics: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    priority: Mapped[int] = mapped_column(Integer, default=0)
    event_type: Mapped[str | None] = mapped_column(Text)
    confidence: Mapped[float | None] = mapped_column(REAL)
    affected_entities: Mapped[list[dict[str, Any]] | None] = mapped_column(JSONB)
    source_metrics: Mapped[dict[str, Any] | None] = mapped_column(JSONB)
    attention_level: Mapped[str | None] = mapped_column(Text)
