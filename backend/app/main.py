from __future__ import annotations

from typing import Any, cast

from fastapi import FastAPI, Request
from fastapi.middleware.cors import CORSMiddleware
from fastapi.middleware.gzip import GZipMiddleware
from fastapi.responses import JSONResponse
from slowapi import _rate_limit_exceeded_handler
from slowapi.errors import RateLimitExceeded
from slowapi.middleware import SlowAPIMiddleware

from app.api.rate_limit import limiter
from app.api.routes.chokepoints import router as chokepoints_router
from app.api.routes.health import router as health_router
from app.api.routes.indices import router as indices_router
from app.api.routes.insights import router as insights_router
from app.api.routes.ports import router as ports_router
from app.api.routes.risk import router as risk_router
from app.api.routes.stats import router as stats_router
from app.api.routes.story import router as story_router
from app.api.routes.vessels import router as vessels_router
from app.api.routes.sync import router as sync_router
from app.config import get_settings

app = FastAPI(
    title="GlobalSupplyWatch API",
    description="Local supply-chain monitoring API.",
    version="0.1.0",
    openapi_tags=[
        {"name": "health", "description": "Service liveness checks."},
        {"name": "indices", "description": "Freight and macro index time series."},
        {"name": "vessels", "description": "AIS vessel snapshots and tracks."},
        {"name": "ports", "description": "Port reference and congestion data."},
        {"name": "risk", "description": "PortWatch-first maritime risk intelligence."},
        {"name": "chokepoints", "description": "Chokepoint reference and risk timelines."},
        {"name": "insights", "description": "Anomalies, correlations, and narratives."},
        {"name": "story", "description": "LLM-assisted two-entity relationship analysis."},
        {"name": "stats", "description": "Dashboard overview metrics."},
    ],
)

app.state.limiter = limiter
app.add_exception_handler(RateLimitExceeded, cast(Any, _rate_limit_exceeded_handler))
if get_settings().rate_limit_enabled:
    app.add_middleware(SlowAPIMiddleware)
app.add_middleware(GZipMiddleware, minimum_size=1000)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173", "http://127.0.0.1:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(health_router, prefix="/api")
app.include_router(indices_router, prefix="/api")
app.include_router(vessels_router, prefix="/api")
app.include_router(ports_router, prefix="/api")
app.include_router(risk_router, prefix="/api")
app.include_router(chokepoints_router, prefix="/api")
app.include_router(insights_router, prefix="/api")
app.include_router(story_router, prefix="/api")
app.include_router(stats_router, prefix="/api")
app.include_router(sync_router, prefix="/api")


@app.exception_handler(Exception)
async def unhandled_exception_handler(request: Request, exc: Exception) -> JSONResponse:
    """Return a consistent JSON error envelope for unexpected failures."""
    return JSONResponse(
        status_code=500,
        content={"detail": "Unexpected server error", "path": str(request.url.path)},
    )
