from __future__ import annotations

from collections.abc import Callable
from typing import Any, TypedDict

from pydantic import BaseModel

from app.analysis.anomaly import detect_anomalies as detect_anomalies_job
from app.analysis.chokepoint_status import (
    compute_chokepoint_status as compute_chokepoint_status_job,
)
from app.analysis.forecast import generate_forecasts
from app.analysis.historical_risk import (
    build_risk_feature_snapshots,
    compute_data_coverage,
    generate_entity_risk_forecasts,
    generate_risk_story_events,
)
from app.analysis.insight_generator import generate_insights as generate_insights_job
from app.analysis.maritime_risk import (
    compute_disruption_propagation,
    compute_maritime_risk_scores,
)
from app.analysis.port_congestion import compute_port_congestion as compute_port_congestion_job
from app.analysis.vessel_monitoring import detect_watchlist_vessel_anomalies
from app.collectors.aisstream import AISStreamCollector
from app.collectors.base import BaseCollector
from app.collectors.bunker_scraper import BunkerScraper
from app.collectors.comtrade import ComtradeCollector
from app.collectors.fbx_scraper import FBXScraper
from app.collectors.fred import FREDCollector
from app.collectors.openmeteo import OpenMeteoMarineCollector
from app.collectors.portwatch import PortWatchCollector
from app.collectors.wci_scraper import WCIScraper
from app.config import get_settings
from app.db.models import (
    BunkerPrice,
    FreightIndex,
    PortWatchMetric,
    TradeFlow,
    Vessel,
    VesselPosition,
)
from app.db.session import SessionLocal
from app.llm.narrator import enrich_top_insights as enrich_top_insights_job
from app.schemas.records import (
    BunkerPriceRecord,
    FreightIndexRecord,
    PortWatchMetricRecord,
    TradeFlowRecord,
    VesselPositionRecord,
    VesselRecord,
)
from app.services.enrichment import enrich_watchlist_vessel
from app.services.watchlist import active_watchlist_mmsi, refresh_watchlist_from_risk
from app.tasks.celery_app import celery_app


class SourceCollectionResult(TypedDict):
    status: str
    rows: int
    error: str | None


@celery_app.task(name="collect_ais_snapshot")
def collect_ais_snapshot() -> int:
    with SessionLocal() as db:
        watchlist = active_watchlist_mmsi(db)
        records = AISStreamCollector(watchlist_mmsi=watchlist).run(db=db, persist=_persist_records)
        return len(records)


@celery_app.task(name="collect_fred")
def collect_fred() -> int:
    return _run_collector(FREDCollector())


@celery_app.task(name="collect_comtrade")
def collect_comtrade() -> int:
    if not get_settings().un_comtrade_api_key:
        return 0
    return _run_collector(ComtradeCollector())


@celery_app.task(name="collect_openmeteo")
def collect_openmeteo() -> int:
    return _run_collector(OpenMeteoMarineCollector())


@celery_app.task(name="collect_portwatch")
def collect_portwatch() -> int:
    settings = get_settings()
    try:
        collect_ais_snapshot()
    except Exception:
        pass
    rows = _run_collector(
        PortWatchCollector(
            use_demo_fallback=settings.backend_demo_fallback_enabled,
            history_days=getattr(settings, "portwatch_history_days", None),
        )
    )
    if rows > 0:
        _run_risk_derivation()
    return rows


@celery_app.task(name="scrape_bunker")
def scrape_bunker() -> int:
    return _run_collector(BunkerScraper())


@celery_app.task(name="scrape_fbx")
def scrape_fbx() -> int:
    return _run_collector(FBXScraper())


@celery_app.task(name="scrape_wci")
def scrape_wci() -> int:
    return _run_collector(WCIScraper())


@celery_app.task(name="collect_all")
def collect_all() -> dict[str, SourceCollectionResult]:
    settings = get_settings()
    return {
        "ais": _collect_source_result(
            collect_ais_snapshot,
            disabled_reason=(
                None if settings.aisstream_api_key else "AISSTREAM_API_KEY is not configured"
            ),
        ),
        "fred": _collect_source_result(
            collect_fred,
            disabled_reason=None if settings.fred_api_key else "FRED_API_KEY is not configured",
        ),
        "openmeteo": _collect_source_result(collect_openmeteo),
        "portwatch": _collect_source_result(collect_portwatch),
        "bunker": _collect_source_result(scrape_bunker),
        "fbx": _collect_source_result(scrape_fbx),
        "wci": _collect_source_result(scrape_wci),
    }


@celery_app.task(name="compute_port_congestion")
def compute_port_congestion() -> int:
    with SessionLocal() as db:
        return compute_port_congestion_job(db)


@celery_app.task(name="compute_chokepoint_status")
def compute_chokepoint_status() -> int:
    with SessionLocal() as db:
        return compute_chokepoint_status_job(db)


@celery_app.task(name="detect_anomalies")
def detect_anomalies() -> int:
    with SessionLocal() as db:
        created = detect_anomalies_job(db)
        created += detect_watchlist_vessel_anomalies(db)
        return created


@celery_app.task(name="generate_forecast")
def generate_forecast() -> int:
    with SessionLocal() as db:
        created = generate_forecasts(db)
        created += generate_entity_risk_forecasts(db)
        return created


@celery_app.task(name="generate_insights")
def generate_insights() -> int:
    with SessionLocal() as db:
        return generate_insights_job(db)


@celery_app.task(name="compute_maritime_risk")
def compute_maritime_risk() -> int:
    return sum(_run_risk_derivation().values())


@celery_app.task(name="refresh_historical_risk")
def refresh_historical_risk() -> dict[str, int]:
    with SessionLocal() as db:
        coverage_rows = compute_data_coverage(db)
        feature_rows = build_risk_feature_snapshots(db)
        story_rows = generate_risk_story_events(db)
        forecast_rows = generate_entity_risk_forecasts(db)
        return {
            "coverage_rows": coverage_rows,
            "feature_rows": feature_rows,
            "story_rows": story_rows,
            "forecast_rows": forecast_rows,
        }


@celery_app.task(name="enrich_top_insights")
def enrich_top_insights() -> int:
    with SessionLocal() as db:
        return enrich_top_insights_job(db)


@celery_app.task(name="enrich_watchlist")
def enrich_watchlist() -> int:
    with SessionLocal() as db:
        watchlist = active_watchlist_mmsi(db)
        for mmsi in watchlist:
            enrich_watchlist_vessel(db, mmsi=mmsi)
        return len(watchlist)


def _run_collector(collector: BaseCollector[Any]) -> int:
    with SessionLocal() as db:
        records = collector.run(db=db, persist=_persist_records)
        return len(records)


def _run_risk_derivation() -> dict[str, int]:
    with SessionLocal() as db:
        risk_rows = compute_maritime_risk_scores(db)
        propagation_rows = 0
        watchlist_rows = 0
        insight_rows = 0
        coverage_rows = 0
        feature_rows = 0
        story_rows = 0
        forecast_rows = 0
        if risk_rows > 0:
            propagation_rows = compute_disruption_propagation(db)
            watchlist_rows = refresh_watchlist_from_risk(db)
            coverage_rows = compute_data_coverage(db)
            feature_rows = build_risk_feature_snapshots(db)
            story_rows = generate_risk_story_events(db)
            forecast_rows = generate_entity_risk_forecasts(db)
            insight_rows = generate_insights_job(db)
        return {
            "risk_rows": risk_rows,
            "propagation_rows": propagation_rows,
            "watchlist_rows": watchlist_rows,
            "insight_rows": insight_rows,
            "coverage_rows": coverage_rows,
            "feature_rows": feature_rows,
            "story_rows": story_rows,
            "forecast_rows": forecast_rows,
        }


def _collect_source_result(
    task: Callable[[], int],
    *,
    disabled_reason: str | None = None,
) -> SourceCollectionResult:
    if disabled_reason is not None:
        return {"status": "disabled", "rows": 0, "error": disabled_reason}
    try:
        rows = task()
    except Exception as exc:
        return {"status": "failed", "rows": 0, "error": str(exc)}
    return {"status": "success", "rows": rows, "error": None}


def _persist_records(records: list[BaseModel], db: Any) -> None:
    if db is None:
        return
    for record in records:
        if isinstance(record, VesselPositionRecord):
            db.merge(
                VesselPosition(
                    time=record.time,
                    mmsi=record.mmsi,
                    lat=record.lat,
                    lon=record.lon,
                    sog=record.sog,
                    cog=record.cog,
                    nav_status=record.nav_status,
                )
            )
        elif isinstance(record, VesselRecord):
            db.merge(
                Vessel(
                    mmsi=record.mmsi,
                    imo=record.imo if record.imo not in (0, None) else None,
                    name=record.name,
                    type=record.type,
                    type_label=record.type_label,
                    flag=record.flag,
                    length=record.length,
                    width=record.width,
                    last_seen=record.last_seen,
                )
            )
        elif isinstance(record, FreightIndexRecord):
            db.merge(
                FreightIndex(
                    time=record.time,
                    index_name=record.index_name,
                    value=record.value,
                    source=record.source,
                    metadata_=record.metadata,
                )
            )
        elif isinstance(record, BunkerPriceRecord):
            db.merge(
                BunkerPrice(
                    time=record.time,
                    port_code=record.port_code,
                    fuel_type=record.fuel_type,
                    price_usd_per_ton=record.price_usd_per_ton,
                )
            )
        elif isinstance(record, TradeFlowRecord):
            db.add(
                TradeFlow(
                    time=record.time,
                    reporter_code=record.reporter_code,
                    partner_code=record.partner_code,
                    commodity_code=record.commodity_code,
                    flow=record.flow,
                    value_usd=record.value_usd,
                    weight_kg=record.weight_kg,
                )
            )
        elif isinstance(record, PortWatchMetricRecord):
            db.merge(
                PortWatchMetric(
                    observed_at=record.observed_at,
                    entity_type=record.entity_type,
                    entity_id=record.entity_id,
                    entity_name=record.entity_name,
                    metric_name=record.metric_name,
                    metric_value=record.metric_value,
                    unit=record.unit,
                    source=record.source,
                    source_entity_id=record.source_entity_id,
                    metadata_=record.metadata,
                )
            )
    db.commit()
