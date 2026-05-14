# AGENTS.md — GlobalSupplyWatch

> Project instructions for OpenAI Codex and other coding agents working in this repository.

Codex should read this file as the repository-level guidance before making changes. Keep changes small, explain assumptions, and prefer existing project patterns over introducing new architecture.

## Project context

GlobalSupplyWatch is a web app for monitoring global shipping supply chains. This is a 4-week course project for a team of 4-6 people, intended for local-only deployment with Docker Compose.

**Stack:**
- Backend: Python 3.11, FastAPI, SQLAlchemy 2.0, Pydantic v2, Celery + Redis, PostgreSQL 15 + TimescaleDB + PostGIS
- Frontend: Vite + React 18 + TypeScript, TanStack Query, Recharts, MapLibre GL + deck.gl, shadcn/ui + Tailwind
- ML: statsmodels, Prophet, scikit-learn

**Data sources:** AISStream.io hourly, FRED API, UN Comtrade, Open-Meteo Marine, and polite scraping for Freightos/Drewry/Ship&Bunker.

See `PLAN.md` for the detailed roadmap.

## Setup and dependency rules

### Python / Conda

Before installing any Python library or running backend Python tooling, Codex MUST create and activate a conda environment first.

Recommended environment:

```bash
conda create -n globalsupplywatch python=3.11 -y
conda activate globalsupplywatch
```

After the environment is active, install dependencies from the project files. Prefer lockfiles or existing dependency files if present.

Examples:

```bash
# If backend requirements exist
pip install -r backend/requirements.txt

# If pyproject.toml is used
pip install -e backend
```

Rules:
- Do not install Python packages globally.
- Do not use `sudo pip`.
- Do not change the Python version unless the user asks.
- If dependency files are missing, ask before inventing a new dependency layout unless the task explicitly requires creating one.
- If Docker is the intended execution path, still keep local Python tooling inside the conda environment.

### Docker

Use Docker Compose for local services such as PostgreSQL, Redis, backend, worker, and beat.

```bash
make up
make migrate
docker compose logs -f worker
docker compose logs -f beat
```

### Frontend

Use the existing Node package manager and lockfile. Do not switch package managers without explicit approval.

```bash
cd frontend
npm install
npm run dev
npm run build
npm test
```

## Coding conventions

### Python

- Format with `black` using line length 100.
- Lint with `ruff`.
- Type-check with `mypy --strict` for `app/` including collectors, analysis, and API modules.
- Use Google-style docstrings.
- Use `async def` for FastAPI routes and async SQLAlchemy 2.0 DB queries.
- Use absolute imports from `app.`.
- Keep imports sorted with `ruff`.
- Validate data with Pydantic before inserting into the database.
- Log all collector runs to the `collection_log` table.

### TypeScript / React

- Format with `prettier`.
- Lint with `eslint` and strict `typescript-eslint`.
- Use function components and hooks; do not add class components.
- Use PascalCase for components.
- Use camelCase for hooks and utilities.
- Co-locate `Component.tsx` and `Component.test.tsx` in the same folder.
- Prefer existing TanStack Query, shadcn/ui, Tailwind, Recharts, MapLibre, and deck.gl patterns.

### SQL / Migrations

- All schema changes must go through Alembic migrations.
- Migration messages should be imperative, for example: `Add port_congestion table`.
- Test migration rollback before merge when possible.
- Do not concatenate raw SQL strings. Use SQLAlchemy parameters to prevent SQL injection.
- Store timestamps in UTC in the database; convert for display in the frontend.

### Git

- Use Conventional Commits: `feat:`, `fix:`, `docs:`, `refactor:`, `test:`, `chore:`.
- Branch naming: `feature/<short-desc>` or `fix/<short-desc>`.
- Pull requests require one approval and passing CI.

## Project structure

```text
.
├── backend/
│   ├── app/
│   │   ├── api/          # FastAPI routes
│   │   ├── collectors/   # Data collection
│   │   ├── analysis/     # ML and analytics
│   │   ├── db/           # Models and session
│   │   ├── schemas/      # Pydantic schemas
│   │   ├── tasks/        # Celery tasks
│   │   └── utils/
│   ├── notebooks/        # EDA
│   ├── tests/
│   └── alembic/
├── frontend/
│   └── src/
│       ├── pages/        # Top-level pages
│       ├── components/   # Reusable components
│       ├── hooks/
│       ├── api/
│       └── stores/
├── docker/
└── docs/
```

## Common tasks

### Add a new collector

1. Create a file in `backend/app/collectors/` that extends `BaseCollector`.
2. Implement `collect()` and return a list of dictionaries.
3. Add a Celery task wrapper in `tasks/jobs.py`.
4. Add a schedule entry in `tasks/schedule.py`.
5. Write unit tests with mocked HTTP responses.
6. Respect API rate limits, log backoff behavior, and cache/pause scraping where required.

### Add a new API endpoint

1. Create a route in `app/api/routes/<resource>.py`.
2. Create a Pydantic response schema in `app/schemas/`.
3. Register the router in `app/main.py`.
4. Update the Postman/Bruno collection.
5. Update the frontend API client.
6. Add or update tests for the endpoint.

### Add a new chart or visualization

1. Create a component in `frontend/src/components/charts/`.
2. Define a TypeScript interface for props.
3. Use existing Recharts or deck.gl patterns.
4. Test with mock data before connecting the API.
5. Keep maps performant with clustering or level-of-detail for more than 5,000 points.

### Add an analysis insight

1. Implement a new template in `app/analysis/insight_generator.py`.
2. Test on historical data and verify the insight is meaningful.
3. Document the hypothesis and method in `docs/insights.md`.
4. Add a unit test with fixture data.

## Critical rules

- NEVER commit secrets to the repository. Use `.env` and keep `.env.example` as the template.
- NEVER install Python libraries globally; create and activate the conda environment first.
- NEVER use `sudo pip`.
- NEVER concatenate raw SQL strings.
- NEVER scrape continuously without caching or politeness delays. Keep at least 5 seconds between scraping requests.
- NEVER ignore API rate limits. Log rate-limit events and use backoff.
- MUST validate data with Pydantic before database inserts.
- MUST log all collector runs to the `collection_log` table.
- MUST handle timezones correctly: UTC in the database, frontend conversion for display.

## Performance notes

- Vessel queries must use the spatial index: `geom GIST` plus bbox filtering.
- Time-series queries should use TimescaleDB `time_bucket` for aggregation.
- Heavy API responses should be cached with Redis for 60 seconds.
- For map rendering, use clustering or LOD when deck.gl displays more than 5,000 points.

## Testing strategy

- Unit tests: collectors with mocked HTTP responses; analysis functions with fixture data.
- Integration tests: API endpoints against a test database.
- E2E: optional; skip if time is limited.
- Coverage target: at least 60% for backend; not strict for frontend.

## Useful commands

```bash
# Backend setup
conda create -n globalsupplywatch python=3.11 -y
conda activate globalsupplywatch

# Backend services
make up
make migrate
docker compose exec backend pytest
docker compose logs -f worker
docker compose logs -f beat

# Manual trigger collector
docker compose exec backend python -c "from app.collectors.fred import FREDCollector; FREDCollector().run()"

# Frontend
cd frontend && npm install
cd frontend && npm run dev
cd frontend && npm run build
cd frontend && npm test
```

## Domain glossary

- **AIS**: Automatic Identification System; ships broadcast position data.
- **MMSI**: Maritime Mobile Service Identity; unique vessel ID.
- **IMO**: International Maritime Organization number; permanent vessel ID.
- **DWT**: Deadweight tonnage; vessel carrying capacity.
- **BDI**: Baltic Dry Index; bulk shipping rates.
- **FBX**: Freightos Baltic Index; container rates.
- **WCI**: World Container Index from Drewry.
- **SCFI**: Shanghai Containerized Freight Index.
- **TEU**: Twenty-foot Equivalent Unit; container unit.
- **VLSFO**: Very Low Sulphur Fuel Oil; main marine fuel.
- **LOCODE**: UN code for ports, for example `CNSHA` for Shanghai.
- **Choke point**: Key strait or passage such as Suez, Panama, Hormuz, Malacca, or Bab-el-Mandeb.
- **Dwell time**: Time a ship spends in port.
- **Nav status**: AIS navigation status.
