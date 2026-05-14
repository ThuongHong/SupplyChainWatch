from __future__ import annotations

from typing import Annotated

from fastapi import Query
from pydantic import BaseModel


class PaginationParams(BaseModel):
    """Shared limit/offset pagination parameters."""

    limit: int = 500
    offset: int = 0


def pagination_params(
    limit: Annotated[int, Query(ge=1, le=5000)] = 500,
    offset: Annotated[int, Query(ge=0)] = 0,
) -> PaginationParams:
    """Return validated pagination parameters."""
    return PaginationParams(limit=limit, offset=offset)
