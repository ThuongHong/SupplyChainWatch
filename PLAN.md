# GlobalSupplyWatch — Detailed Project Plan

> **Course Project:** Data Monitoring & Analytics Application
> **Topic:** Global Shipping & Supply Chain Monitoring Platform
> **Timeline:** 4 weeks (28 days)
> **Team size:** 4-6 people
> **Deployment:** Local + Docker Compose

---

## 0. Confirmed Decisions

| Decision | Choice | Implication |
|----------|--------|-------------|
| Vessel tracking | Hourly batch update | No WebSocket needed; use Celery Beat scheduler, FE polls every 60s |
| Forecast model | Prophet baseline | 1 developer can finish in 2-3 days, no GPU required |
| Deployment | Local + Docker Compose | No CORS, env vars, scaling, or SSL concerns |

→ Result: ~5-6 days saved, reallocated to **Insight Hub** and **report quality**.

---

## 1. Product Goals (per rubric)

| Criterion | Weight | How to secure points |
|-----------|--------|----------------------|
| Data pipeline & quality | 20% | Multi-source (5+ APIs), Celery scheduled, retry/error handling, Pydantic validation, audit log |
| EDA & analysis | 20% | Complete EDA notebook, 6+ analysis types, correlation, lagged correlation, seasonality |
| Dashboard & visualization | 20% | 4 modules, dark mode, interactive map, time filters, drill-down |
| **Insight & interpretation** ⭐ | **30%** | 6+ insights verified with real data, auto-generated narratives, forecasts with MAPE, tagged + explained anomalies |
| Presentation & report | 10% | Academic-quality PDF report, polished slides, 5-7 minute demo video |

---

## 2. Simplified Architecture

```
┌─────────────────────────────────────────────────────┐
│         React Frontend (Vite + TS)                  │
│  Macro │ Vessel Map │ Port Congestion │ Insights    │
└───────────────────┬─────────────────────────────────┘
                    │ REST polling (60s)
┌───────────────────┴─────────────────────────────────┐
│              FastAPI Backend                        │
│  REST endpoints  │  Analysis services               │
└───────────────────┬─────────────────────────────────┘
                    │
       ┌────────────┼────────────┐
       │            │            │
┌──────┴───┐  ┌─────┴────┐  ┌────┴──────────┐
│PostgreSQL│  │  Redis   │  │ Celery Beat   │
│+Timescale│  │ (cache)  │  │ + Workers     │
│+PostGIS  │  │          │  │ (hourly jobs) │
└──────────┘  └──────────┘  └───┬───────────┘
                                │
        ┌───────────────────────┼───────────────────────┐
        │           │           │           │           │
   ┌────┴───┐  ┌────┴────┐ ┌────┴────┐ ┌────┴────┐ ┌───┴────┐
   │AISStream│ │  FRED   │ │UN Com-  │ │Open-    │ │Scrape: │
   │ (HTTP   │ │ (BDI,   │ │trade    │ │Meteo    │ │FBX,WCI,│
   │ poll)   │ │ rates)  │ │ (trade) │ │(weather)│ │bunker  │
   └─────────┘ └─────────┘ └─────────┘ └─────────┘ └────────┘
```

**Finalized stack:**

Backend:
- Python 3.11, FastAPI, SQLAlchemy 2.0, Pydantic v2
- Celery + Redis (queue & cache)
- PostgreSQL 15 + TimescaleDB + PostGIS
- statsmodels, Prophet, scikit-learn, pandas

Frontend:
- Vite + React 18 + TypeScript
- TanStack Query (polling, cache)
- Zustand (light state)
- Recharts (charts)
- MapLibre GL + deck.gl (map, vessel layer)
- shadcn/ui + Tailwind CSS
- date-fns

DevOps:
- Docker Compose (postgres, redis, backend, worker, beat, frontend)
- Makefile for common commands
- pre-commit hooks (ruff, black, mypy, eslint)

---

## 3. Specific Data Sources

| Source | Data | Method | Frequency | Free tier limits |
|--------|------|--------|-----------|------------------|
| **AISStream.io** | Vessel positions, MMSI, type, speed | HTTP collector (hourly snapshot) | Hourly | Free with registration, sufficient for hobby/academic use |
| **FRED API** | BDI, freight rate indices | REST API | Daily | 120 req/min |
| **UN Comtrade** | Trade flows between countries | REST API | Weekly | 100 req/hour |
| **Open-Meteo Marine** | Wave height, wind on routes | REST API | 6-hourly | Unlimited for non-commercial use |
| **Ship & Bunker** | Bunker fuel prices | Scrape (BeautifulSoup) | Daily | Public, polite scraping (1 req/5s) |
| **Freightos FBX** | Container freight index | Scrape public widget | Daily | Public chart |
| **Drewry WCI** | World Container Index | Scrape weekly chart | Weekly | Public chart |
| **World Bank** | LPI, trade indicators | REST API | One-time + monthly | Unlimited |
| **MarineCadastre / NOAA** | Historical AIS (backfill) | Bulk CSV download | One-time | Free |

**Backup plan** if any source fails:
- AISStream down → use historical sample from NOAA + simulate "now" with offset
- FBX/WCI scrape fails → manual CSV update (frame as "weekly update")
- Bunker → fallback to Bunker Index API (free tier)

---

## 4. Detailed Database Schema

### Hypertables (TimescaleDB)

```sql
-- Vessel positions (high volume, hourly snapshot)
CREATE TABLE vessel_positions (
    time TIMESTAMPTZ NOT NULL,
    mmsi BIGINT NOT NULL,
    lat DOUBLE PRECISION NOT NULL,
    lon DOUBLE PRECISION NOT NULL,
    sog REAL,                    -- speed over ground (knots)
    cog REAL,                    -- course over ground (degrees)
    nav_status INT,
    geom GEOGRAPHY(POINT, 4326) GENERATED ALWAYS AS
        (ST_SetSRID(ST_MakePoint(lon, lat), 4326)::GEOGRAPHY) STORED
);
SELECT create_hypertable('vessel_positions', 'time', chunk_time_interval => INTERVAL '1 day');
CREATE INDEX idx_vp_geom ON vessel_positions USING GIST (geom);
CREATE INDEX idx_vp_mmsi_time ON vessel_positions (mmsi, time DESC);
-- Compress after 7 days to save disk space
ALTER TABLE vessel_positions SET (
    timescaledb.compress,
    timescaledb.compress_segmentby = 'mmsi'
);
SELECT add_compression_policy('vessel_positions', INTERVAL '7 days');

-- Freight indices
CREATE TABLE freight_indices (
    time TIMESTAMPTZ NOT NULL,
    index_name TEXT NOT NULL,    -- 'BDI', 'FBX_GLOBAL', 'FBX_CHINA_US_WEST', 'WCI_GLOBAL', 'SCFI'
    value DOUBLE PRECISION NOT NULL,
    source TEXT NOT NULL,
    metadata JSONB
);
SELECT create_hypertable('freight_indices', 'time');
CREATE INDEX idx_fi_name_time ON freight_indices (index_name, time DESC);

-- Bunker prices
CREATE TABLE bunker_prices (
    time TIMESTAMPTZ NOT NULL,
    port_code TEXT NOT NULL,     -- 'SGP', 'RTM', 'HOU', 'FUJ'
    fuel_type TEXT NOT NULL,     -- 'VLSFO', 'MGO', 'HSFO'
    price_usd_per_ton DOUBLE PRECISION NOT NULL
);
SELECT create_hypertable('bunker_prices', 'time');

-- Port congestion (computed hourly)
CREATE TABLE port_congestion (
    time TIMESTAMPTZ NOT NULL,
    port_id INT NOT NULL,
    anchored_count INT NOT NULL,
    moored_count INT NOT NULL,
    underway_count INT NOT NULL,
    total_in_area INT NOT NULL,
    avg_dwell_hours REAL,
    median_speed REAL
);
SELECT create_hypertable('port_congestion', 'time');

-- Trade flows from UN Comtrade
CREATE TABLE trade_flows (
    time DATE NOT NULL,           -- monthly granularity
    reporter_code TEXT,
    partner_code TEXT,
    commodity_code TEXT,
    flow TEXT,                    -- 'export', 'import'
    value_usd DOUBLE PRECISION,
    weight_kg DOUBLE PRECISION
);
```

### Reference tables

```sql
CREATE TABLE vessels (
    mmsi BIGINT PRIMARY KEY,
    imo BIGINT,
    name TEXT,
    type INT,                     -- AIS ship type code (70-79 = cargo, 80-89 = tanker)
    type_label TEXT,
    flag TEXT,
    dwt INT,
    length REAL,
    width REAL,
    last_seen TIMESTAMPTZ
);

CREATE TABLE ports (
    id SERIAL PRIMARY KEY,
    locode TEXT UNIQUE,           -- UN/LOCODE e.g. 'CNSHA'
    name TEXT NOT NULL,
    country TEXT NOT NULL,
    region TEXT,
    geom GEOGRAPHY(POINT, 4326) NOT NULL,
    radius_km REAL DEFAULT 20,
    twenty_ft_eq_units_year BIGINT  -- annual TEU throughput, for ranking
);

CREATE TABLE chokepoints (
    id SERIAL PRIMARY KEY,
    name TEXT NOT NULL,           -- 'Suez Canal', 'Panama Canal', 'Strait of Hormuz', 'Malacca', 'Bab-el-Mandeb'
    geom GEOGRAPHY(POLYGON, 4326) NOT NULL
);
```

### Analytics tables

```sql
CREATE TABLE anomalies (
    id SERIAL PRIMARY KEY,
    detected_at TIMESTAMPTZ DEFAULT NOW(),
    entity_type TEXT NOT NULL,   -- 'index', 'port', 'chokepoint'
    entity_id TEXT NOT NULL,
    severity TEXT NOT NULL,      -- 'low', 'medium', 'high'
    metric TEXT,
    observed DOUBLE PRECISION,
    expected DOUBLE PRECISION,
    z_score DOUBLE PRECISION,
    description TEXT,
    acknowledged BOOLEAN DEFAULT FALSE
);

CREATE TABLE forecasts (
    id SERIAL PRIMARY KEY,
    created_at TIMESTAMPTZ DEFAULT NOW(),
    index_name TEXT NOT NULL,
    horizon_days INT NOT NULL,
    predictions JSONB NOT NULL,  -- [{ds, yhat, yhat_lower, yhat_upper}]
    metrics JSONB NOT NULL,      -- {mape, rmse, mae, last_actual}
    model_name TEXT,
    model_params JSONB
);

CREATE TABLE insights (
    id SERIAL PRIMARY KEY,
    generated_at TIMESTAMPTZ DEFAULT NOW(),
    category TEXT,               -- 'correlation', 'trend', 'anomaly', 'forecast'
    title TEXT NOT NULL,
    narrative TEXT NOT NULL,
    metrics JSONB,
    priority INT DEFAULT 0
);

CREATE TABLE collection_log (
    id SERIAL PRIMARY KEY,
    started_at TIMESTAMPTZ DEFAULT NOW(),
    finished_at TIMESTAMPTZ,
    source TEXT NOT NULL,
    rows_collected INT,
    status TEXT,                 -- 'success', 'partial', 'failed'
    error TEXT
);
```

---

## 5. Backend Modules

### 5.1 Project structure

```
backend/
├── app/
│   ├── main.py                 # FastAPI app entry
│   ├── config.py               # Settings (pydantic-settings)
│   ├── db/
│   │   ├── session.py
│   │   ├── models.py           # SQLAlchemy models
│   │   └── migrations/         # Alembic
│   ├── schemas/                # Pydantic response models
│   ├── api/
│   │   ├── routes/
│   │   │   ├── indices.py
│   │   │   ├── vessels.py
│   │   │   ├── ports.py
│   │   │   ├── chokepoints.py
│   │   │   ├── insights.py
│   │   │   └── health.py
│   │   └── deps.py
│   ├── collectors/             # Data collection logic
│   │   ├── base.py             # Base collector + retry logic
│   │   ├── aisstream.py
│   │   ├── fred.py
│   │   ├── comtrade.py
│   │   ├── openmeteo.py
│   │   ├── bunker_scraper.py
│   │   ├── fbx_scraper.py
│   │   └── wci_scraper.py
│   ├── analysis/               # ML & analytics
│   │   ├── port_congestion.py
│   │   ├── anomaly.py          # IsolationForest + z-score
│   │   ├── forecast.py         # Prophet
│   │   ├── correlation.py
│   │   └── insight_generator.py
│   ├── tasks/                  # Celery tasks
│   │   ├── celery_app.py
│   │   ├── schedule.py         # Beat schedule
│   │   └── jobs.py
│   └── utils/
├── tests/
├── notebooks/                  # EDA notebooks
├── alembic.ini
├── pyproject.toml
└── Dockerfile
```

### 5.2 REST API endpoints

```
GET  /api/health                                 # Health check
GET  /api/indices                                # List available indices
GET  /api/indices/{name}?from=&to=               # Historical data
GET  /api/indices/{name}/forecast                # Latest forecast
GET  /api/vessels/snapshot?bbox=&type=           # Latest hourly snapshot in bbox
GET  /api/vessels/{mmsi}                         # Vessel detail + recent track
GET  /api/ports                                  # All ports list
GET  /api/ports/congestion                       # Current congestion all ports
GET  /api/ports/{id}/timeline?days=30            # Port congestion history
GET  /api/chokepoints                            # All chokepoints + current state
GET  /api/chokepoints/{id}/timeline?days=30
GET  /api/anomalies?days=30&severity=            # Recent anomalies
GET  /api/insights/latest?limit=10               # Auto-generated insights
GET  /api/correlations?indices=BDI,FBX&days=180  # Correlation matrix
GET  /api/stats/overview                         # Top-level metrics for header
```

### 5.3 Celery job schedule

```python
# tasks/schedule.py
beat_schedule = {
    'ais-snapshot-hourly': {
        'task': 'collect_ais_snapshot',
        'schedule': crontab(minute=5),  # every hour at :05
    },
    'fred-indices-daily': {
        'task': 'collect_fred',
        'schedule': crontab(hour=2, minute=0),
    },
    'fbx-scrape-daily': {
        'task': 'scrape_fbx',
        'schedule': crontab(hour=3, minute=0),
    },
    'wci-scrape-weekly': {
        'task': 'scrape_wci',
        'schedule': crontab(day_of_week=4, hour=4, minute=0),  # Thursday
    },
    'bunker-scrape-daily': {
        'task': 'scrape_bunker',
        'schedule': crontab(hour=5, minute=0),
    },
    'comtrade-weekly': {
        'task': 'collect_comtrade',
        'schedule': crontab(day_of_week=0, hour=6, minute=0),
    },
    'compute-port-congestion-hourly': {
        'task': 'compute_port_congestion',
        'schedule': crontab(minute=15),  # 10 minutes after AIS snapshot
    },
    'compute-chokepoint-status-hourly': {
        'task': 'compute_chokepoint_status',
        'schedule': crontab(minute=20),
    },
    'detect-anomalies-hourly': {
        'task': 'detect_anomalies',
        'schedule': crontab(minute=30),
    },
    'generate-forecast-daily': {
        'task': 'generate_forecast',
        'schedule': crontab(hour=7, minute=0),
    },
    'generate-insights-hourly': {
        'task': 'generate_insights',
        'schedule': crontab(minute=45),
    },
}
```

### 5.4 Analysis modules

**Port congestion calculator:**
```python
# For each port, count vessels within radius_km at the latest snapshot.
# Classify by nav_status:
#   - anchored: nav_status IN (1, 5, 6) OR sog < 0.5 knots
#   - moored: nav_status = 5
#   - underway: sog > 3 knots
# Compute median speed, estimate dwell time from historical positions
```

**Anomaly detection:**
```python
# For each index/port metric:
# 1. Rolling z-score (30-day window) — flag |z| > 2.5
# 2. IsolationForest on multivariate data (contamination=0.05)
# 3. Compare current vs same period last year (% change)
# Severity: low (|z| 2.5-3), medium (3-4), high (>4)
```

**Forecast (Prophet):**
```python
# For each major index (BDI, FBX_GLOBAL, WCI_GLOBAL):
# 1. Train Prophet with weekly + yearly seasonality
# 2. Predict 14 days
# 3. Backtest: hold out last 14 days, compute MAPE
# 4. Store predictions + metrics in forecasts table
# Retrain daily
```

**Insight generator (template-based):**
```python
# Example templates:
# - "{index_name} rose {pct}% over {period}, highest in {ranking} years"
# - "Congestion at {port_name} is currently at {level}, {pct}% above baseline"
# - "{index_a} and {index_b} have correlation {value} (lag {days} days)"
# - "Vessel traffic through {chokepoint} dropped {pct}% vs 30-day average"
# - "Forecast: {index_name} expected to reach {value} in {days} days (MAPE {mape}%)"
# Generate 10 new insights hourly, rank by priority
```

---

## 6. Frontend Modules

### 6.1 Project structure

```
frontend/
├── src/
│   ├── App.tsx
│   ├── main.tsx
│   ├── pages/
│   │   ├── Dashboard.tsx       # Overview
│   │   ├── Macro.tsx
│   │   ├── VesselMap.tsx
│   │   ├── Ports.tsx
│   │   └── Insights.tsx
│   ├── components/
│   │   ├── layout/
│   │   │   ├── Sidebar.tsx
│   │   │   └── Header.tsx
│   │   ├── charts/
│   │   │   ├── TimeSeriesChart.tsx
│   │   │   ├── CorrelationHeatmap.tsx
│   │   │   ├── ForecastChart.tsx
│   │   │   └── AnomalyTimeline.tsx
│   │   ├── map/
│   │   │   ├── VesselMap.tsx
│   │   │   ├── VesselLayer.tsx  # deck.gl ScatterplotLayer
│   │   │   ├── HeatmapLayer.tsx
│   │   │   └── PortMarkers.tsx
│   │   ├── cards/
│   │   │   ├── KPICard.tsx
│   │   │   ├── PortCard.tsx
│   │   │   ├── InsightCard.tsx
│   │   │   └── ChokepointCard.tsx
│   │   └── ui/                  # shadcn components
│   ├── hooks/
│   │   ├── useIndices.ts
│   │   ├── useVessels.ts
│   │   └── usePolling.ts
│   ├── api/
│   │   └── client.ts
│   ├── stores/
│   │   └── uiStore.ts
│   ├── types/
│   └── lib/
├── public/
├── index.html
├── vite.config.ts
├── tailwind.config.ts
└── Dockerfile
```

### 6.2 Four main pages

**Dashboard (Overview):**
- 4 KPI cards: today's BDI, today's FBX, active vessel count, # high-severity anomalies
- Mini 30-day chart for BDI + FBX
- Small map showing top 10 ports (color by congestion)
- Top 5 latest insights

**Macro:**
- Multi-line time series chart for indices
- Period selector (7d / 30d / 90d / 1y / all)
- Multi-select indices for comparison
- Forecast overlay (toggle)
- Anomaly markers
- Stats panel: current value, % change, volatility

**Vessel Map:**
- Full-screen MapLibre map
- Layer toggles: vessels (scatter), density heatmap, port markers, chokepoints
- Filter sidebar: vessel type, flag, speed range
- Click vessel → drawer with detail (MMSI, IMO, type, recent 7-day track)
- Stats: total vessels in view, breakdown by type

**Ports:**
- Grid of 20 port cards (each card: name, country, congestion level, sparkline, anomaly badge)
- Click card → detail page with 30-day timeline, vessel breakdown
- Filter by region

**Insights:**
- Insight feed (latest first, filter by category)
- Correlation heatmap (interactive)
- Forecast charts for 3 major indices
- Anomaly timeline (last 90 days)
- "Story" mode: pick 2 entities → auto-generated narrative about their relationship

---

## 7. Daily Roadmap

### Week 1 — Foundation & Data Pipeline (Day 1-7)

**Day 1 (Mon) — Kickoff & setup**
- [ ] Team meeting, assign roles
- [ ] Create GitHub repo, branch protection, PR template
- [ ] Set up monorepo: `backend/`, `frontend/`, `notebooks/`, `docs/`, `docker/`
- [ ] Docker compose skeleton: postgres+timescaledb+postgis image, redis, mailhog
- [ ] Register API keys: AISStream, FRED, UN Comtrade, World Bank
- [ ] Set up pre-commit, GitHub Actions (lint only)
- [ ] Create `.env.example`, README skeleton

**Day 2 — Data exploration**
- [ ] Notebook 01_explore_aisstream.ipynb: connect, test, understand schema
- [ ] Notebook 02_explore_fred.ipynb: list available freight series
- [ ] Notebook 03_explore_comtrade.ipynb: test trade query
- [ ] Notebook 04_explore_openmeteo.ipynb: marine endpoints
- [ ] Document API quirks, rate limits in `docs/data_sources.md`

**Day 3 — DB schema & migrations**
- [ ] Alembic setup, initial migration with full schema from section 4
- [ ] Seed scripts: 50 major ports (load from World Port Index CSV), 5 chokepoints
- [ ] Test schema with sample data
- [ ] DB connection pooling config

**Day 4-5 — Collectors**
- [ ] `collectors/base.py`: BaseCollector with retry, logging, audit log
- [ ] `collectors/aisstream.py`: hourly snapshot collector
- [ ] `collectors/fred.py`: FRED series fetcher (BDI, freight series)
- [ ] `collectors/openmeteo.py`: marine weather for 10 routes
- [ ] `collectors/bunker_scraper.py`: scrape ship&bunker for top 4 ports
- [ ] `collectors/fbx_scraper.py`: scrape Freightos chart
- [ ] Unit tests for parsers (mock HTTP responses)

**Day 6 — Celery setup**
- [ ] `tasks/celery_app.py`, beat schedule
- [ ] Test each task manually, verify data lands in DB
- [ ] Logging with structlog, JSON format
- [ ] Set up Flower (Celery monitoring)

**Day 7 — Buffer & data quality**
- [ ] Backfill: load 2 years of historical FRED data
- [ ] Backfill: AIS sample from NOAA for EDA
- [ ] Data validation: Great Expectations checks
- [ ] EDA notebook 05_initial_eda.ipynb: distribution, missing values, outliers
- [ ] **Internal demo:** show collected data, validate with team

**Milestone 1 (end of week 1):**
- ✅ DB has 7+ days of real data
- ✅ All collectors running on schedule
- ✅ Initial EDA notebook complete

---

### Week 2 — Backend API & Analysis (Day 8-14)

**Day 8-9 — REST API foundation**
- [ ] FastAPI app structure, middleware (CORS, gzip, error handler)
- [ ] Pydantic response schemas
- [ ] Endpoints: `/health`, `/indices`, `/indices/{name}`, `/vessels/snapshot`
- [ ] Redis caching layer (60s TTL for heavy queries)
- [ ] Pagination utility
- [ ] OpenAPI docs customization

**Day 10 — More endpoints**
- [ ] `/ports`, `/ports/congestion`, `/ports/{id}/timeline`
- [ ] `/chokepoints`, `/vessels/{mmsi}`
- [ ] Query optimization: explain analyze, add indexes if needed
- [ ] Postman/Bruno collection for FE team to use

**Day 11 — Port congestion analysis**
- [ ] `analysis/port_congestion.py`: spatial query
- [ ] Celery task `compute_port_congestion` running hourly
- [ ] Test with real data, verify against publicly visible MarineTraffic counts
- [ ] Calibrate radius_km for each port

**Day 12 — Anomaly detection**
- [ ] `analysis/anomaly.py`: rolling z-score + IsolationForest
- [ ] Tune parameters: window size, threshold
- [ ] Backtest on historical data: use known events (Suez 2021, COVID surge) as validation
- [ ] Severity scoring

**Day 13 — Forecast**
- [ ] `analysis/forecast.py`: Prophet wrapper
- [ ] Train for 3 indices: BDI, FBX_GLOBAL, WCI_GLOBAL
- [ ] Walk-forward backtesting, compute MAPE
- [ ] Store forecasts with metrics

**Day 14 — Correlation & insights**
- [ ] `analysis/correlation.py`: Pearson + lagged correlation matrix
- [ ] `analysis/insight_generator.py`: 8-10 templates
- [ ] Test generating 50 insights from current DB state
- [ ] **Milestone 2:** API complete, Postman demo runs end-to-end

---

### Week 3 — Frontend Dashboard (Day 15-21)

Day 15 — FE foundation + Design system integration
  - Setup Vite + React + TS + Tailwind + shadcn/ui
  - PORT design tokens từ Claude Design output:
      * Colors (CSS vars, dark + light)
      * Typography scale
      * Spacing system
      * tailwind.config.ts customization
  - Build & test base primitives: Button, Card, Badge, Input, Tooltip
  - Layout shell: Sidebar + Header per Claude Design
  - Routing, API client, TanStack Query
  - Dark/light theme toggle

Day 16-17 — Macro page (with design reference in hand)
  - Implement page layout per Claude Design
  - TimeSeriesChart with custom Recharts theme matching design
  - Period selector, multi-select, forecast overlay
  - Wire to API
  - Loading states + empty states (using design system)

Day 18-19 — Vessel Map page (most custom work)
  - MapLibre style customization theo Claude Design ocean/land colors
  - deck.gl ScatterplotLayer với color scheme từ design palette
  - Vessel detail drawer per Claude Design
  - Filter sidebar
  - Performance optimization

Day 20 — Ports page
  - PortCard component
  - Grid + filters
  - Detail page

Day 21 — Dashboard overview + polish pass
  - KPI cards
  - Mini charts
  - Insight feed preview
  - First polish pass: verify everything matches Claude Design language
  - Buffer time để fix inconsistencies

---

### Week 4 — Insights Hub, Polish, Deliverables (Day 22-28)

**Day 22-23 — Insights Hub** ⭐
- [ ] Insights feed page with card list
- [ ] CorrelationHeatmap component (D3 or Plotly)
- [ ] ForecastChart with confidence interval (Recharts area)
- [ ] AnomalyTimeline component
- [ ] "Story mode": pick 2 entities → narrative
- [ ] Polish copy of auto-generated insights

**Day 24 — Polish & UX**
- [ ] Loading skeletons everywhere
- [ ] Toast notifications for data updates
- [ ] Tooltip explanations for jargon (BDI, FBX, anchored, ...)
- [ ] Onboarding tour (first dashboard visit)
- [ ] Performance: bundle analyze, lazy load map page
- [ ] Bug bash session with the full team

**Day 25 — Final integration & data quality**
- [ ] Run pipelines for 24h continuously, verify no errors
- [ ] Add fallback UI when data is stale > 6h
- [ ] Final EDA notebook with all insights for the report
- [ ] Generate 6+ deep insights, manually verified

**Day 26 — Documentation**
- [ ] Full README: setup, architecture, API docs
- [ ] `docs/architecture.md` with diagrams (Excalidraw)
- [ ] `docs/data_dictionary.md`
- [ ] `docs/insights.md`: 6 key insights with evidence
- [ ] Code comments

**Day 27 — Report & slides**
- [ ] Report PDF (XeLaTeX) per the assignment template:
  - Problem statement
  - Data pipeline diagram + description
  - EDA findings
  - Key insights (focus)
  - Conclusion + future work
  - Appendix: API docs, schema
- [ ] Slide presentation (15-20 slides):
  - Problem & motivation
  - Architecture
  - Data sources
  - Key feature demo screenshots
  - Insights (5-6 slides, one chart per insight)
  - Demo
  - Conclusion

**Day 28 — Demo & submission**
- [ ] Record 5-7 minute demo video (OBS Studio):
  - Problem intro (30s)
  - Architecture overview (30s)
  - Walkthrough of 4 pages (3-4 min)
  - Key insights highlight (1-2 min)
  - Outro (30s)
- [ ] Final QA, package all deliverables
- [ ] Submit

---

## 8. Insights to Verify (for the report)

These are the 6 insights to focus effort on verifying in weeks 3-4:

### Insight 1: Chokepoint disruption ripple effect
**Hypothesis:** When vessel count through Suez drops > 20% over 7 days, FBX EU-Asia rises > 10% within 14-21 days.
**Method:** Lagged correlation, historical event study (Ever Given 2021 if data is covered).
**Output:** Scatter plot of lag vs correlation coefficient, narrative.

### Insight 2: Shanghai port lead-lag relationship
**Hypothesis:** Port congestion at Shanghai leads LA/Long Beach with a 10-14 day lag.
**Method:** Cross-correlation function.
**Output:** Cross-correlation chart, optimal lag.

### Insight 3: Bunker prices as leading indicator
**Hypothesis:** VLSFO price changes predict BDI changes with a 5-10 day lag.
**Method:** Granger causality test + lagged regression.
**Output:** Lag significance plot.

### Insight 4: Chokepoint risk score
**Method:** Composite score = z(vessel density) + z(median speed drop) + z(dwell time).
**Output:** Current risk score for 5 chokepoints, historical timeline, top 3 risk events of the last 90 days.

### Insight 5: Day-of-week seasonality
**Hypothesis:** Vessel arrival rates show a day-of-week pattern (drop on Sundays).
**Method:** Boxplot by DOW, ANOVA.
**Output:** Boxplot, % difference.

### Insight 6: Vessel type behavior divergence
**Hypothesis:** Container vs bulk carriers show different speed/route patterns and different responses to disruptions.
**Method:** Compare distributions, regime analysis.
**Output:** Side-by-side analysis.

Each insight in the report needs: **Question → Method → Finding → Business implication → Caveats**.

---

## 9. Team Roles (5-6 people)

| # | Role | Responsibilities | Week 1 | Week 2 | Week 3 | Week 4 |
|---|------|------------------|--------|--------|--------|--------|
| 1 | **Tech Lead / Backend** | Architecture, FastAPI, DB schema, API design | DB schema, collector base | All endpoints | API support for FE | Bug fixing, deployment |
| 2 | **Data Engineer** | Collectors, scraping, scheduling | All collectors, Celery | Backfill, data quality | Optimize | Monitor pipelines |
| 3 | **ML/Analytics** | Forecast, anomaly, insight generation | EDA notebooks | Anomaly, forecast, insight gen | Refine, generate insights | Verify insights, write report EDA section |
| 4 | **Frontend Lead** | React architecture, map, performance | Skeleton + research | Wireframes, component plan | Map page, Macro page | Insights Hub, polish |
| 5 | **Frontend Dev** | Charts, UI, polish | Tailwind/shadcn setup | UI component library | Ports page, Dashboard | Polish, responsive, video |
| 6 | **PM / Report** | Coordination, slides, report | Repo setup, docs | Manage tasks, demo prep | Coordinate, draft report | Finalize report, slides, demo |

**If 4 people:** merge Tech Lead + Data Eng; ML + PM.
**If 5 people:** PM/Report separate, with one FE doubling up.

---

## 10. Communication & Process

- **Daily standup** 15 min (Discord/Slack, async is fine)
- **Weekly demo** Saturday: present milestone with the full team + sponsor (instructor if possible)
- **GitHub Projects** kanban: Backlog → In Progress → Review → Done
- **PR review**: at least 1 approval, tests pass
- **Commit convention**: Conventional Commits (feat:, fix:, docs:, ...)
- **Branches**: main (protected) ← develop ← feature/*

---

## 11. Risks & Mitigations

| Risk | Likelihood | Impact | Mitigation |
|------|-----------|--------|-----------|
| AISStream API down/rate limited | Medium | High | Cache snapshots, fallback NOAA historical, gracefully degrade UI |
| Scraping broken by site update | High | Medium | Robust selectors, manual CSV fallback, monitor logs |
| Team member dropping out | Medium | High | Documentation, pair programming, weekly knowledge sharing |
| Forecast MAPE too high | Medium | Low | Honest reporting, frame as "directional", show naive baseline |
| Map performance lag with 10k+ vessels | High | Medium | deck.gl GPU rendering, viewport filter, clustering |
| DB slowdown as data accumulates | Medium | Medium | TimescaleDB compression, materialized views for heavy queries |
| Scope creep | High | High | Strict end-of-week checkpoints, separate "nice to have" list |
| Last-minute report writing | High | High | Start draft in week 3, EDA notebook already provides content |

---

## 12. Nice-to-have (only if time permits)

- [ ] Alert system: email/Telegram on high-severity anomalies
- [ ] Export data as CSV/JSON from the UI
- [ ] User accounts + saved views
- [ ] Mobile-first responsive for Vessel Map
- [ ] i18n (Vietnamese + English)
- [ ] CLI tool for DB querying
- [ ] Public REST API documentation site (Stoplight/ReadMe)
- [ ] Full CI/CD with deploy previews

---

## 13. Deliverables Checklist (per assignment)

- [ ] **Report PDF**
  - [ ] Problem statement
  - [ ] Data pipeline diagram & description
  - [ ] EDA (statistics, distributions, missing data analysis)
  - [ ] Insights (6+ with evidence)
  - [ ] Conclusion
  - [ ] Appendix: API schema, data dictionary

- [ ] **Source code**
  - [ ] Backend (collectors, API, analysis)
  - [ ] Frontend
  - [ ] EDA notebooks
  - [ ] Docker Compose
  - [ ] README + setup docs

- [ ] **Slide presentation** (15-20 slides)

- [ ] **Demo video** (5-7 minutes)

---

## 14. Quick start commands (Makefile)

```makefile
.PHONY: up down logs shell-be shell-fe migrate seed test

up:
	docker compose up -d

down:
	docker compose down

logs:
	docker compose logs -f

shell-be:
	docker compose exec backend bash

shell-fe:
	docker compose exec frontend sh

migrate:
	docker compose exec backend alembic upgrade head

seed:
	docker compose exec backend python -m app.scripts.seed_ports

test:
	docker compose exec backend pytest

collect-all:
	docker compose exec backend celery -A app.tasks.celery_app call collect_all

forecast:
	docker compose exec backend celery -A app.tasks.celery_app call generate_forecast
```

---

## 15. References

- AISStream.io docs: https://aisstream.io/documentation
- FRED API: https://fred.stlouisfed.org/docs/api/fred/
- UN Comtrade: https://comtradeapi.un.org/
- Open-Meteo Marine: https://open-meteo.com/en/docs/marine-weather-api
- TimescaleDB: https://docs.timescale.com/
- deck.gl: https://deck.gl/docs
- Prophet: https://facebook.github.io/prophet/
- World Port Index: https://msi.nga.mil/Publications/WPI

---

*Last updated: Day 1 kickoff*
