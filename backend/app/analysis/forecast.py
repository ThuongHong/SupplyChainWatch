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
    """Generate and store a moving-average forecast for one index."""
    result = db.execute(
        text("""
            SELECT time, value
            FROM freight_indices
            WHERE index_name = :index_name
            ORDER BY time
            """),
        {"index_name": index_name},
    )
    points = [(row["time"], float(row["value"])) for row in result.mappings().all()]
    if len(points) < 14:
        return 0

    holdout_size = min(14, max(3, len(points) // 5))
    train = points[:-holdout_size]
    holdout = points[-holdout_size:]
    baseline = _moving_average([value for _, value in train], window=7)
    errors = [abs(actual - baseline) for _, actual in holdout]
    percentage_errors = [abs(actual - baseline) / actual for _, actual in holdout if actual != 0]
    last_time = _as_datetime(points[-1][0])
    predictions = []
    for offset in range(1, horizon_days + 1):
        yhat = baseline
        predictions.append(
            {
                "ds": (last_time + timedelta(days=offset)).date().isoformat(),
                "yhat": yhat,
                "yhat_lower": yhat * 0.9,
                "yhat_upper": yhat * 1.1,
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
                "rmse": (
                    (sum(error**2 for error in errors) / len(errors)) ** 0.5 if errors else None
                ),
                "last_actual": points[-1][1],
            },
            model_name="moving_average_baseline",
            model_params={"window_days": 7, "prophet_ready": True},
        )
    )
    return 1


def _moving_average(values: list[float], window: int) -> float:
    sample = values[-window:] if len(values) >= window else values
    return sum(sample) / len(sample)


def _as_datetime(value: object) -> datetime:
    if isinstance(value, datetime):
        if value.tzinfo is None:
            return value.replace(tzinfo=UTC)
        return value
    raise TypeError(f"Expected datetime, got {type(value)!r}")
