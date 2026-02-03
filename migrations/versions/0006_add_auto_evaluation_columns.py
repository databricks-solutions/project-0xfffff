"""Add auto-evaluation columns to workshops.

This migration adds auto_evaluation_job_id and auto_evaluation_prompt columns
to the workshops table to support automatic LLM evaluation when annotation begins.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0006_add_auto_evaluation_columns"
down_revision = "0005_add_jsonpath_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add auto_evaluation_job_id column for tracking the auto-evaluation job
    op.add_column(
        "workshops",
        sa.Column("auto_evaluation_job_id", sa.String(), nullable=True)
    )

    # Add auto_evaluation_prompt column for storing the derived judge prompt
    op.add_column(
        "workshops",
        sa.Column("auto_evaluation_prompt", sa.Text(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("workshops", "auto_evaluation_prompt")
    op.drop_column("workshops", "auto_evaluation_job_id")
