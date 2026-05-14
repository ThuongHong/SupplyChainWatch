from __future__ import annotations

import json
from typing import Any

from fastapi.encoders import jsonable_encoder
from redis.asyncio import Redis
from redis.exceptions import RedisError

from app.config import get_settings

_redis: Redis | None = None


def _client() -> Redis:
    global _redis
    if _redis is None:
        _redis = Redis.from_url(get_settings().redis_url, decode_responses=True)
    return _redis


async def get_cached_json(key: str) -> Any | None:
    """Return cached JSON data, or `None` if Redis is unavailable/missing."""
    try:
        raw = await _client().get(key)
    except RedisError:
        return None
    if raw is None:
        return None
    return json.loads(raw)


async def set_cached_json(key: str, value: Any, ttl_seconds: int = 60) -> None:
    """Cache JSON-serializable data; silently bypass Redis failures."""
    try:
        await _client().setex(key, ttl_seconds, json.dumps(jsonable_encoder(value)))
    except RedisError:
        return
