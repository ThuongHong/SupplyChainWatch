from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Protocol

from sqlalchemy.orm import Session

from app.config import get_settings
from app.db.models import VesselEnrichmentCache

DEFAULT_ENRICHMENT_SOURCE = "disabled_provider"


class EnrichmentProvider(Protocol):
    source: str

    def fetch(self, mmsi: int) -> dict[str, object]:
        """Fetch normalized vessel enrichment data."""


def get_cached_enrichment(
    db: Session,
    *,
    mmsi: int,
    source: str = DEFAULT_ENRICHMENT_SOURCE,
) -> VesselEnrichmentCache | None:
    now = datetime.now(UTC)
    return (
        db.query(VesselEnrichmentCache)
        .filter(
            VesselEnrichmentCache.mmsi == mmsi,
            VesselEnrichmentCache.source == source,
            VesselEnrichmentCache.expires_at > now,
        )
        .order_by(VesselEnrichmentCache.expires_at.desc())
        .one_or_none()
    )


def enrich_watchlist_vessel(
    db: Session,
    *,
    mmsi: int,
    source: str = DEFAULT_ENRICHMENT_SOURCE,
    ttl_hours: int = 168,
    provider: EnrichmentProvider | None = None,
) -> VesselEnrichmentCache:
    source = provider.source if provider is not None else source
    cached = get_cached_enrichment(db, mmsi=mmsi, source=source)
    if cached is not None:
        return cached

    now = datetime.now(UTC)
    settings = get_settings()
    if not settings.enrichment_provider_enabled or provider is None:
        snapshot = VesselEnrichmentCache(
            mmsi=mmsi,
            source=source,
            fetched_at=now,
            expires_at=now + timedelta(hours=ttl_hours),
            status="provider_disabled",
            confidence=None,
            data=None,
            error="No enrichment provider configured.",
        )
        db.merge(snapshot)
        db.commit()
        return snapshot

    snapshot = VesselEnrichmentCache(
        mmsi=mmsi,
        source=provider.source,
        fetched_at=now,
        expires_at=now + timedelta(hours=ttl_hours),
        status="success",
        confidence=None,
        data=provider.fetch(mmsi),
        error=None,
    )
    db.merge(snapshot)
    db.commit()
    return snapshot
