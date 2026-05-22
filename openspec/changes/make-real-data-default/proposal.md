## Why

GlobalSupplyWatch currently mixes live rows with frontend mock/demo fallback, so empty source tables can look healthy and users cannot tell which parts are real. PortWatch-derived risk now has live data, but downstream jobs, AISStream, freight indices, and UI data states need to make real data the default and show explicit empty/error states when sources are missing.

## What Changes

- **BREAKING**: Disable implicit mock/demo fallback in the main user-facing frontend by default; empty API responses render empty states, not fabricated rows.
- Add explicit demo-mode controls for frontend and backend fallbacks so demo data is opt-in and visibly labeled.
- Chain PortWatch collection into maritime risk scoring, disruption propagation, watchlist refresh, and insight generation so derived live rows appear without manual task kicks.
- Make multi-source collection resilient to partial failure so one missing key or broken scraper does not stop other real collectors.
- Fix AISStream SSL certificate verification in the Docker/runtime environment without disabling TLS verification.
- Add a real freight-index population path for FRED, Open-Meteo, FBX, and WCI using live collectors where possible and documented/manual backfill where public pages are fragile.
- Add freshness/error metadata and operational runbooks so operators can see which sources are live, empty, disabled, stale, or failed.

## Capabilities

### New Capabilities

- `real-data-default`: Frontend and backend behavior that prefers live data, displays empty/error states when live rows are absent, and only uses demo fallback when explicit demo mode is enabled.
- `collector-orchestration`: Scheduled/manual collector behavior that isolates source failures, records per-source outcomes, and runs derived jobs after successful source collection.
- `live-source-readiness`: Runtime readiness for AISStream TLS, FRED/Open-Meteo/FBX/WCI population, and documented source-key/backfill requirements.

### Modified Capabilities

- None.

## Impact

- Frontend pages: Dashboard first, then Ports, Macro Indices, Insights Hub, and Vessel Map where implicit mock data masks empty APIs.
- Backend tasks: `collect_portwatch`, `collect_all`, `compute_maritime_risk`, `generate_insights`, AISStream collection, and source freshness reporting.
- Backend collectors: AISStream TLS/runtime dependencies, FRED index list/backfill behavior, Open-Meteo scheduling, FBX/WCI/manual backfill handling.
- Docker/runtime: backend image trust-store packages and any certificate-related environment docs.
- Documentation: data source setup, demo mode, real-data verification checklist, and recovery steps for failed collectors.
