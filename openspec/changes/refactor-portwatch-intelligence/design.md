## Context

GlobalSupplyWatch already has collectors for AISStream, Open-Meteo Marine, FRED, FBX, WCI, bunker prices, and optional UN Comtrade. It also has early port congestion, chokepoint status, anomaly, forecast, insight, and LLM narration modules. Current product emphasis still favors vessel-position collection and map display, while user value comes from port congestion, chokepoint stress, regional slowdown, economic pressure, and operational explanations.

This change makes PortWatch the central intelligence layer and narrows AISStream to selective realtime support. It must stay free-tier friendly, avoid broad realtime scraping, cache external responses, and keep existing project constraints: Pydantic validation before inserts, UTC timestamps, Alembic schema changes, collection logging, and polite scraping.

## Goals / Non-Goals

**Goals:**

- Make port and chokepoint risk the primary backend and frontend workflow.
- Ingest and normalize IMF PortWatch metrics for target ports, regions, and chokepoints.
- Use AISStream only for watchlist vessels and anomaly-triggered operational context.
- Correlate PortWatch, AIS, weather, freight indices, fuel proxies, and optional trade flows into risk scores and explanations.
- Add cache-first enrichment for VesselFinder, CargoFetch, or MarineTraffic metadata only when a vessel is high-value or abnormal.
- Preserve demo resilience through mocked or seeded fallback records when external keys are absent.

**Non-Goals:**

- No global live AIS tracking.
- No continuous scraping of enrichment providers.
- No paid-data dependency as mandatory path.
- No full replacement of existing FRED, FBX, WCI, Open-Meteo, or insight modules when refactor can adapt them.
- No production-grade route optimization engine in this change.

## Decisions

1. PortWatch becomes source of truth for port/chokepoint traffic and trade disruption baselines.

   Rationale: PortWatch and PortStraitWatch expose daily port and chokepoint traffic/trade signals, giving higher information density than raw AIS positions. Congestion is a derived risk concept, strengthened by selective AIS queue/speed/ETA evidence and weather context. Alternative considered: infer everything from AIS positions. Rejected because global AIS volume is costly, noisy, and weak for free-tier demo constraints.

2. Store normalized PortWatch observations separately from derived risk scores.

   Rationale: Raw metrics must remain auditable while risk scoring can evolve. Add tables such as `portwatch_metrics`, `port_risk_scores`, and `chokepoint_risk_scores` rather than overloading existing `port_congestion` and `chokepoint_status`. Alternative considered: add JSON blobs to existing tables. Rejected because query and chart behavior needs stable typed fields.

3. AISStream uses rule-based watchlist selection.

   Rationale: Realtime vessel data should explain active disruptions, not create its own massive workload. Watchlist membership comes from high-risk ports, disrupted chokepoints, major routes, abnormal speed/ETA drift, and manually pinned demo vessels. Alternative considered: sample all available vessels. Rejected because sample quality is unpredictable and not insight-driven.

4. Enrichment runs through queued, cached jobs.

   Rationale: VesselFinder, CargoFetch, and MarineTraffic must be optional, selective, and rate-limited. Store normalized enrichment snapshots with source, fetched timestamp, TTL, and confidence. Alternative considered: enrich inline in API requests. Rejected because it creates slow, brittle UI paths and scraping pressure.

5. Risk insights use deterministic scoring first, LLM narration second.

   Rationale: Scores and reasons must be testable. LLM output should summarize and explain already-computed facts, with schema validation and fallback template text. Alternative considered: ask LLM to infer risk from raw records. Rejected because it reduces reproducibility and makes tests weak.

6. Frontend starts on PortWatch dashboard.

   Rationale: Main screen should answer "where is maritime risk increasing and why?" rather than "where are ships?" Keep vessel map as drilldown for selected ports, chokepoints, and watchlist vessels. Alternative considered: keep current dashboard and add PortWatch widgets. Rejected because main product philosophy changes.

7. PortWatch collection uses isolated ArcGIS FeatureServer adapters.

   Rationale: Public PortWatch/PortStraitWatch data is exposed through feature services with pagination and field-name drift risk. Keep endpoint details out of scoring/API code and verify port/chokepoint alias mapping during implementation.

## Risks / Trade-offs

- PortWatch FeatureServer format or availability changes -> keep collector adapter isolated, cache last good response, and seed demo snapshots.
- PortWatch coverage differs from app port identifiers -> maintain alias mapping for LOCODE, PortWatch region IDs, and known chokepoint names.
- Derived risk score could appear arbitrary -> persist component scores and reasons so UI can explain confidence.
- Selective AIS could miss useful vessels -> allow manual watchlist pins and rule-tuned expansion near high-risk ports.
- Enrichment providers may block or rate-limit -> keep enrichment optional, cached, and disabled by default until configured.
- LLM narratives could overstate certainty -> require confidence, reasons, source metrics, and deterministic fallback text.

## Migration Plan

1. Add Alembic migration for PortWatch metrics, risk scores, watchlist vessels, enrichment cache, and insight linkage.
2. Add PortWatch collector and schedule with cache/backoff/collection log behavior.
3. Refactor AIS collector tasks to use watchlist and region filters.
4. Add analysis jobs for risk scoring, anomaly detection, weather/economic correlation, and disruption propagation.
5. Add API schemas and routes for port risk, chokepoint stress, watchlist vessels, and disruption insights.
6. Replace frontend default dashboard with port-centric views while keeping vessel map as drilldown.
7. Add unit tests for collectors and scoring plus frontend tests for dashboard states.

Rollback: keep old vessel endpoints and tables during transition. If PortWatch ingestion fails, disable PortWatch schedule and serve existing port/chokepoint/AIS views plus cached last-good risk records.

## Open Questions

- Exact PortWatch/PortStraitWatch FeatureServer fields, pagination limits, and port IDs need confirmation during implementation.
- Enrichment provider priority should be chosen from available legal/free-tier access.
- Target port and chokepoint alias mapping needs final seed data review.
