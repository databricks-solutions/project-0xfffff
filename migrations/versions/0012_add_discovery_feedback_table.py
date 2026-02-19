"""add discovery_feedback table

Revision ID: 0012_add_discovery_feedback
Revises: 0f8f0efbbe57
Create Date: 2026-02-16
"""

from alembic import op
import sqlalchemy as sa

# revision identifiers, used by Alembic.
revision = "0012_add_discovery_feedback"
down_revision = "0f8f0efbbe57"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "discovery_feedback",
        sa.Column("id", sa.Text(), primary_key=True),
        sa.Column(
            "workshop_id",
            sa.Text(),
            sa.ForeignKey("workshops.id"),
            nullable=False,
        ),
        sa.Column(
            "trace_id",
            sa.Text(),
            sa.ForeignKey("traces.id"),
            nullable=False,
        ),
        sa.Column("user_id", sa.Text(), nullable=False),
        sa.Column("feedback_label", sa.Text(), nullable=False),
        sa.Column("comment", sa.Text(), nullable=False),
        sa.Column("followup_qna", sa.JSON(), server_default="[]"),
        sa.Column(
            "created_at",
            sa.DateTime(),
            server_default=sa.func.now(),
        ),
        sa.Column(
            "updated_at",
            sa.DateTime(),
            server_default=sa.func.now(),
        ),
        sa.UniqueConstraint("workshop_id", "trace_id", "user_id", name="uq_discovery_feedback_wtu"),
    )


def downgrade() -> None:
    op.drop_table("discovery_feedback")
