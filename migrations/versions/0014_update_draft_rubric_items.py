"""Update draft_rubric_items table schema for Step 3 structured feedback.

Drop legacy columns (source_finding_id, source_trace_id) and add new columns
for multi-source promotion and grouping.

Revision ID: 0014_update_draft_rubric_items
Revises: 0013_merge_heads
Create Date: 2026-02-24
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

revision = "0014_update_draft_rubric_items"
down_revision = "0013_merge_heads"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # SQLite cannot drop columns, so we recreate the table via batch mode.
    with op.batch_alter_table("draft_rubric_items", schema=None) as batch_op:
        # Drop legacy columns
        batch_op.drop_column("source_finding_id")
        batch_op.drop_column("source_trace_id")

        # Add new columns
        batch_op.add_column(
            sa.Column("source_type", sa.Text(), nullable=False, server_default="manual")
        )
        batch_op.add_column(
            sa.Column("source_analysis_id", sa.Text(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("source_trace_ids", sa.JSON(), nullable=True, server_default="[]")
        )
        batch_op.add_column(
            sa.Column("group_id", sa.Text(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("group_name", sa.Text(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("draft_rubric_items", schema=None) as batch_op:
        batch_op.drop_column("group_name")
        batch_op.drop_column("group_id")
        batch_op.drop_column("source_trace_ids")
        batch_op.drop_column("source_analysis_id")
        batch_op.drop_column("source_type")

        batch_op.add_column(
            sa.Column("source_finding_id", sa.String(), nullable=True)
        )
        batch_op.add_column(
            sa.Column("source_trace_id", sa.String(), nullable=True)
        )
