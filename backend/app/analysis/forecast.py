from __future__ import annotations

from datetime import UTC, datetime, timedelta

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.db.models import Forecast

MAJOR_INDICES = ("BDI", "FBX_GLOBAL", "WCI_GLOBAL")


def generate_forecasts(db: Session, horizon_days: int = 14) -> int:
    """Generate forecasts for the major indices."""
    created = 0
    for index_name in MAJOR_INDICES:
        created += generate_index_forecast(db, index_name, horizon_days)
    db.commit()
    return created


def generate_index_forecast(db: Session, index_name: str, horizon_days: int = 14) -> int:
    """Generate and store a trend baseline forecast for one index."""
    result = db.execute(
        text("""
            SELECT date_trunc('day', time) AS time, avg(value) AS value
            FROM freight_indices
            WHERE index_name = :index_name
            GROUP BY 1
            ORDER BY 1
            """),
        {"index_name": index_name},
    )
    points = [(row["time"], float(row["value"])) for row in result.mappings().all()]
    if len(points) < 14:
        return 0

    holdout_size = min(14, max(3, len(points) // 5))
    train = points[:-holdout_size]
    holdout = points[-holdout_size:]
    train_values = [value for _, value in train]
    holdout_values = [value for _, value in holdout]
    holdout_predictions = _trend_forecast(train_values, len(holdout_values), window=14)
    errors = [abs(actual - predicted) for actual, predicted in zip(holdout_values, holdout_predictions)]
    percentage_errors = [
        abs(actual - predicted) / actual
        for actual, predicted in zip(holdout_values, holdout_predictions)
        if actual != 0
    ]
    last_time = _as_datetime(points[-1][0])
    future_predictions = _trend_forecast([value for _, value in points], horizon_days, window=14)
    rmse = (sum(error**2 for error in errors) / len(errors)) ** 0.5 if errors else None
    predictions = []
    for offset, yhat in enumerate(future_predictions, start=1):
        interval = max(abs(yhat) * 0.05, rmse or 0.0)
        predictions.append(
            {
                "ds": (last_time + timedelta(days=offset)).date().isoformat(),
                "yhat": yhat,
                "yhat_lower": max(0.0, yhat - interval),
                "yhat_upper": yhat + interval,
            }
        )

    db.add(
        Forecast(
            index_name=index_name,
            horizon_days=horizon_days,
            predictions=predictions,
            metrics={
                "mape": (
                    (sum(percentage_errors) / len(percentage_errors) * 100)
                    if percentage_errors
                    else None
                ),
                "mae": (sum(errors) / len(errors)) if errors else None,
                "rmse": rmse,
                "last_actual": points[-1][1],
            },
            model_name="linear_trend_baseline",
            model_params={"trend_window_days": 14, "daily_aggregation": "avg", "prophet_ready": True},
        )
    )
    return 1


def _moving_average(values: list[float], window: int) -> float:
    sample = values[-window:] if len(values) >= window else values
    return sum(sample) / len(sample)


def _trend_forecast(values: list[float], horizon_days: int, window: int) -> list[float]:
    """Project from the latest observed value using recent linear trend."""
    if not values or horizon_days <= 0:
        return []

    sample = values[-window:] if len(values) >= window else values
    slope = _linear_slope(sample)
    anchor = values[-1]
    return [max(0.0, anchor + slope * offset) for offset in range(1, horizon_days + 1)]


def _linear_slope(values: list[float]) -> float:
    if len(values) < 2:
        return 0.0
    x_mean = (len(values) - 1) / 2
    y_mean = sum(values) / len(values)
    denominator = sum((idx - x_mean) ** 2 for idx in range(len(values)))
    if denominator == 0:
        return 0.0
    return sum((idx - x_mean) * (value - y_mean) for idx, value in enumerate(values)) / denominator


def _as_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value
    raise TypeError(f"Expected datetime, got {type(value)!r}")
