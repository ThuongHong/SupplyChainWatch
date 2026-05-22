## Context

GlobalSupplyWatch has moved to a PortWatch-first architecture, but the runtime still behaves like a demo-first product in several places. The backend can insert demo PortWatch rows when collection fails, the dashboard can render local mock rows when APIs return empty arrays, and derived risk jobs are scheduled separately instead of being triggered by successful PortWatch collection. This makes sparse live data hard to diagnose: real `portwatch_metrics` can exist while `port_risk_scores`, `vessel_positions`, `freight_indices`, `anomalies`, or `insights` remain empty and the frontend still looks populated.

The project must stay local-first, Docker Compose friendly, and free-tier friendly. External collectors must validate records before insert, log collection runs, respect rate limits, avoid unsafe scraping, store UTC timestamps, and keep demo data available only when deliberately enabled for presentation.

## Goals / Non-Goals

**Goals:**

- Make real data the default product behavior across the backend and frontend.
- Replace implicit mock fallback with explicit empty, stale, disabled, and error states.
- Keep demo fallback available behind explicit configuration for class demos.
- Ensure successful PortWatch collection automatically produces derived risk rows and insight candidates.
- Let one collector fail without blocking other collectors in a batch run.
- Fix AISStream TLS verification through runtime trust-store configuration rather than disabling certificate verification.
- Provide a practical path to populate freight/weather indices through live collectors and documented/manual backfill.

**Non-Goals:**

- No paid source requirement.
- No global AIS feed; AIS remains selective around watchlists and monitored risk areas.
- No unsafe TLS bypass such as permanent `verify=False` or `ssl=False`.
- No large new data model unless needed for source run status or manual backfill provenance.
- No production-grade ETL platform; Celery tasks remain the orchestration layer.

## Decisions

1. Real mode is default; demo mode is explicit.

   Add frontend and backend configuration that defaults to real/empty behavior. Frontend components must render API rows when present and render empty states when absent. Backend collectors must avoid demo inserts unless explicit demo fallback is enabled. Alternative considered: keep existing fallback but improve labels. Rejected because fabricated data still masks source-table emptiness and weakens verification.

2. Data state is first-class UI behavior.

   Pages should distinguish `loading`, `live`, `empty`, `stale`, `disabled`, `demo`, and `error` states. Dashboard gets the first pass because it currently mixes live risk rows with mock indices and insight feed. Other pages follow the same helper pattern. Alternative considered: remove every demo snippet immediately. Rejected because explicit demo mode is still useful for course presentation.

3. PortWatch success chains into derived jobs.

   `collect_portwatch` should run or enqueue maritime risk scoring after successful persistence, then refresh propagation, watchlist rules, and deterministic insights. This keeps source and derived tables in sync for the user-facing dashboard. Alternative considered: rely only on hourly beat. Rejected because collection and derived jobs can be out of phase, causing empty UI after fresh source ingestion.

4. Batch collection returns per-source outcomes.

   `collect_all` should isolate collector failures and return rows/status/error per source. Missing `FRED_API_KEY`, broken FBX HTML, or AISStream TLS errors must not prevent PortWatch or Open-Meteo from running. Alternative considered: keep fail-fast and inspect logs. Rejected because one missing optional key can block unrelated real data.

5. AISStream TLS is fixed at runtime trust-store level.

   The backend Docker image should include CA certificates, and the websocket client should keep normal certificate verification. A local debug bypass can exist only if clearly named and disabled by default. Alternative considered: set `ssl=False`. Rejected because it weakens security and hides environment problems.

6. Freight indices need live and backfill lanes.

   FRED should include required index/proxy names used by the UI and analysis, including BDI where available. Open-Meteo should be runnable without credentials. FBX/WCI scrapers should either parse confirmed public markup with tests or accept manual CSV backfill with source metadata. Alternative considered: rely on dashboard mock values. Rejected because macro views and insights need real `freight_indices` rows.

7. Source readiness is documented and testable.

   Docs should list required keys, no-key sources, optional LLM/enrichment keys, manual backfill commands, and verification queries for `portwatch_metrics`, `port_risk_scores`, `vessel_positions`, `freight_indices`, `anomalies`, and `insights`. Alternative considered: leave setup scattered in architecture docs. Rejected because operators need a single recovery path.

## Risks / Trade-offs

- Empty UI looks less impressive during first run -> explicit demo mode remains available for presentations.
- Chained jobs can increase collection latency -> run synchronously only for local task calls or enqueue Celery chain where worker context exists.
- Public FBX/WCI markup may change -> document manual CSV backfill as supported path and preserve scraper tests around known fixtures.
- AISStream can still fail due to bad key, network, or upstream issues -> collection log and UI readiness states must show source-specific failure.
- More source states increase frontend branching -> centralize data-state helpers instead of duplicating page-specific logic.
- Backfill rows can be mistaken for scraped live rows -> persist `source` and metadata fields that identify manual/backfill provenance.

## Migration Plan

1. Add explicit demo-mode configuration defaults to backend, frontend, `.env.example`, and docs.
2. Convert Dashboard mock fallbacks to empty states except when demo mode is enabled.
3. Chain PortWatch collection to maritime risk scoring, disruption propagation, watchlist refresh, and insight generation.
4. Make `collect_all` report per-source status and continue after optional collector failures.
5. Fix backend image certificate trust-store and verify AISStream TLS behavior.
6. Populate freight indices through FRED/Open-Meteo live collectors and FBX/WCI scraper or manual backfill.
7. Extend the same real/empty/demo data-state behavior to Ports, Macro Indices, Insights Hub, and Vessel Map.
8. Update docs and run verification commands against DB counts and API responses.

Rollback: enable explicit demo mode to restore presentation-friendly fallback while leaving real-data collection fixes in place. If chained jobs cause operational issues, disable chaining and keep beat schedules while investigating.

## Open Questions

- Should demo mode be one global flag, or separate frontend/backend flags so operators can show demo UI while backend remains strict?
- Should manual FBX/WCI backfill be CSV-only, or also support direct admin task arguments?
- Should source run status be derived only from `collection_log`, or should API expose a summarized readiness endpoint?
