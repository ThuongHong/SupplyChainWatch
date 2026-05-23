# GlobalSupplyWatch

GlobalSupplyWatch monitors global shipping supply chains. Backend runs in Docker; frontend runs locally via Vite.

## Running the Web

### 1. Backend (Docker)

```bash
cp .env.example .env       
make up                     
```

### 2. Frontend (local)

```bash
cd frontend
npm install
npm run dev
```

Open **http://localhost:5173**. Vite proxies `/api` requests to the backend at `http://localhost:8000`.

### Service URLs

| Service      | URL                       |
|--------------|---------------------------|
| Frontend     | http://localhost:5173      |
| Backend API  | http://localhost:8000      |
| API docs     | http://localhost:8000/docs |
| Flower       | http://localhost:5555      |
| Mailhog      | http://localhost:8025      |
| PostgreSQL   | localhost:5432             |
| Redis        | localhost:6379             |

## LLM Features

Insights can be enriched via Alibaba Cloud DashScope Qwen models (OpenAI-compatible API). Set `DASHSCOPE_API_KEY` in `.env`.

Configurable env vars:

| Variable | Default |
|---|---|
| `DASHSCOPE_API_KEY` | _(required for LLM)_ |
| `DASHSCOPE_BASE_URL` | `https://dashscope-intl.aliyuncs.com/compatible-mode/v1` |
| `LLM_MODEL_FAST` | `qwen3.5-flash` |
| `LLM_MODEL_FAST_FALLBACKS` | `qwen3.5-flash-2026-02-23` |
| `LLM_MODEL_REASONING` | `deepseek-v4-flash` |
| `LLM_MODEL_REASONING_FALLBACKS` | `qwen3.5-flash,qwen3.5-flash-2026-02-23` |
| `LLM_ENABLED` | `true` |

Set `LLM_ENABLED=false` to force template fallbacks. Smoke test:

```bash
python -m app.llm.client --test-ping   # run inside backend container
```

Normal tests skip real LLM calls. Use `make test-llm` only when `DASHSCOPE_API_KEY` is set.

## Other Make Targets

```bash
make down          # stop all services
make logs          # tail all service logs
make test          # run pytest inside backend container
make test-llm      # run opt-in LLM provider tests
make collect-all   # trigger all collectors via Celery
make forecast      # trigger forecast generation
make shell-be      # bash shell in backend container
make shell-fe      # sh shell in frontend container
```

## Local Backend Tooling (without Docker)

```bash
conda create -n globalsupplywatch python=3.11 -y
conda activate globalsupplywatch
pip install -e backend[dev]
pytest backend/tests
```

## Stack

- **Backend**: FastAPI + SQLAlchemy + Alembic + Celery + Redis
- **Database**: PostgreSQL 15 + TimescaleDB + PostGIS
- **Frontend**: Vite + React 18 + TypeScript + Tailwind + MapLibre GL + deck.gl
- **LLM**: DashScope Qwen (OpenAI-compatible) with safety validation gate
