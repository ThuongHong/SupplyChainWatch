from __future__ import annotations

from datetime import UTC, datetime, timedelta
from typing import Any

import pytest

from app.analysis.port_switch import (
    compute_port_pressure,
    find_substitutes,
    recommend_switch,
)


class FakeResult:
    def __init__(self, rows: list[dict[str, Any]]) -> None:
        self.rows = rows

    def mappings(self) -> FakeResult:
        return self

    def all(self) -> list[dict[str, Any]]:
        return self.rows

    def first(self) -> dict[str, Any] | None:
        return self.rows[0] if self.rows else None


class FakePortSwitchDb:
    def __init__(
        self,
        metric_rows_by_entity: dict[str, list[dict[str, Any]]],
        port_rows_by_locode: dict[str, dict[str, Any]],
        substitutes_by_source: dict[str, list[dict[str, Any]]] | None = None,
    ) -> None:
        self.metric_rows_by_entity = metric_rows_by_entity
        self.port_rows_by_locode = port_rows_by_locode
        self.substitutes_by_source = substitutes_by_source or {}

    def execute(self, statement: Any, params: dict[str, object] | None = None) -> FakeResult:
        sql = str(statement)
        params = params or {}
        if "FROM portwatch_metrics" in sql:
            entity_id = str(params["entity_id"])
            return FakeResult(self.metric_rows_by_entity.get(entity_id, []))
        if "WHERE UPPER(locode)" in sql:
            locode = str(params["locode"]).upper()
            row = self.port_rows_by_locode.get(locode)
            return FakeResult([row] if row else [])
        if "WHERE region = :src_region" in sql:
            source_entity = str(params["source_entity_id"])
            return FakeResult(self.substitutes_by_source.get(source_entity, []))
        raise AssertionError(f"Unexpected SQL: {sql}")


def metric_rows(entity_id: str, values: list[float], *, start: datetime) -> list[dict[str, Any]]:
    return [
        {
            "observed_at": start + timedelta(days=offset),
            "entity_id": entity_id,
            "entity_name": entity_id,
            "metric_name": "daily_vessel_calls",
            "metric_value": value,
        }
        for offset, value in enumerate(values)
    ]


def test_compute_port_pressure_calculates_slopes_z_score_and_projection() -> None:
    start = datetime.now(UTC) - timedelta(days=59)
    values = [100.0 + offset for offset in range(60)]
    db = FakePortSwitchDb(
        {"port-cnsha": metric_rows("port-cnsha", values, start=start)},
        {"CNSHA": {"id": 10}},
    )

    pressure = compute_port_pressure(db, "port-cnsha")  # type: ignore[arg-type]

    assert pressure.entity_name == "Shanghai"
    assert pressure.port_id == 10
    assert pressure.latest_vessel_calls == pytest.approx(159.0)
    assert pressure.slope_7d_pct == pytest.approx((7 / 156) * 100)
    assert pressure.slope_30d_pct == pytest.approx((7 / 144.5) * 100)
    assert pressure.baseline_60d_mean == pytest.approx(sum(values[:-1]) / 59)
    assert pressure.z_score_30d == pytest.approx((159 - 143.5) / 8.655441, rel=1e-4)
    assert pressure.anomaly_flag is False
    assert pressure.projection_7d == pytest.approx(166.0)


def test_find_substitutes_filters_monitored_entities_with_null_teu_fallback() -> None:
    db = FakePortSwitchDb(
        {},
        {"CNSHA": {"id": 10, "region": "East Asia", "twenty_ft_eq_units_year": None}},
        {
            "port-cnsha": [
                {"id": 20, "locode": "CNNGB", "twenty_ft_eq_units_year": 25_000_000},
                {"id": 21, "locode": "ZZZZZ", "twenty_ft_eq_units_year": 20_000_000},
                {"id": 22, "locode": "CNSZX", "twenty_ft_eq_units_year": None},
            ]
        },
    )

    substitutes = find_substitutes(db, "port-cnsha")  # type: ignore[arg-type]

    assert substitutes == ["port-cnngb", "port-cnszx"]


def test_recommend_switch_ranks_by_lower_projected_pressure() -> None:
    start = datetime.now(UTC) - timedelta(days=59)
    db = FakePortSwitchDb(
        {
            "port-cnsha": metric_rows(
                "port-cnsha",
                [100.0 + offset for offset in range(60)],
                start=start,
            ),
            "port-cnngb": metric_rows("port-cnngb", [80.0 for _ in range(60)], start=start),
            "port-cnszx": metric_rows(
                "port-cnszx",
                [90.0 + offset for offset in range(60)],
                start=start,
            ),
        },
        {
            "CNSHA": {"id": 10, "region": "East Asia", "twenty_ft_eq_units_year": 30_000_000},
            "CNNGB": {"id": 20, "region": "East Asia", "twenty_ft_eq_units_year": 25_000_000},
            "CNSZX": {"id": 22, "region": "East Asia", "twenty_ft_eq_units_year": 20_000_000},
        },
        {
            "port-cnsha": [
                {"id": 20, "locode": "CNNGB", "twenty_ft_eq_units_year": 25_000_000},
                {"id": 22, "locode": "CNSZX", "twenty_ft_eq_units_year": 20_000_000},
            ]
        },
    )

    recommendation = recommend_switch(db, "port-cnsha")  # type: ignore[arg-type]

    assert recommendation.recommendation is not None
    assert recommendation.recommendation.entity_id == "port-cnngb"
    assert recommendation.reason is None
    assert "Consider Ningbo-Zhoushan" in recommendation.headline
    assert "switch saves" in recommendation.headline


def test_recommend_switch_returns_reason_when_source_pressure_is_benign() -> None:
    start = datetime.now(UTC) - timedelta(days=59)
    db = FakePortSwitchDb(
        {
            "port-cnsha": metric_rows("port-cnsha", [100.0 for _ in range(60)], start=start),
            "port-cnngb": metric_rows("port-cnngb", [80.0 for _ in range(60)], start=start),
        },
        {
            "CNSHA": {"id": 10, "region": "East Asia", "twenty_ft_eq_units_year": 30_000_000},
            "CNNGB": {"id": 20, "region": "East Asia", "twenty_ft_eq_units_year": 25_000_000},
        },
        {
            "port-cnsha": [
                {"id": 20, "locode": "CNNGB", "twenty_ft_eq_units_year": 25_000_000},
            ]
        },
    )

    recommendation = recommend_switch(db, "port-cnsha")  # type: ignore[arg-type]

    assert recommendation.recommendation is None
    assert recommendation.reason == "Source pressure within normal bounds; switching is not advised"
    assert len(recommendation.substitutes) == 1
