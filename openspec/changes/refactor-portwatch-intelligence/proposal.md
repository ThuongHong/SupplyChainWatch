## Why

Current product centers on raw AIS vessel positions, which gives strong visual activity but weak operational intelligence. Port-centric risk intelligence better supports demo value and free-tier constraints by turning selected data sources into congestion, chokepoint, trade, weather, and economic risk signals.

## What Changes

- **BREAKING**: Reframe main dashboard from vessel map-first experience to PortWatch intelligence-first experience.
- Add IMF PortWatch as primary intelligence source for traffic and trade disruption signals, chokepoint throughput, maritime bottlenecks, and regional shipping slowdowns; derive congestion risk from PortWatch plus supporting AIS/weather context.
- Limit AISStream to selective realtime vessel monitoring for watchlist vessels, risky ports, disrupted regions, major routes, and anomalous behavior.
- Add weather risk correlation using Open-Meteo Marine wave, wind, and storm indicators.
- Keep FRED, Freightos FBX, and Drewry WCI as economic context for shipping pressure, freight volatility, and price spikes.
- Add selective enrichment pipeline for VesselFinder, CargoFetch, or MarineTraffic metadata only when watchlist or anomaly conditions justify lookup cost.
- Add AI insight layer that converts raw signals into congestion alerts, disruption summaries, ETA drift reasoning, route risk explanations, chokepoint stress analysis, and anomaly narratives.
- Update frontend navigation, dashboard cards, maps, and charts around port risk, congestion heatmaps, traffic trend anomalies, chokepoint stress, and disruption propagation.

## Capabilities

### New Capabilities

- `portwatch-intelligence`: IMF PortWatch/PortStraitWatch ingestion, normalization, storage, scheduling, and primary port/chokepoint traffic/trade disruption metrics.
- `selective-vessel-monitoring`: AISStream watchlist and anomaly-triggered tracking instead of broad global vessel collection.
- `maritime-risk-insights`: Multi-source risk scoring and AI-generated operational insight narratives across ports, chokepoints, vessels, weather, and economic context.
- `port-centric-dashboard`: Frontend and API behavior for global port risk, congestion heatmaps, traffic anomalies, chokepoint stress, and disruption propagation views.

### Modified Capabilities

- None.

## Impact

- Backend collectors: add PortWatch collector; refactor AIS collection scope; keep Open-Meteo, FRED, FBX, WCI, and bunker fuel collectors as supporting inputs.
- Backend database: add port risk, PortWatch metric, chokepoint stress, vessel watchlist, enrichment cache, and generated risk insight models through Alembic migrations.
- Backend analysis: add risk scoring, congestion anomaly detection, disruption propagation, weather correlation, ETA drift, and insight generation paths.
- Backend API: expose port risk, chokepoint stress, watchlist vessels, disruption timelines, economic context, and AI insight endpoints.
- Frontend: replace vessel-centric dashboard emphasis with PortWatch pages, port/chokepoint risk map, congestion heatmaps, stress timelines, and insight feed.
- Operations: cache aggressively, use rate-limit-aware collectors, avoid massive realtime scraping, and log all collector runs to `collection_log`.
