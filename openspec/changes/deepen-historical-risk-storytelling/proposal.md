## Why

Live PortWatch rows and current risk scores now exist, but current dashboard answers mostly "what is risky now." To support useful data storytelling, alert review, and prediction, system needs enough historical depth to explain "what changed," "why it matters," and "what may happen next."

## What Changes

- Add historical depth requirements for monitored ports and chokepoints, including configurable backfill windows, latest-source tracking, and gap visibility.
- Add baseline and anomaly detection over historical PortWatch, freight, weather, AIS, and derived risk signals.
- Add event/story generation that turns metric changes into explainable maritime risk narratives.
- Add prediction-ready feature snapshots for short-horizon port/chokepoint risk forecasting.
- Add frontend/API support for historical trend, anomaly, event timeline, and forecast context without demo fallback.
- No breaking API changes expected; new endpoints/fields should be additive.

## Capabilities

### New Capabilities
- `historical-risk-depth`: Historical source coverage, backfill windows, freshness, and gap reporting for prediction-ready maritime risk data.
- `risk-storytelling`: Event timeline and narrative explanation over historical changes, anomalies, and current risk context.
- `risk-forecasting-readiness`: Feature snapshots, forecast inputs, forecast outputs, and confidence metadata for short-horizon risk prediction.

### Modified Capabilities
- None.

## Impact

- Backend collectors/backfill:
  - PortWatch collector must support configurable historical backfill depth and idempotent re-runs.
  - Freight/weather/AIS collectors should expose enough history or explicit gaps for story and forecast use.
- Backend analysis:
  - Add rolling baselines, anomaly classification, event extraction, and feature snapshot generation.
  - Add short-horizon forecast storage or deterministic forecast scaffolding.
- Backend API:
  - Add endpoints or response fields for entity history, event timelines, anomaly drivers, forecast context, and data-depth metadata.
- Frontend:
  - Dashboard/Ports/Insights views show trend, event, anomaly, and forecast context from real rows only.
- Docs/tests:
  - Document data-depth requirements, backfill commands, minimum rows for storytelling, and no-key/key-required source behavior.
  - Add tests for backfill idempotence, baseline/anomaly correctness, story generation, and empty/gap states.
