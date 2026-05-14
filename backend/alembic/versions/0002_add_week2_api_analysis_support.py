"""Add week 2 API analysis support.

Revision ID: 0002_add_week2_api_analysis_support
Revises: 0001_create_initial_schema
Create Date: 2026-05-14
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0002_add_week2_api_analysis_support"
down_revision = "0001_create_initial_schema"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute(
        "ALTER TABLE ports ALTER COLUMN geom TYPE GEOGRAPHY(POINT, 4326) "
        "USING ST_GeogFromText(geom)"
    )
    op.execute(
        "ALTER TABLE chokepoints ALTER COLUMN geom TYPE GEOGRAPHY(POLYGON, 4326) "
        "USING ST_GeogFromText(geom)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_ports_geom ON ports USING GIST (geom)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_chokepoints_geom ON chokepoints USING GIST (geom)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_vp_time ON vessel_positions (time DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_pc_port_time ON port_congestion (port_id, time DESC)")
    op.execute("CREATE INDEX IF NOT EXISTS idx_bp_port_time ON bunker_prices (port_code, time DESC)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_anomalies_detected_severity "
        "ON anomalies (detected_at DESC, severity)"
    )
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_forecasts_index_created "
        "ON forecasts (index_name, created_at DESC)"
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_insights_generated ON insights (generated_at DESC)")

    op.create_table(
        "chokepoint_status",
        sa.Column("time", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("chokepoint_id", sa.Integer(), nullable=False),
        sa.Column("vessel_count", sa.Integer(), nullable=False),
        sa.Column("median_speed", sa.REAL(), nullable=True),
        sa.Column("risk_score", sa.REAL(), nullable=True),
    )
    op.execute("SELECT create_hypertable('chokepoint_status', 'time', if_not_exists => TRUE)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_cs_chokepoint_time "
        "ON chokepoint_status (chokepoint_id, time DESC)"
    )


def downgrade() -> None:
    op.drop_table("chokepoint_status")
    op.execute("DROP INDEX IF EXISTS idx_insights_generated")
    op.execute("DROP INDEX IF EXISTS idx_forecasts_index_created")
    op.execute("DROP INDEX IF EXISTS idx_anomalies_detected_severity")
    op.execute("DROP INDEX IF EXISTS idx_bp_port_time")
    op.execute("DROP INDEX IF EXISTS idx_pc_port_time")
    op.execute("DROP INDEX IF EXISTS idx_vp_time")
    op.execute("DROP INDEX IF EXISTS idx_chokepoints_geom")
    op.execute("DROP INDEX IF EXISTS idx_ports_geom")
    op.execute("ALTER TABLE chokepoints ALTER COLUMN geom TYPE TEXT USING ST_AsText(geom::geometry)")
    op.execute("ALTER TABLE ports ALTER COLUMN geom TYPE TEXT USING ST_AsText(geom::geometry)")
