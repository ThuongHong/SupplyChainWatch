# Data Sources

## AISStream.io

- Purpose: hourly vessel-position snapshots.
- Auth: `AISSTREAM_API_KEY`.
- Cadence: hourly at minute 5.
- Quirks: the public docs emphasize streaming WebSocket use; this project wraps the source as a batch snapshot collector so the rest of the pipeline can stay scheduled and auditable.
- Fallback: NOAA / MarineCadastre historical AIS sample, shifted to a current demo window.

## FRED

- Purpose: Baltic Dry Index and macro/fuel proxy series.
- Auth: `FRED_API_KEY`.
- Cadence: daily at 02:00 UTC.
- Limit: 120 requests/minute.
- Quirks: missing observations are returned as `"."`; collector skips them.

## UN Comtrade

- Purpose: monthly country-to-country trade flows.
- Auth: `UN_COMTRADE_API_KEY`.
- Cadence: disabled for this project unless the team later opts in.
- Limit: roughly 100 requests/hour on common free-tier access.
- Quirks: monthly periods are encoded as `YYYYMM`; collector converts them to first-of-month dates.

## Open-Meteo Marine

- Purpose: route-point wave-height and wind-wave indicators.
- Auth: none for non-commercial use.
- Cadence: every 6 hours.
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
- Fallback: manual CSV weekly update.

## Drewry WCI

- Purpose: World Container Index.
- Method: polite scrape of public weekly chart page.
- Cadence: weekly on Thursday.
- Fallback: manual CSV weekly update.

## Week 1 Credential Checklist

- [ ] AISStream key registered.
- [ ] FRED key registered.
- [ ] UN Comtrade key registered.
- [ ] World Bank key registered or confirmed unnecessary for week-one collection.
- [ ] `.env` created locally from `.env.example`.
