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
    created += _generate_source_health_insights(db, limit=max(1, limit // 4))
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


def _generate_source_health_insights(db: Session, limit: int) -> int:
    result = db.execute(
        text("""
            SELECT source, entity_type, entity_id, entity_name, observed_rows,
                   expected_days, missing_days, freshness_status, last_collection_status
            FROM data_coverage
            WHERE freshness_status <> 'fresh'
               OR missing_days > 0
               OR COALESCE(last_collection_status, 'success') <> 'success'
            ORDER BY
                CASE freshness_status WHEN 'stale' THEN 3 WHEN 'aging' THEN 2 ELSE 1 END DESC,
                missing_days DESC,
                observed_rows ASC
            LIMIT :limit
            """),
        {"limit": limit},
    )
    created = 0
    for row in result.mappings().all():
        missing_days = int(row["missing_days"] or 0)
        expected_days = int(row["expected_days"] or 0)
        observed_rows = int(row["observed_rows"] or 0)
        freshness = str(row["freshness_status"])
        status = row["last_collection_status"]
        entity_name = str(row["entity_name"])
        source = str(row["source"])
        status_text = f" Last collection status is {status}." if status else ""
        db.add(
            Insight(
                category="data_quality",
                event_type="source_health",
                title=f"{source} coverage needs review for {entity_name}",
                narrative=(
                    f"{source} has {observed_rows} rows for {entity_name}, missing "
                    f"{missing_days} of {expected_days} expected days. Source freshness is "
                    f"{freshness}.{status_text}"
                ),
                metrics={
                    "observed_rows": observed_rows,
                    "expected_days": expected_days,
                    "missing_days": missing_days,
                    "freshness_status": freshness,
                    "last_collection_status": status,
                },
                affected_entities=[
                    {
                        "type": row["entity_type"],
                        "id": row["entity_id"],
                        "name": entity_name,
                    }
                ],
                source_metrics={"source": source},
                attention_level="watch" if freshness == "stale" or missing_days > 0 else "monitor",
                priority=7 if freshness == "stale" or missing_days >= 7 else 4,
            )
        )
        created += 1
    return created
