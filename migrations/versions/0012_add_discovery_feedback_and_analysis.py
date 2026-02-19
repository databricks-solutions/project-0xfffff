"""Add discovery_feedback and discovery_analysis tables.

Supports Step 2 of the Discovery feature: structured feedback collection
and AI-powered findings synthesis with disagreement detection.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0012_add_discovery_feedback_and_analysis"
down_revision = "0011_add_phase_to_participant_notes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "discovery_feedback",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("workshop_id", sa.String(), sa.ForeignKey("workshops.id"), nullable=False),
        sa.Column("trace_id", sa.String(), sa.ForeignKey("traces.id"), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("feedback_label", sa.String(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False),
        sa.Column("followup_qna", sa.JSON(), server_default="[]"),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        sa.UniqueConstraint("workshop_id", "trace_id", "user_id", name="uq_discovery_feedback_workshop_trace_user"),
    )

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
    op.drop_table("discovery_feedback")
