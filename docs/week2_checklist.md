# Week 2 Checklist

## Completed in Repository

- [x] FastAPI middleware: CORS, gzip, and generic JSON error envelope.
- [x] Pydantic response schemas for API payloads.
- [x] Endpoints:
  - [x] `GET /api/health`
  - [x] `GET /api/indices`
  - [x] `GET /api/indices/{name}`
  - [x] `GET /api/indices/{name}/forecast`
  - [x] `GET /api/vessels/snapshot`
  - [x] `GET /api/vessels/{mmsi}`
  - [x] `GET /api/ports`
  - [x] `GET /api/ports/congestion`
  - [x] `GET /api/ports/{id}/timeline`
  - [x] `GET /api/chokepoints`
  - [x] `GET /api/chokepoints/{id}/timeline`
  - [x] `GET /api/anomalies`
  - [x] `GET /api/insights/latest`
  - [x] `GET /api/correlations`
  - [x] `GET /api/stats/overview`
- [x] Redis cache helper with 60-second TTL for heavy reads.
- [x] Shared pagination utility.
- [x] Query indexes for week-two read paths.
- [x] PostGIS-backed port/chokepoint geometry migration.
- [x] Chokepoint status table and scheduled computation.
- [x] Port congestion spatial computation.
- [x] Rolling z-score anomaly detection.
- [x] Moving-average forecast baseline with Prophet-ready storage shape.
- [x] Pearson correlation matrix utility.
- [x] Template-based insight generator.
- [x] Collector task persistence into database tables.
- [x] Postman collection for frontend/demo use.
- [x] Minimal frontend API client stub.

## Requires Live Services / Data

- [ ] Run `make migrate` against Docker PostgreSQL.
- [ ] Run `make seed`.
- [ ] Add API keys to `.env`; UN Comtrade is intentionally disabled unless the team opts in.
- [ ] Trigger collectors and verify non-empty tables.
- [ ] Run `compute_port_congestion`, `detect_anomalies`, `generate_forecast`, and `generate_insights` against real data.
- [ ] Use `EXPLAIN ANALYZE` on the largest vessel snapshot query once the AIS table has realistic volume.
