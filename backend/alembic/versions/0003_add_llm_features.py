"""Add LLM feature storage.

Revision ID: 0003_add_llm_features
Revises: 0002_add_week2_api_analysis_support
Create Date: 2026-05-14
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa

revision = "0003_add_llm_features"
down_revision = "0002_add_week2_api_analysis_support"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("insights", sa.Column("narrative_llm", sa.Text(), nullable=True))
    op.add_column("insights", sa.Column("narrative_model", sa.Text(), nullable=True))
    op.add_column(
        "insights",
        sa.Column("narrative_generated_at", sa.TIMESTAMP(timezone=True), nullable=True),
    )
    op.add_column("anomalies", sa.Column("explanation", sa.Text(), nullable=True))
    op.add_column("forecasts", sa.Column("commentary", sa.Text(), nullable=True))
    op.create_table(
        "llm_usage_log",
        sa.Column("id", sa.Integer(), primary_key=True),
        sa.Column("timestamp", sa.TIMESTAMP(timezone=True), server_default=sa.func.now()),
        sa.Column("feature", sa.Text(), nullable=False),
        sa.Column("model", sa.Text(), nullable=False),
        sa.Column("input_tokens", sa.Integer(), nullable=True),
        sa.Column("output_tokens", sa.Integer(), nullable=True),
        sa.Column("duration_ms", sa.Integer(), nullable=True),
        sa.Column("status", sa.Text(), nullable=False),
        sa.Column("error", sa.Text(), nullable=True),
    )
    op.execute("CREATE INDEX IF NOT EXISTS idx_llm_usage_timestamp ON llm_usage_log (timestamp DESC)")
    op.execute(
        "CREATE INDEX IF NOT EXISTS idx_insights_llm_pending "
        "ON insights (priority DESC, generated_at DESC) WHERE narrative_llm IS NULL"
    )


def downgrade() -> None:
    op.execute("DROP INDEX IF EXISTS idx_insights_llm_pending")
    op.execute("DROP INDEX IF EXISTS idx_llm_usage_timestamp")
    op.drop_table("llm_usage_log")
    op.drop_column("forecasts", "commentary")
    op.drop_column("anomalies", "explanation")
    op.drop_column("insights", "narrative_generated_at")
    op.drop_column("insights", "narrative_model")
    op.drop_column("insights", "narrative_llm")
