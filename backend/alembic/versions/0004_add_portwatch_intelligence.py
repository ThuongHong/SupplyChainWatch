"""Add PortWatch intelligence tables.

Revision ID: 0004_portwatch_intel
Revises: 0003_add_llm_features
Create Date: 2026-05-21
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0004_portwatch_intel"
down_revision = "0003_add_llm_features"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "portwatch_metrics",
        sa.Column("observed_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("entity_type", sa.Text(), nullable=False),
        sa.Column("entity_id", sa.Text(), nullable=False),
        sa.Column("entity_name", sa.Text(), nullable=False),
        sa.Column("metric_name", sa.Text(), nullable=False),
        sa.Column("metric_value", sa.Float(), nullable=False),
        sa.Column("unit", sa.Text(), nullable=True),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("source_entity_id", sa.Text(), nullable=True),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
        sa.Column("collected_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.PrimaryKeyConstraint(
            "observed_at", "entity_type", "entity_id", "metric_name", "source"
        ),
    )
    op.execute("SELECT create_hypertable('portwatch_metrics', 'observed_at', if_not_exists => TRUE)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_pwm_entity_metric_time "
        "ON portwatch_metrics (entity_type, entity_id, metric_name, observed_at DESC)"
    )

    op.create_table(
        "port_risk_scores",
        sa.Column("time", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("port_id", sa.Integer(), nullable=True),
        sa.Column("entity_id", sa.Text(), nullable=False),
        sa.Column("entity_name", sa.Text(), nullable=False),
        sa.Column("score", sa.REAL(), nullable=False),
        sa.Column("severity", sa.Text(), nullable=False),
        sa.Column("component_scores", postgresql.JSONB(), nullable=False),
        sa.Column("missing_components", postgresql.JSONB(), nullable=True),
        sa.Column("reasons", postgresql.JSONB(), nullable=True),
        sa.Column("source_metrics", postgresql.JSONB(), nullable=True),
        sa.Column("freshness_status", sa.Text(), nullable=False, server_default="fresh"),
        sa.Column("as_of", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("time", "entity_id"),
    )
    op.execute("SELECT create_hypertable('port_risk_scores', 'time', if_not_exists => TRUE)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_prs_entity_time "
        "ON port_risk_scores (entity_id, time DESC)"
    )

    op.create_table(
        "chokepoint_risk_scores",
        sa.Column("time", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("chokepoint_id", sa.Integer(), nullable=True),
        sa.Column("entity_id", sa.Text(), nullable=False),
        sa.Column("entity_name", sa.Text(), nullable=False),
        sa.Column("score", sa.REAL(), nullable=False),
        sa.Column("severity", sa.Text(), nullable=False),
        sa.Column("component_scores", postgresql.JSONB(), nullable=False),
        sa.Column("missing_components", postgresql.JSONB(), nullable=True),
        sa.Column("reasons", postgresql.JSONB(), nullable=True),
        sa.Column("source_metrics", postgresql.JSONB(), nullable=True),
        sa.Column("freshness_status", sa.Text(), nullable=False, server_default="fresh"),
        sa.Column("as_of", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.PrimaryKeyConstraint("time", "entity_id"),
    )
    op.execute(
        "SELECT create_hypertable('chokepoint_risk_scores', 'time', if_not_exists => TRUE)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_crs_entity_time "
        "ON chokepoint_risk_scores (entity_id, time DESC)"
    )

    op.create_table(
        "vessel_watchlist",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("mmsi", sa.BigInteger(), nullable=False, unique=True),
        sa.Column("reason", sa.Text(), nullable=False),
        sa.Column("source_rule", sa.Text(), nullable=False),
        sa.Column("priority", sa.Integer(), nullable=False, server_default="5"),
        sa.Column("active", sa.Boolean(), nullable=False, server_default=sa.true()),
        sa.Column("entity_type", sa.Text(), nullable=True),
        sa.Column("entity_id", sa.Text(), nullable=True),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_vessel_watchlist_active "
        "ON vessel_watchlist (active, priority DESC, expires_at)"
    )

    op.create_table(
        "vessel_enrichment_cache",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("mmsi", sa.BigInteger(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("fetched_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("expires_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("confidence", sa.REAL(), nullable=True),
        sa.Column("data", postgresql.JSONB(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
        sa.UniqueConstraint("mmsi", "source", name="uq_vessel_enrichment_source"),
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_ve_cache_lookup "
        "ON vessel_enrichment_cache (mmsi, source, expires_at DESC)"
    )

    op.create_table(
        "disruption_propagation",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("source_entity_type", sa.Text(), nullable=False),
        sa.Column("source_entity_id", sa.Text(), nullable=False),
        sa.Column("source_entity_name", sa.Text(), nullable=False),
        sa.Column("target_entity_type", sa.Text(), nullable=False),
        sa.Column("target_entity_id", sa.Text(), nullable=False),
        sa.Column("target_entity_name", sa.Text(), nullable=False),
        sa.Column("route_lane", sa.Text(), nullable=True),
        sa.Column("severity", sa.Text(), nullable=False),
        sa.Column("confidence", sa.REAL(), nullable=False),
        sa.Column("explanation", sa.Text(), nullable=False),
        sa.Column("source_metrics", postgresql.JSONB(), nullable=True),
        sa.Column("started_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("updated_at", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("status", sa.Text(), nullable=False, server_default="active"),
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_dp_source_status "
        "ON disruption_propagation (source_entity_id, status, updated_at DESC)"
    )

    op.add_column("insights", sa.Column("event_type", sa.Text(), nullable=True))
    op.add_column("insights", sa.Column("confidence", sa.REAL(), nullable=True))
    op.add_column("insights", sa.Column("affected_entities", postgresql.JSONB(), nullable=True))
    op.add_column("insights", sa.Column("source_metrics", postgresql.JSONB(), nullable=True))
    op.add_column("insights", sa.Column("attention_level", sa.Text(), nullable=True))


def downgrade() -> None:
    op.drop_column("insights", "attention_level")
    op.drop_column("insights", "source_metrics")
    op.drop_column("insights", "affected_entities")
    op.drop_column("insights", "confidence")
    op.drop_column("insights", "event_type")
    op.drop_table("disruption_propagation")
    op.drop_table("vessel_enrichment_cache")
    op.drop_table("vessel_watchlist")
    op.drop_table("chokepoint_risk_scores")
    op.drop_table("port_risk_scores")
    op.drop_table("portwatch_metrics")
