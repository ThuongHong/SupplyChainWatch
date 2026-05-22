## 1. Configuration And Data-State Foundation

- [x] 1.1 Add explicit backend demo fallback setting with default disabled and update `.env.example`.
- [x] 1.2 Add explicit frontend demo fallback setting with default disabled and typed access through existing frontend env patterns.
- [x] 1.3 Add or centralize frontend data-state helpers for live, loading, empty, stale, disabled, demo, and error states.
- [x] 1.4 Update docs to explain real mode versus explicit demo mode.

## 2. Frontend Real-Data Default

- [x] 2.1 Remove implicit Dashboard mock fallback for port risk ranking, macro values, chart data, insights, and summary metrics in normal mode.
- [x] 2.2 Keep Dashboard demo fallback available only when explicit demo mode is enabled and visibly labeled.
- [x] 2.3 Update Ports page fallback behavior to render empty states in normal mode and demo rows only in explicit demo mode.
- [x] 2.4 Update Macro Indices page to show empty/unavailable states when `freight_indices` rows are absent.
- [x] 2.5 Update Insights Hub to show no-live-insights state instead of local demo feed unless demo mode is enabled.
- [x] 2.6 Update Vessel Map status copy to distinguish live watchlist AIS, empty AIS, source error, and disabled key states.
- [x] 2.7 Add or update frontend tests for normal-mode empty responses and explicit demo-mode fallback.

## 3. Backend Collector Orchestration

- [x] 3.1 Change `collect_portwatch` to avoid demo fallback unless backend demo mode is enabled.
- [x] 3.2 After successful PortWatch persistence, run or enqueue maritime risk scoring and disruption propagation.
- [x] 3.3 Refresh risk-derived vessel watchlist rules after maritime risk scoring creates current high-risk rows.
- [x] 3.4 Generate deterministic risk insights after successful risk scoring so `insights` can populate without LLM.
- [x] 3.5 Refactor `collect_all` to return per-source status, row count, and error while continuing independent collectors after failures.
- [x] 3.6 Add backend tests for PortWatch-to-risk chaining and partial `collect_all` failure behavior.

## 4. Live Source Readiness

- [x] 4.1 Add CA certificate runtime dependency to the backend Docker image and rebuild worker/backend images.
- [x] 4.2 Verify AISStream websocket collection uses normal TLS verification and logs certificate failures without disabling verification.
- [x] 4.3 Update FRED configured series so names used by UI/analysis, including BDI where available, can populate `freight_indices`.
- [x] 4.4 Ensure Open-Meteo collector can be run independently and persists weather rows without API keys.
- [x] 4.5 Add a documented/manual FBX and WCI backfill path with source/provenance metadata when scraping cannot produce rows.
- [x] 4.6 Add backend tests for FRED series mapping, Open-Meteo row validation, and manual FBX/WCI backfill parsing if implemented.

## 5. Source Status And Documentation

- [x] 5.1 Expose or document source readiness from `collection_log` and latest table timestamps for user-facing sources.
- [x] 5.2 Update `docs/data_sources.md` with required keys, no-key sources, optional keys, TLS troubleshooting, and backfill paths.
- [x] 5.3 Update architecture/demo docs to state frontend no longer uses implicit mock fallback in normal mode.
- [x] 5.4 Add verification queries or commands for `portwatch_metrics`, `port_risk_scores`, `chokepoint_risk_scores`, `vessel_positions`, `freight_indices`, `anomalies`, and `insights`.

## 6. Verification

- [x] 6.1 Run backend tests covering collectors, task orchestration, and risk/insight generation in the configured conda or Docker environment.
- [x] 6.2 Run frontend lint/build/tests with the existing Node package manager.
- [x] 6.3 Run Docker Compose smoke test for PortWatch collection through derived risk and Dashboard API response.
- [x] 6.4 Verify normal mode shows empty states for empty tables and explicit demo mode shows labeled demo fallback.
