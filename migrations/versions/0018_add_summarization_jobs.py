"""Add summarization_jobs table for tracking batch summarization progress.

Stores job status, completed/failed trace lists, and timestamps so the
facilitator can monitor summarization progress in the UI.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0018_add_summarization_jobs"
down_revision = "0017_add_summarization"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "summarization_jobs",
        if_not_exists=True,
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "workshop_id",
            sa.String(),
            sa.ForeignKey("workshops.id", ondelete="CASCADE"),
            nullable=False,
            index=True,
        ),
        sa.Column("status", sa.String(), default="pending"),
        sa.Column("total", sa.Integer(), default=0),
        sa.Column("completed_traces", sa.JSON(), default=list),
        sa.Column("failed_traces", sa.JSON(), default=list),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )


def downgrade() -> None:
    op.drop_table("summarization_jobs")
