"""Add historical risk storytelling tables.

Revision ID: 0005_historical_risk
Revises: 0004_portwatch_intel
Create Date: 2026-05-23
"""

from __future__ import annotations

import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

from alembic import op

revision = "0005_historical_risk"
down_revision = "0004_portwatch_intel"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "data_coverage",
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("entity_type", sa.Text(), nullable=False),
        sa.Column("entity_id", sa.Text(), nullable=False),
        sa.Column("entity_name", sa.Text(), nullable=False),
        sa.Column("first_observed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("latest_observed_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("observed_rows", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("expected_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("missing_days", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("freshness_status", sa.Text(), nullable=False),
        sa.Column("last_collection_status", sa.Text(), nullable=True),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.PrimaryKeyConstraint("source", "entity_type", "entity_id"),
    )
    op.create_index(
        "idx_data_coverage_entity",
        "data_coverage",
        ["entity_type", "entity_id", "source"],
        if_not_exists=True,
    )

    op.create_table(
        "risk_feature_snapshots",
        sa.Column("snapshot_date", sa.Date(), nullable=False),
        sa.Column("entity_type", sa.Text(), nullable=False),
        sa.Column("entity_id", sa.Text(), nullable=False),
        sa.Column("entity_name", sa.Text(), nullable=False),
        sa.Column("risk_score", sa.REAL(), nullable=True),
        sa.Column("severity", sa.Text(), nullable=True),
        sa.Column("feature_values", postgresql.JSONB(), nullable=False),
        sa.Column("baseline_values", postgresql.JSONB(), nullable=False),
        sa.Column("z_scores", postgresql.JSONB(), nullable=False),
        sa.Column("deltas", postgresql.JSONB(), nullable=False),
        sa.Column("missing_features", postgresql.JSONB(), nullable=True),
        sa.Column("source_freshness", postgresql.JSONB(), nullable=True),
        sa.Column("driver_metadata", postgresql.JSONB(), nullable=True),
        sa.Column(
            "feature_schema_version", sa.Text(), nullable=False, server_default="risk_features_v1"
        ),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("snapshot_date", "entity_type", "entity_id"),
    )
    op.create_index(
        "idx_rfs_entity_date",
        "risk_feature_snapshots",
        ["entity_id", sa.text("snapshot_date DESC")],
        if_not_exists=True,
    )

    op.create_table(
        "risk_story_events",
        sa.Column("event_key", sa.Text(), nullable=False),
        sa.Column("event_time", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("entity_type", sa.Text(), nullable=False),
        sa.Column("entity_id", sa.Text(), nullable=False),
        sa.Column("entity_name", sa.Text(), nullable=False),
        sa.Column("event_type", sa.Text(), nullable=False),
        sa.Column("severity", sa.Text(), nullable=False),
        sa.Column("metric", sa.Text(), nullable=False),
        sa.Column("observed", sa.Float(), nullable=True),
        sa.Column("expected", sa.Float(), nullable=True),
        sa.Column("z_score", sa.Float(), nullable=True),
        sa.Column("percent_change", sa.Float(), nullable=True),
        sa.Column("drivers", postgresql.JSONB(), nullable=True),
        sa.Column("source_metrics", postgresql.JSONB(), nullable=True),
        sa.Column("narrative", sa.Text(), nullable=False),
        sa.Column("confidence", sa.REAL(), nullable=False),
        sa.Column("attention_level", sa.Text(), nullable=False),
        sa.Column("data_sufficiency", postgresql.JSONB(), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint("event_key"),
    )
    op.create_index(
        "idx_rse_entity_time",
        "risk_story_events",
        ["entity_id", sa.text("event_time DESC")],
        if_not_exists=True,
    )
    op.create_index("idx_rse_event_type", "risk_story_events", ["event_type"], if_not_exists=True)

    op.create_table(
        "entity_risk_forecasts",
        sa.Column("forecast_key", sa.Text(), nullable=False),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column("entity_type", sa.Text(), nullable=False),
        sa.Column("entity_id", sa.Text(), nullable=False),
        sa.Column("entity_name", sa.Text(), nullable=False),
        sa.Column("horizon_days", sa.Integer(), nullable=False),
        sa.Column("predictions", postgresql.JSONB(), nullable=False),
        sa.Column("confidence", sa.REAL(), nullable=False),
        sa.Column("train_window_start", sa.Date(), nullable=True),
        sa.Column("train_window_end", sa.Date(), nullable=True),
        sa.Column("data_sufficiency_status", sa.Text(), nullable=False),
        sa.Column("unavailable_reason", sa.Text(), nullable=True),
        sa.Column("key_drivers", postgresql.JSONB(), nullable=True),
        sa.Column("metrics", postgresql.JSONB(), nullable=False),
        sa.Column("model_name", sa.Text(), nullable=False),
        sa.Column("model_params", postgresql.JSONB(), nullable=True),
        sa.Column(
            "feature_schema_version", sa.Text(), nullable=False, server_default="risk_features_v1"
        ),
        sa.PrimaryKeyConstraint("forecast_key"),
    )
    op.create_index(
        "idx_erf_entity_created",
        "entity_risk_forecasts",
        ["entity_id", sa.text("created_at DESC")],
        if_not_exists=True,
    )


def downgrade() -> None:
    op.drop_table("entity_risk_forecasts")
    op.drop_table("risk_story_events")
    op.drop_table("risk_feature_snapshots")
    op.drop_table("data_coverage")
