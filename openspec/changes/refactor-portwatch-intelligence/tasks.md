## 1. Data Model And Seed Data

- [x] 1.1 Add Alembic migration for `portwatch_metrics`, `port_risk_scores`, `chokepoint_risk_scores`, `vessel_watchlist`, `vessel_enrichment_cache`, and disruption propagation records.
- [x] 1.2 Add SQLAlchemy models and Pydantic schemas for PortWatch metrics, risk scores, watchlist entries, enrichment snapshots, and structured risk insights.
- [x] 1.3 Extend seed data for target entities: Suez Canal, Panama Canal, Strait of Malacca, Red Sea, Black Sea, Singapore, Shanghai, Rotterdam, and Los Angeles.
- [x] 1.4 Add LOCODE, PortWatch entity, region, and chokepoint alias mapping fixtures.
- [x] 1.5 Verify PortWatch/PortStraitWatch FeatureServer IDs and aliases for Singapore, Shanghai, Rotterdam, Los Angeles/Long Beach, Suez Canal, Panama Canal, Strait of Malacca, Red Sea, and Black Sea.

## 2. PortWatch Collection

- [x] 2.1 Implement `PortWatchCollector` with isolated API adapter, response normalization, Pydantic validation, cache/backoff behavior, and collection logging.
- [x] 2.1a Implement PortWatch/PortStraitWatch ArcGIS FeatureServer query pagination and field contract tests.
- [x] 2.2 Add PortWatch collector task and Celery beat schedule with conservative cadence and last-good-data fallback.
- [x] 2.3 Add unit tests for successful collection, unavailable source fallback, malformed records, and collection log behavior.
- [x] 2.4 Document PortWatch source setup, cache behavior, and demo fallback in data source docs.

## 3. Selective AIS And Enrichment

- [x] 3.1 Add watchlist service for manual pins, high-risk port rules, disrupted chokepoint rules, route rules, anomaly rules, TTL, and priority.
- [x] 3.2 Refactor AISStream collection to persist only active watchlist vessels and active risk-area rule matches.
- [x] 3.3 Add anomaly checks for watched-vessel speed drops, route deviation, ETA drift, and proximity to congested ports.
- [x] 3.4 Add optional enrichment job with provider interface, TTL cache, disabled-provider behavior, and no inline API blocking.
- [x] 3.5 Add tests proving non-watchlist AIS positions are ignored and enrichment cache hits do not call external providers.

## 4. Risk Analysis And Insights

- [x] 4.1 Implement PortWatch-based port and chokepoint risk scoring with component values, missing-component metadata, and historical baselines.
- [x] 4.2 Add weather correlation logic for wave severity, wind conditions, storm risk, slowdown, rerouting, and route impact scoring.
- [x] 4.3 Add economic context logic for FRED, FBX, WCI, and bunker price movements in route and regional risk explanations.
- [x] 4.4 Add disruption propagation analysis linking stressed chokepoints to downstream ports, regions, and trade lanes.
- [x] 4.5 Refactor insight generation to output event type, confidence, reasons, affected entities, source metrics, and attention level with deterministic fallback text.
- [x] 4.6 Add unit tests for risk scoring, weather correlation, economic context, propagation, and LLM-unavailable fallback.

## 5. API Layer

- [x] 5.1 Add API routes for global port risk, monitored entity detail, congestion heatmap data, chokepoint stress, disruption propagation, and data freshness.
- [x] 5.2 Add API routes for vessel watchlist, watched-vessel positions, anomaly context, ETA drift, and enrichment snapshots.
- [x] 5.3 Add caching to read-heavy risk endpoints with freshness metadata in responses.
- [x] 5.4 Update API schemas and route tests for success, missing data, stale data, and provider-disabled states.

## 6. Frontend Experience

- [x] 6.1 Replace default dashboard focus with PortWatch intelligence summary, global risk ranking, congestion heatmap, traffic anomaly trends, chokepoint stress, and disruption propagation.
- [x] 6.2 Convert vessel map into drilldown for selected ports, chokepoints, watchlist vessels, route traces, ETA drift, and anomaly markers.
- [x] 6.3 Add UI data states for missing keys, stale external data, seeded fallback data, and source freshness.
- [x] 6.4 Update frontend API client, query hooks, and view models for new port-centric endpoints.
- [x] 6.5 Add frontend tests for dashboard default view, port selection, chokepoint detail, heatmap toggle, and watchlist drilldown.

## 7. Verification And Documentation

- [x] 7.1 Run backend collector, analysis, API, and migration tests in the configured conda or Docker environment.
- [x] 7.2 Run frontend lint/build/tests with the existing package manager.
- [x] 7.3 Update `docs/data_sources.md`, `README` or project docs, and demo notes to explain PortWatch-first architecture and AIS selective supplement behavior.
- [x] 7.4 Verify `openspec status --change refactor-portwatch-intelligence` reports apply-ready after artifacts and required checks are complete.
