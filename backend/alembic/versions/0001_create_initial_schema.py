"""Create initial schema.

Revision ID: 0001_create_initial_schema
Revises:
Create Date: 2026-05-14
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa
from sqlalchemy.dialects import postgresql

revision = "0001_create_initial_schema"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.execute("CREATE EXTENSION IF NOT EXISTS timescaledb")
    op.execute("CREATE EXTENSION IF NOT EXISTS postgis")

    op.create_table(
        "vessels",
        sa.Column("mmsi", sa.BigInteger(), primary_key=True),
        sa.Column("imo", sa.BigInteger(), nullable=True),
        sa.Column("name", sa.Text(), nullable=True),
        sa.Column("type", sa.Integer(), nullable=True),
        sa.Column("type_label", sa.Text(), nullable=True),
        sa.Column("flag", sa.Text(), nullable=True),
        sa.Column("dwt", sa.Integer(), nullable=True),
        sa.Column("length", sa.REAL(), nullable=True),
        sa.Column("width", sa.REAL(), nullable=True),
        sa.Column("last_seen", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.create_table(
        "ports",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("locode", sa.Text(), nullable=True, unique=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("country", sa.Text(), nullable=False),
        sa.Column("region", sa.Text(), nullable=True),
        sa.Column("geom", sa.Text(), nullable=False),
        sa.Column("radius_km", sa.REAL(), nullable=False, server_default="20"),
        sa.Column("twenty_ft_eq_units_year", sa.BigInteger(), nullable=True),
    )
    op.create_table(
        "chokepoints",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("name", sa.Text(), nullable=False),
        sa.Column("geom", sa.Text(), nullable=False),
    )
    op.create_table(
        "vessel_positions",
        sa.Column("time", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("mmsi", sa.BigInteger(), nullable=False),
        sa.Column("lat", sa.Float(), nullable=False),
        sa.Column("lon", sa.Float(), nullable=False),
        sa.Column("sog", sa.REAL(), nullable=True),
        sa.Column("cog", sa.REAL(), nullable=True),
        sa.Column("nav_status", sa.Integer(), nullable=True),
    )
    op.execute(
        "SELECT create_hypertable('vessel_positions', 'time', "
        "if_not_exists => TRUE, chunk_time_interval => INTERVAL '1 day')"
    )
    op.execute(
        "ALTER TABLE vessel_positions ADD COLUMN geom GEOGRAPHY(POINT, 4326) "
        "GENERATED ALWAYS AS (ST_SetSRID(ST_MakePoint(lon, lat), 4326)::GEOGRAPHY) STORED"
    )
    op.create_index("idx_vp_geom", "vessel_positions", ["geom"], postgresql_using="gist")
    op.execute("CREATE INDEX idx_vp_mmsi_time ON vessel_positions (mmsi, time DESC)")

    op.create_table(
        "freight_indices",
        sa.Column("time", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("index_name", sa.Text(), nullable=False),
        sa.Column("value", sa.Float(), nullable=False),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("metadata", postgresql.JSONB(), nullable=True),
    )
    op.execute("SELECT create_hypertable('freight_indices', 'time', if_not_exists => TRUE)")
    op.execute("CREATE INDEX idx_fi_name_time ON freight_indices (index_name, time DESC)")

    op.create_table(
        "bunker_prices",
        sa.Column("time", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("port_code", sa.Text(), nullable=False),
        sa.Column("fuel_type", sa.Text(), nullable=False),
        sa.Column("price_usd_per_ton", sa.Float(), nullable=False),
    )
    op.execute("SELECT create_hypertable('bunker_prices', 'time', if_not_exists => TRUE)")

    op.create_table(
        "port_congestion",
        sa.Column("time", sa.TIMESTAMP(timezone=True), nullable=False),
        sa.Column("port_id", sa.Integer(), nullable=False),
        sa.Column("anchored_count", sa.Integer(), nullable=False),
        sa.Column("moored_count", sa.Integer(), nullable=False),
        sa.Column("underway_count", sa.Integer(), nullable=False),
        sa.Column("total_in_area", sa.Integer(), nullable=False),
        sa.Column("avg_dwell_hours", sa.REAL(), nullable=True),
        sa.Column("median_speed", sa.REAL(), nullable=True),
    )
    op.execute("SELECT create_hypertable('port_congestion', 'time', if_not_exists => TRUE)")

    op.create_table(
        "trade_flows",
        sa.Column("time", sa.Date(), nullable=False),
        sa.Column("reporter_code", sa.Text(), nullable=True),
        sa.Column("partner_code", sa.Text(), nullable=True),
        sa.Column("commodity_code", sa.Text(), nullable=True),
        sa.Column("flow", sa.Text(), nullable=True),
        sa.Column("value_usd", sa.Float(), nullable=True),
        sa.Column("weight_kg", sa.Float(), nullable=True),
    )
    op.create_table(
        "anomalies",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("detected_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("entity_type", sa.Text(), nullable=False),
        sa.Column("entity_id", sa.Text(), nullable=False),
        sa.Column("severity", sa.Text(), nullable=False),
        sa.Column("metric", sa.Text(), nullable=True),
        sa.Column("observed", sa.Float(), nullable=True),
        sa.Column("expected", sa.Float(), nullable=True),
        sa.Column("z_score", sa.Float(), nullable=True),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("acknowledged", sa.Boolean(), server_default=sa.text("FALSE")),
    )
    op.create_table(
        "forecasts",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("created_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("index_name", sa.Text(), nullable=False),
        sa.Column("horizon_days", sa.Integer(), nullable=False),
        sa.Column("predictions", postgresql.JSONB(), nullable=False),
        sa.Column("metrics", postgresql.JSONB(), nullable=False),
        sa.Column("model_name", sa.Text(), nullable=True),
        sa.Column("model_params", postgresql.JSONB(), nullable=True),
    )
    op.create_table(
        "insights",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("generated_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("category", sa.Text(), nullable=True),
        sa.Column("title", sa.Text(), nullable=False),
        sa.Column("narrative", sa.Text(), nullable=False),
        sa.Column("metrics", postgresql.JSONB(), nullable=True),
        sa.Column("priority", sa.Integer(), server_default="0"),
    )
    op.create_table(
        "collection_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("started_at", sa.TIMESTAMP(timezone=True), server_default=sa.text("NOW()")),
        sa.Column("finished_at", sa.TIMESTAMP(timezone=True), nullable=True),
        sa.Column("source", sa.Text(), nullable=False),
        sa.Column("rows_collected", sa.Integer(), nullable=True),
        sa.Column("status", sa.Text(), nullable=True),
        sa.Column("error", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    for table in (
        "collection_log",
        "insights",
        "forecasts",
        "anomalies",
        "trade_flows",
        "port_congestion",
        "bunker_prices",
        "freight_indices",
        "vessel_positions",
        "chokepoints",
        "ports",
        "vessels",
    ):
        op.drop_table(table)
