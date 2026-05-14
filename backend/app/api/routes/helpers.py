from __future__ import annotations

from sqlalchemy.engine import RowMapping


def rows_to_dicts(rows: list[RowMapping]) -> list[dict[str, object]]:
    """Convert SQLAlchemy row mappings into plain dictionaries."""
    return [dict(row) for row in rows]


def row_to_dict(row: RowMapping | None) -> dict[str, object] | None:
    """Convert one SQLAlchemy row mapping into a plain dictionary."""
    if row is None:
        return None
    return dict(row)
