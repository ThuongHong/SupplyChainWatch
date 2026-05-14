# GlobalSupplyWatch

GlobalSupplyWatch is a local Docker Compose web app for monitoring global shipping supply chains.

## Week 1 Status

The repository contains the foundation for the data pipeline:

- Backend package scaffold with FastAPI, SQLAlchemy, Alembic, Celery, collectors, seeds, and tests.
- Docker Compose skeleton for PostgreSQL with TimescaleDB/PostGIS, Redis, backend, worker, beat, Flower, and Mailhog.
- Initial Alembic migration for the planned schema.
- Collector modules for AISStream, FRED, UN Comtrade, Open-Meteo Marine, Ship & Bunker, Freightos FBX, and Drewry WCI.
- Data-source documentation, notebook placeholders, and initial EDA guidance.

## Week 2 Status

The backend API and analysis foundation are scaffolded:

- FastAPI routes for indices, vessels, ports, chokepoints, anomalies, insights, correlations, and overview stats.
- Redis cache helper for heavy reads.
- Port congestion and chokepoint spatial analysis jobs.
- Rolling z-score anomaly detection, moving-average forecasts, correlations, and template insights.
- Postman collection at `docs/postman_collection.json`.

Live collection requires API keys in `.env`. Copy `.env.example` to `.env` and fill in the keys before starting services.

## LLM Features

GlobalSupplyWatch can enrich insights with Alibaba Cloud DashScope Qwen models through the OpenAI-compatible API. Set `DASHSCOPE_API_KEY` in `.env`; the key is read only from the environment and is never hardcoded. The default base URL is `https://dashscope-intl.aliyuncs.com/compatible-mode/v1`.

Configurable model variables:

- `LLM_MODEL_FAST=qwen3.6-flash` for short narratives, forecast commentary, and anomaly explanations.
- `LLM_MODEL_FAST_FALLBACKS=qwen3.5-flash,qwen3.6-flash-2026-04-16,qwen3.5-flash-2026-02-23`.
- `LLM_MODEL_REASONING=deepseek-v4-flash` for Story Mode analysis.
- `LLM_MODEL_REASONING_FALLBACKS=qwen3.6-flash,qwen3.6-flash-2026-04-16,qwen3.5-flash,qwen3.5-flash-2026-02-23`.
- `LLM_ENABLED=true` can be set to `false` to force template fallbacks.

The client retries the next configured model when a provider response indicates a token or context-limit failure. Translation (`qwen-mt-flash`), vision/video (`qwen3-vl-*`, `wan2.2-kf2v-flash`), and coder (`qwen3-coder-flash`) models are not used for the current text-only insight features.

Run the provider smoke test from the backend container with:

```bash
python -m app.llm.client --test-ping
```

Normal tests skip real LLM calls. Use `make test-llm` only when `DASHSCOPE_API_KEY` is configured and you want to run opt-in provider checks.

## Quick Start

```bash
cp .env.example .env
make up
make migrate
make seed
make test
```

## Local Backend Tooling

Per project rules, create and activate the conda environment before running Python tooling outside Docker:

```bash
conda create -n globalsupplywatch python=3.11 -y
conda activate globalsupplywatch
pip install -e backend[dev]
pytest backend/tests
```

## Services

- Backend API: http://localhost:8000
- Flower: http://localhost:5555
- Mailhog: http://localhost:8025
- PostgreSQL: localhost:5432
- Redis: localhost:6379
