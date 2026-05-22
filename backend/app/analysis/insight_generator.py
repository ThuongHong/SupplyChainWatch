from __future__ import annotations

from sqlalchemy import text
from sqlalchemy.orm import Session

from app.analysis.maritime_risk import generate_risk_insights
from app.db.models import Insight


def generate_insights(db: Session, limit: int = 10) -> int:
    """Generate template-based insights from current database state."""
    created = 0
    created += _generate_index_change_insights(db, limit=max(1, limit // 2))
    created += _generate_anomaly_insights(db, limit=max(1, limit // 3))
    created += generate_risk_insights(db, limit=max(1, limit // 3))
    created += _generate_forecast_insights(db, limit=max(1, limit - created))
    db.commit()
    return created


def _generate_index_change_insights(db: Session, limit: int) -> int:
    result = db.execute(
        text("""
            WITH ranked AS (
                SELECT index_name, time, value,
                       LAG(value) OVER (PARTITION BY index_name ORDER BY time) AS prev_value
                FROM freight_indices
                WHERE time >= NOW() - INTERVAL '30 days'
            )
            SELECT DISTINCT ON (index_name)
                   index_name, time, value, prev_value
            FROM ranked
            WHERE prev_value IS NOT NULL
            ORDER BY index_name, time DESC
            LIMIT :limit
            """),
        {"limit": limit},
    )
    created = 0
    for row in result.mappings().all():
        previous = float(row["prev_value"])
        current = float(row["value"])
        if previous == 0:
            continue
        pct = (current - previous) / previous * 100
        index_name = str(row["index_name"])
        db.add(
            Insight(
                category="trend",
                title=f"{index_name} changed {pct:.1f}% from the previous observation",
                narrative=(
                    f"{index_name} is now {current:.2f}, compared with {previous:.2f} "
                    "in the previous recorded observation."
                ),
                metrics={"pct_change": pct, "current": current, "previous": previous},
                priority=7 if abs(pct) >= 5 else 4,
            )
        )
        created += 1
    return created


def _generate_anomaly_insights(db: Session, limit: int) -> int:
    result = db.execute(
        text("""
            SELECT entity_type, entity_id, severity, metric, observed, expected, z_score
            FROM anomalies
            WHERE detected_at >= NOW() - INTERVAL '7 days'
            ORDER BY detected_at DESC
            LIMIT :limit
            """),
        {"limit": limit},
    )
    created = 0
    for row in result.mappings().all():
        entity = f"{row['entity_type']} {row['entity_id']}"
        z_score = float(row["z_score"]) if row["z_score"] is not None else None
        db.add(
            Insight(
                category="anomaly",
                title=f"{str(row['severity']).title()} anomaly detected for {entity}",
                narrative=(
                    f"{entity} has an unusual {row['metric']} reading. "
                    f"Observed value is {row['observed']} versus expected {row['expected']}."
                ),
                metrics={"z_score": z_score, "severity": row["severity"]},
                priority=8 if row["severity"] == "high" else 5,
            )
        )
        created += 1
    return created


def _generate_forecast_insights(db: Session, limit: int) -> int:
    result = db.execute(
        text("""
            SELECT DISTINCT ON (index_name)
                   index_name, horizon_days, predictions, metrics
            FROM forecasts
            ORDER BY index_name, created_at DESC
            LIMIT :limit
            """),
        {"limit": limit},
    )
    created = 0
    for row in result.mappings().all():
        predictions = list(row["predictions"])
        if not predictions:
            continue
        final_prediction = predictions[-1]
        index_name = str(row["index_name"])
        db.add(
            Insight(
                category="forecast",
                title=f"{index_name} forecast reaches {final_prediction['yhat']:.2f}",
                narrative=(
                    f"The current forecast projects {index_name} at "
                    f"{final_prediction['yhat']:.2f} in {row['horizon_days']} days."
                ),
                metrics={"prediction": final_prediction, "model_metrics": row["metrics"]},
                priority=4,
            )
        )
        created += 1
    return created
