## Context

Current system can ingest real PortWatch/PortStraitWatch data and compute current port/chokepoint risk rows. Dashboard can show "which entity is risky now," but story and prediction need deeper temporal context: baselines, deltas, anomalies, gaps, and confidence.

Existing tables already cover raw PortWatch metrics, derived risk scores, freight/weather index rows, AIS vessel positions, anomalies, forecasts, and insights. This change should reuse those tables where practical, adding small derived tables only where current schema cannot express entity-level history coverage, event timelines, or prediction feature snapshots.

## Goals / Non-Goals

**Goals:**
- Backfill enough historical observations for monitored ports/chokepoints to compute rolling baselines and trend deltas.
- Make data depth visible: row counts, latest timestamps, date ranges, and gaps per entity/source.
- Generate explainable risk stories from historical changes, not from static latest score only.
- Produce prediction-ready entity/day feature snapshots for short-horizon risk forecasts.
- Keep demo/mock fallback disabled by default; story and forecast views must show insufficient-data states when history is thin.

**Non-Goals:**
- Global AIS ingestion for every vessel.
- High-accuracy ML model as first implementation. A deterministic baseline forecast is acceptable if feature snapshots, metrics, and confidence are explicit.
- Paid data-source integration beyond existing configured sources and documented manual backfill paths.
- Replacing current risk score logic; this change adds historical context and forecast scaffolding around it.

## Decisions

1. Store raw source observations first, then derive daily entity features.
   - Rationale: raw PortWatch/freight/weather/AIS rows remain auditable and can be reprocessed when feature logic changes.
   - Alternative considered: store only precomputed story rows. Rejected because it loses detail needed for new baselines and future models.

2. Add explicit history coverage metadata.
   - Rationale: frontend and operators need to know whether missing story/forecast output means "no event" or "not enough data."
   - Alternative considered: infer coverage on each API request. Rejected because repeated aggregate scans over time-series tables will be slow and inconsistent across pages.

3. Use daily entity feature snapshots as the boundary between collectors and analytics.
   - Rationale: stories and forecasts need stable inputs: current value, rolling mean, rolling standard deviation, percent change, z-score, missing flags, source freshness, and driver metadata.
   - Alternative considered: each analysis job queries raw tables independently. Rejected because duplicate baseline logic causes divergent explanations.

4. Generate risk stories as structured event records before prose.
   - Rationale: UI needs filterable timelines and drilldowns; prose can be deterministic or LLM-enriched later.
   - Alternative considered: generate only narrative insights. Rejected because narratives are hard to test, sort, and compare.

5. Start forecasting with transparent baseline models.
   - Rationale: course project needs reliable, explainable prediction signals. Moving average, trend extrapolation, or simple regression can ship before Prophet/advanced ML.
   - Alternative considered: add Prophet immediately. Rejected until historical depth and feature snapshots are proven.

6. Gate story and forecast generation by data sufficiency.
   - Rationale: thin history makes fake precision. Requirements should require `insufficient_history` states and confidence metadata.
   - Alternative considered: always generate output from latest values. Rejected because user explicitly wants past data for prediction/story.

## Risks / Trade-offs

- PortWatch date depth varies by entity/source -> collector must record coverage and gaps, and API must expose insufficient-history status.
- Backfills can create duplicate rows -> persistence must stay idempotent through primary keys/upserts/merge.
- Historical queries can become slow -> add indexes and precomputed daily feature snapshots before UI uses long trend windows.
- Forecasts may look authoritative despite weak data -> include model name, train window, validation metrics, confidence, and data sufficiency flags.
- Manual freight backfill can contain bad values -> validate schema, source metadata, timestamp order, and duplicate handling before insert.
- Story generation can overstate causality -> use language and fields that separate observed correlation, likely driver, and confidence.

## Migration Plan

1. Add migrations for any new derived tables:
   - `data_coverage` or equivalent source/entity coverage summary.
   - `risk_feature_snapshots` or equivalent daily entity features.
   - `risk_story_events` or equivalent structured event timeline.
2. Backfill PortWatch history for monitored entities using idempotent collector runs.
3. Build/update daily feature snapshots from stored raw rows.
4. Generate anomalies and story events from feature snapshots.
5. Generate baseline forecasts only where minimum history exists.
6. Expose APIs and frontend states.
7. Rollback strategy: keep raw source rows; drop only new derived tables/endpoints if needed. Existing current-risk flow should keep working.

## Open Questions

- Minimum viable history depth: propose 90 days for stories, 180 days preferred for forecasting, but PortWatch availability should decide actual default.
- Forecast horizon: propose 7 and 14 days for port/chokepoint risk.
- Story severity thresholds: propose z-score and percent-change thresholds configurable in settings.
- Whether `forecasts` table should be generalized beyond `index_name` or a new entity-risk forecast table should be created.
