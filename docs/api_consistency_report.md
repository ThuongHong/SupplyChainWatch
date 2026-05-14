# Frontend / Backend API Consistency

## Summary

The backend API paths exposed in `backend/app/api/routes` and the frontend API client in
`frontend/src/api/client.ts` now agree on paths, query parameters, and TypeScript response
types.

## Endpoint Coverage

| Frontend client method | Backend endpoint | Status |
| --- | --- | --- |
| `health()` | `GET /api/health` | Matched |
| `indices()` | `GET /api/indices` | Matched |
| `indexHistory(name, params)` | `GET /api/indices/{name}` | Matched |
| `indexForecast(name)` | `GET /api/indices/{name}/forecast` | Matched |
| `vesselSnapshot(params)` | `GET /api/vessels/snapshot` | Matched |
| `vesselDetail(mmsi)` | `GET /api/vessels/{mmsi}` | Matched |
| `ports(region?)` | `GET /api/ports` | Matched |
| `portCongestion()` | `GET /api/ports/congestion` | Matched |
| `portTimeline(portId, days)` | `GET /api/ports/{id}/timeline` | Matched |
| `chokepoints()` | `GET /api/chokepoints` | Matched |
| `chokepointTimeline(id, days)` | `GET /api/chokepoints/{id}/timeline` | Matched |
| `anomalies(params)` | `GET /api/anomalies` | Matched |
| `latestInsights(limit)` | `GET /api/insights/latest` | Matched |
| `correlations(indices, days)` | `GET /api/correlations` | Matched |
| `overviewStats()` | `GET /api/stats/overview` | Matched |

## Remaining Integration Gaps

- The current pages still render mostly from local mock/generated data. The API client is ready,
  but pages need a wiring pass with loading, empty, error, and stale-data states.
- The Macro page displays `SCFI`, but the backend collectors currently produce `BDI`,
  `FBX_GLOBAL`, `WCI_GLOBAL`, weather route indicators, and FRED proxy series. Either add an
  SCFI source on the backend or remove/hide SCFI until data exists.
- The Vessel Map page expects enriched fields such as destination, ETA, string vessel type,
  and DWT in the main map dataset. The backend snapshot endpoint currently returns AIS fields
  plus optional vessel metadata: `mmsi`, `lat`, `lon`, `sog`, `cog`, `nav_status`, `name`,
  numeric `type`, `type_label`, and `flag`.
- The Ports page expects congestion level, anomaly flag, wait time, sparkline, and vessel-type
  breakdown. Backend responses provide reference ports, current congestion counts, and timelines;
  those view-model fields need to be derived in the frontend or exposed via a richer backend
  endpoint.
- The Insights page expects feed rows shaped as `text`, `category`, and relative `time`.
  Backend insights are `title`, `narrative`, `category`, `generated_at`, `metrics`, and
  `priority`; the frontend should map these into display rows.
- Dashboard KPI labels are compatible with backend `overviewStats`, but trend sparklines and
  market snapshot rows still need to be assembled from `/indices`, `/ports/congestion`,
  `/anomalies`, and `/insights/latest`.
