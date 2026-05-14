from __future__ import annotations

from typing import Any

from pydantic import BaseModel

from app.analysis.anomaly import detect_anomalies as detect_anomalies_job
from app.analysis.chokepoint_status import (
    compute_chokepoint_status as compute_chokepoint_status_job,
)
from app.analysis.forecast import generate_forecasts
from app.analysis.insight_generator import generate_insights as generate_insights_job
from app.analysis.port_congestion import compute_port_congestion as compute_port_congestion_job
from app.collectors.aisstream import AISStreamCollector
from app.collectors.base import BaseCollector
from app.collectors.bunker_scraper import BunkerScraper
from app.collectors.comtrade import ComtradeCollector
from app.collectors.fbx_scraper import FBXScraper
from app.collectors.fred import FREDCollector
from app.collectors.openmeteo import OpenMeteoMarineCollector
from app.collectors.wci_scraper import WCIScraper
from app.config import get_settings
from app.db.models import BunkerPrice, FreightIndex, TradeFlow, VesselPosition
from app.db.session import SessionLocal
from app.llm.anomaly_explainer import explain_recent_high_anomalies
from app.llm.forecast_commenter import comment_recent_forecasts
from app.llm.narrator import enrich_top_insights as enrich_top_insights_job
from app.schemas.records import (
    BunkerPriceRecord,
    FreightIndexRecord,
    TradeFlowRecord,
    VesselPositionRecord,
)
from app.tasks.celery_app import celery_app


@celery_app.task(name="collect_ais_snapshot")
def collect_ais_snapshot() -> int:
    return _run_collector(AISStreamCollector())


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
def collect_all() -> dict[str, int]:
    return {
        "ais": collect_ais_snapshot(),
        "fred": collect_fred(),
        "openmeteo": collect_openmeteo(),
        "bunker": scrape_bunker(),
        "fbx": scrape_fbx(),
        "wci": scrape_wci(),
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
        explain_recent_high_anomalies(db)
        return created


@celery_app.task(name="generate_forecast")
def generate_forecast() -> int:
    with SessionLocal() as db:
        created = generate_forecasts(db)
        comment_recent_forecasts(db)
        return created


@celery_app.task(name="generate_insights")
def generate_insights() -> int:
    with SessionLocal() as db:
        return generate_insights_job(db)


@celery_app.task(name="enrich_top_insights")
def enrich_top_insights() -> int:
    with SessionLocal() as db:
        return enrich_top_insights_job(db)


def _run_collector(collector: BaseCollector[Any]) -> int:
    with SessionLocal() as db:
        records = collector.run(db=db, persist=_persist_records)
        return len(records)


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
    db.commit()
