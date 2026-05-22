# Data Sources

Real mode is the default. Empty source tables should surface as empty, disabled, stale, or error
states instead of implicit mock rows. Demo fallback is opt-in through
`BACKEND_DEMO_FALLBACK_ENABLED=false` and `VITE_ENABLE_DEMO_FALLBACK=false` defaults in
`.env.example`; set them to `true` only for labeled class demos.

## Readiness Matrix

| Source | Key | Runtime path | Notes |
| --- | --- | --- | --- |
| AISStream.io | Required: `AISSTREAM_API_KEY` | WebSocket snapshot collector | Uses normal TLS verification; backend image installs CA certificates. |
| FRED | Required: `FRED_API_KEY` | Daily collector | Populates `BDI` plus macro/fuel proxy series used by UI and analysis. |
| IMF PortWatch / PortStraitWatch | No key | Daily collector | Primary source for port and chokepoint risk derivation. |
| Open-Meteo Marine | No key | 6-hour collector | Populates route-point weather rows in `freight_indices`. |
| Freightos FBX | No key, public scrape | Daily scraper or manual CSV | Manual backfill is supported when public markup changes. |
| Drewry WCI | No key, public scrape | Weekly scraper or manual CSV | Manual backfill is supported when public markup changes. |
| UN Comtrade | Optional: `UN_COMTRADE_API_KEY` | Disabled unless opted in | Monthly trade-flow enrichment. |
| DashScope / LLM | Optional: `DASHSCOPE_API_KEY` | Narrative enrichment | Deterministic insights can run without this key. |

## AISStream.io

- Purpose: hourly vessel-position snapshots.
- Auth: `AISSTREAM_API_KEY`.
- Cadence: hourly at minute 5.
- Current role: selective realtime supplement. The collector subscribes to monitored risk boxes and persists only active watchlist vessels or risk-area matches; it is no longer a global vessel feed.
- Quirks: the public docs emphasize streaming WebSocket use; this project wraps the source as a batch snapshot collector so the rest of the pipeline can stay scheduled and auditable.
- TLS: keep certificate verification enabled. If Docker logs mention certificate verification, rebuild the backend/worker image so the `ca-certificates` package is present; do not use a permanent `ssl=False` bypass.
- Fallback: NOAA / MarineCadastre historical AIS sample, shifted to a current demo window only when demo mode is explicitly enabled.

## IMF PortWatch / PortStraitWatch

- Purpose: primary intelligence layer for daily port traffic, trade-flow change, chokepoint throughput, bottleneck stress, and regional slowdown signals.
- Auth: none expected for public FeatureServer access.
- Cadence: daily at 01:20 UTC; derived maritime risk scores run hourly.
- Config: `PORTWATCH_PORTS_URL` and `PORTWATCH_CHOKEPOINTS_URL`.
- Cache/fallback: risk API endpoints include cache headers and freshness metadata. Seed/demo PortWatch rows are only for explicit demo mode.
- Note: PortWatch is source data for traffic/trade disruption. Congestion is derived by the risk layer and correlated with selective AIS, weather, freight, and fuel context.

## FRED

- Purpose: Baltic Dry Index and macro/fuel proxy series.
- Auth: `FRED_API_KEY`.
- Cadence: daily at 02:00 UTC.
- Limit: 120 requests/minute.
- Default series: `BDI`, `DCOILBRENTEU`, `DTWEXBGS`, `INDPRO`, `CPIAUCSL`, `FEDFUNDS`, `DGS10`, `T10Y2Y`, `PAYEMS`, and `RSAFS`.
- Quirks: missing observations are returned as `"."`; collector skips them.

## UN Comtrade

- Purpose: monthly country-to-country trade flows.
- Auth: `UN_COMTRADE_API_KEY`.
- Cadence: disabled for this project unless the team later opts in.
- Limit: roughly 100 requests/hour on common free-tier access.
- Quirks: monthly periods are encoded as `YYYYMM`; collector converts them to first-of-month dates.

## Open-Meteo Marine

- Purpose: route-point wave-height and wind-wave indicators stored in `freight_indices`.
- Auth: none for non-commercial use.
- Cadence: every 6 hours.
- Current role: weather cause/context for slowdown, rerouting, and route impact scoring.
- Quirks: values are returned as parallel arrays under the `hourly` key.

## Ship & Bunker

- Purpose: bunker fuel prices for major ports.
- Method: polite scrape with a project user agent.
- Cadence: daily.
- Rule: at least 5 seconds between scraping requests.
- Fallback: manual CSV or Bunker Index API free tier if public HTML changes.

## Freightos FBX

- Purpose: container freight index.
- Method: polite scrape of public chart/widget data.
- Cadence: daily.
- Risk: high, because public chart markup can change.
- Fallback: manual CSV weekly update through `app.scripts.backfill_freight_indices`.

## Drewry WCI

- Purpose: World Container Index.
- Method: polite scrape of public weekly chart page.
- Cadence: weekly on Thursday.
- Fallback: manual CSV weekly update through `app.scripts.backfill_freight_indices`.

## Manual FBX/WCI Backfill

Use manual backfill when FBX or WCI public pages do not produce validated rows. CSV columns:

```csv
time,index_name,value,source,source_url,provenance,note,provider_release_date
2026-05-21,WCI_GLOBAL,2135.50,manual_drewry_wci,https://www.drewry.co.uk/,Drewry weekly public update,weekly close,2026-05-21
2026-05-21T00:00:00Z,FBX_GLOBAL,2510.45,manual_freightos_fbx,https://fbx.freightos.com/,Freightos public FBX page,manual class backfill,2026-05-21
```

Run inside the backend container or an activated backend environment:

```bash
python -m app.scripts.backfill_freight_indices /app/backfill/freight_indices.csv
```

Rows are validated as `FreightIndexRecord` and upserted into `freight_indices`. The table `source`
column should identify the manual lane, while `metadata` stores `ingest_method=manual_csv`,
`provenance`, `source_url`, CSV row number, and optional notes.

## Source Readiness Checks

Latest collector status:

```sql
SELECT DISTINCT ON (source)
       source, status, rows_collected, started_at, finished_at, error
FROM collection_log
ORDER BY source, started_at DESC;
```

Counts and freshness for user-facing tables:

```sql
SELECT 'portwatch_metrics' AS table_name, COUNT(*) AS rows, MAX(observed_at) AS latest FROM portwatch_metrics
UNION ALL
SELECT 'port_risk_scores', COUNT(*), MAX(time) FROM port_risk_scores
UNION ALL
SELECT 'chokepoint_risk_scores', COUNT(*), MAX(time) FROM chokepoint_risk_scores
UNION ALL
SELECT 'vessel_positions', COUNT(*), MAX(time) FROM vessel_positions
UNION ALL
SELECT 'freight_indices', COUNT(*), MAX(time) FROM freight_indices
UNION ALL
SELECT 'anomalies', COUNT(*), MAX(detected_at) FROM anomalies
UNION ALL
SELECT 'insights', COUNT(*), MAX(generated_at) FROM insights;
```

Docker Compose shortcut:

```bash
docker compose exec postgres psql -U globalsupplywatch -d globalsupplywatch -c "<paste SQL>"
```

## Selective vessel enrichment

- Purpose: owner/operator, IMO metadata, route history, port calls, schedules, and vessel type for high-value vessel context.
- Sources: VesselFinder, CargoFetch, or MarineTraffic only when legal/configured access exists.
- Current role: disabled-provider-safe cache. Enrichment runs out of band for watchlist vessels and stores TTL snapshots in `vessel_enrichment_cache`; API calls never scrape inline.

## Week 1 Credential Checklist

- [ ] AISStream key registered.
- [ ] FRED key registered.
- [ ] Open-Meteo and PortWatch confirmed no-key.
- [ ] UN Comtrade key registered only if optional trade-flow collection is enabled.
- [ ] DashScope key registered only if optional LLM enrichment is enabled.
- [ ] `.env` created locally from `.env.example`.
