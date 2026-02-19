"""Add discovery_analysis table.

Supports Step 2 of the Discovery feature: AI-powered findings synthesis
with disagreement detection. The discovery_feedback table is handled by
the 0012_add_discovery_feedback migration from branch 81.

Revision ID: 0014_add_discovery_analysis
Revises: 0013_merge_heads
Create Date: 2026-02-19
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0014_add_discovery_analysis"
down_revision = "0013_merge_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "discovery_analysis",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("workshop_id", sa.String(), sa.ForeignKey("workshops.id"), nullable=False),
        sa.Column("template_used", sa.String(), nullable=False),
        sa.Column("analysis_data", sa.Text(), nullable=False),
        sa.Column("findings", sa.JSON(), nullable=False),
        sa.Column("disagreements", sa.JSON(), nullable=False),
        sa.Column("participant_count", sa.Integer(), nullable=False),
        sa.Column("model_used", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("discovery_analysis")
