"""Add span_attribute_filter column to workshops table.

Stores a JSON filter config for selecting a specific span's inputs/outputs
instead of showing root trace data. Used by TraceViewer and backend services.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0015_add_span_attribute_filter"
down_revision = "0014_add_discovery_analysis"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("workshops") as batch_op:
        batch_op.add_column(
            sa.Column("span_attribute_filter", sa.JSON(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("workshops") as batch_op:
        batch_op.drop_column("span_attribute_filter")
