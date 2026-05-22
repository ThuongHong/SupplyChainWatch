# GlobalSupplyWatch Architecture

## Overview

GlobalSupplyWatch is a local Docker Compose application for monitoring global shipping and supply-chain conditions. The system combines scheduled data collection, time-series storage, spatial analysis, anomaly detection, forecasts, and AI-assisted insight narratives.

The main workflow is PortWatch-first: IMF PortWatch/PortStraitWatch traffic and trade metrics feed derived port/chokepoint risk scores. AISStream is a selective operational layer for watchlist vessels and monitored risk boxes, not a global vessel feed. Open-Meteo, FRED, FBX, WCI, and bunker prices provide context for explanations and route pressure.

```text
External data sources
  PortWatch/PortStraitWatch, selective AISStream, FRED, Open-Meteo, Ship&Bunker, FBX, WCI
        |
        v
Celery beat schedules collectors and analysis jobs
        |
        v
FastAPI backend + Celery workers
        |
        +--> PostgreSQL 15 + TimescaleDB + PostGIS
        +--> Redis cache / Celery broker
        +--> DashScope Qwen LLM enrichment
        |
        v
React dashboard
  PortWatch Dashboard, Macro Indices, Vessel Drilldown, Ports, Insights Hub
```

## Runtime Containers

| Service | Purpose |
| --- | --- |
| `postgres` | TimescaleDB/PostGIS database for time-series and spatial data. |
| `redis` | API cache, Celery broker, and result backend. |
| `backend` | FastAPI REST API. |
| `worker` | Celery worker for collectors, analysis jobs, and LLM enrichment. |
| `beat` | Celery beat schedule runner. |
| `flower` | Celery monitoring UI. |

## Data Flow

1. Collectors validate source records with Pydantic schemas.
2. Validated records are persisted to TimescaleDB/PostGIS tables.
3. Analysis jobs compute derived port risk, chokepoint stress, propagation, anomalies, forecasts, correlations, and template insights.
4. The LLM enrichment layer calls DashScope through the OpenAI-compatible API.
5. Safety guards reject generated text that contains unauthorized numbers.
6. FastAPI exposes typed JSON endpoints for the frontend.
7. The frontend renders live data when available and explicit empty/error states when rows are absent. Mock/demo fallback is opt-in and visibly labeled.

## Main Tables

| Table | Role |
| --- | --- |
| `portwatch_metrics` | Normalized PortWatch/PortStraitWatch source observations. |
| `port_risk_scores` | Derived port risk scores with components and freshness metadata. |
| `chokepoint_risk_scores` | Derived chokepoint and regional stress scores. |
| `vessel_watchlist` | Active selective AIS monitoring set. |
| `vessel_enrichment_cache` | TTL vessel enrichment snapshots and disabled-provider state. |
| `disruption_propagation` | Downstream impact links from stressed chokepoints to ports/lanes. |
| `vessel_positions` | AIS vessel positions, indexed spatially and filtered by watchlist/risk area. |
| `freight_indices` | BDI/FBX/WCI/FRED-style index values. |
| `port_congestion` | Computed vessel counts around ports. |
| `chokepoint_status` | Computed vessel count and risk score per chokepoint. |
| `anomalies` | Rolling z-score anomaly records plus optional LLM explanation. |
| `forecasts` | Forecast horizon, metrics, and optional LLM commentary. |
| `insights` | Template narratives plus optional LLM narrative enrichment. |
| `llm_usage_log` | Model, token, latency, status, and error logging for cost monitoring. |

## API Surface

The frontend uses the following groups:

- Health: `/api/health`
- Indices and forecasts: `/api/indices`, `/api/indices/{name}`, `/api/indices/{name}/forecast`
- Vessels: `/api/vessels/snapshot`, `/api/vessels/{mmsi}`
- Ports: `/api/ports`, `/api/ports/congestion`, `/api/ports/{id}/timeline`
- Chokepoints: `/api/chokepoints`, `/api/chokepoints/{id}/timeline`
- Maritime risk: `/api/risk/ports`, `/api/risk/chokepoints`, `/api/risk/heatmap`, `/api/risk/propagation`, `/api/risk/freshness`, `/api/risk/watchlist`
- Insights: `/api/anomalies`, `/api/insights/latest`, `/api/correlations`
- Story Mode: `POST /api/story/analyze`
- Overview: `/api/stats/overview`

## LLM Layer

The LLM layer is optional and controlled by `.env`:

- `DASHSCOPE_API_KEY`
- `LLM_ENABLED`
- `LLM_MODEL_FAST`
- `LLM_MODEL_FAST_FALLBACKS`
- `LLM_MODEL_REASONING`
- `LLM_MODEL_REASONING_FALLBACKS`

All LLM calls go through `app.llm.client.LLMClient`, which provides retry, token-limit model fallback, circuit breaking, timeout handling, and usage logging.

## Performance Notes

- Vessel queries use bounding boxes and spatial indexes.
- Heavy API responses are Redis-cacheable.
- The Vessel Map page is lazy-loaded in the frontend bundle.
- Map rendering uses level-of-detail assumptions suitable for thousands of points.

## Real Mode And Source Readiness

Real mode is the normal runtime path. Backend collectors should insert source rows only from live
collectors or documented manual backfill, and frontend pages should not substitute local mock rows
unless demo mode is explicitly enabled. Source readiness is diagnosed from `collection_log` plus
latest timestamps in `portwatch_metrics`, `port_risk_scores`, `chokepoint_risk_scores`,
`vessel_positions`, `freight_indices`, `anomalies`, and `insights`.
