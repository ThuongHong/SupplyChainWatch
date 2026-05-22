## 1. Data Model and Settings

- [x] 1.1 Add settings for historical backfill window, minimum story history days, minimum forecast history days, anomaly thresholds, and forecast horizon.
- [x] 1.2 Add Alembic migration for coverage summary, daily risk feature snapshots, and structured risk story events.
- [x] 1.3 Add SQLAlchemy models and Pydantic schemas for new derived coverage, feature, and story records.
- [x] 1.4 Add indexes for entity/date queries on new derived tables and verify migration upgrade path.

## 2. Historical Backfill and Coverage

- [x] 2.1 Extend PortWatch collector/backfill path to accept monitored entity filters and configurable date windows.
- [x] 2.2 Keep PortWatch historical ingestion idempotent for overlapping date windows and aggregated source collisions.
- [x] 2.3 Add coverage computation job that records first timestamp, latest timestamp, row count, expected days, missing days, freshness, and last collection status per entity/source.
- [x] 2.4 Add tests for PortWatch historical backfill, duplicate reruns, source gaps, and coverage metadata.

## 3. Feature Snapshot Pipeline

- [x] 3.1 Implement daily entity feature builder from PortWatch metrics, risk scores, freight/weather rows, AIS-derived context where available, and missing-source flags.
- [x] 3.2 Compute rolling baselines, rolling standard deviation, deltas, percent changes, z-scores, and driver metadata.
- [x] 3.3 Add task orchestration so successful source collection/backfill can refresh coverage and daily feature snapshots.
- [x] 3.4 Add tests for baseline math, missing feature flags, stale source flags, and deterministic snapshot regeneration.

## 4. Risk Story Events

- [x] 4.1 Implement structured event detector for worsening risk, recovery, anomaly spikes, and driver changes from feature snapshots.
- [x] 4.2 Generate deterministic narratives from structured events with entity importance, driver movements, baseline comparison, confidence, and recommended attention level.
- [x] 4.3 Link risk story events to existing anomalies/insights where useful without requiring LLM enrichment.
- [x] 4.4 Add tests for event threshold crossing, recovery detection, no-event-with-coverage behavior, and deterministic narrative output.

## 5. Forecast Readiness

- [x] 5.1 Implement data sufficiency checks for minimum history days, gap rate, and source freshness before forecast generation.
- [x] 5.2 Implement baseline short-horizon risk forecast from daily feature snapshots with train window, model metadata, validation metrics, and confidence.
- [x] 5.3 Persist forecast outputs in existing or new entity-risk forecast storage with feature schema metadata.
- [x] 5.4 Add tests for sufficient-history forecasts, insufficient-history status, confidence downgrades, and forecast traceability.

## 6. Backend API

- [x] 6.1 Add coverage API for monitored entity/source data depth and freshness.
- [x] 6.2 Add entity history API for risk trends, feature snapshots, and source gap metadata.
- [x] 6.3 Add risk story timeline API with filtering by entity, date range, severity, and event type.
- [x] 6.4 Add entity risk forecast API with predicted path, drivers, confidence, train window, and unavailable reasons.
- [x] 6.5 Add API tests for success, empty, insufficient-history, and stale-source responses.

## 7. Frontend Storytelling

- [x] 7.1 Add API clients and TypeScript types for coverage, history, story timeline, and risk forecast responses.
- [x] 7.2 Update Dashboard and Ports views to show trend, event timeline, anomaly driver, and forecast context from live backend rows only.
- [x] 7.3 Add insufficient-history and source-gap states with specific coverage details, not demo fallback.
- [x] 7.4 Add frontend tests for live rows, no-event-with-coverage, insufficient-history, and forecast-unavailable UI states.

## 8. Docs and Verification

- [x] 8.1 Document historical backfill commands, minimum data-depth expectations, and source-specific limits.
- [x] 8.2 Document storytelling and forecast confidence semantics for report/demo use.
- [x] 8.3 Run backend tests, targeted frontend tests, lint/format checks, and migration upgrade verification.
- [x] 8.4 Run Docker Compose smoke test: backfill PortWatch history, refresh features, generate story events, generate forecast, and load Dashboard/Ports API responses.
