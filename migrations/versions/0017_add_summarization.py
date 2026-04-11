"""Add trace summarization columns.

Adds summarization_enabled, summarization_model, summarization_guidance to workshops,
and summary (JSON) to traces for storing structured milestone views.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0017_add_summarization"
down_revision = "0016_add_span_attribute_filter"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("workshops") as batch_op:
        batch_op.add_column(sa.Column("summarization_enabled", sa.Boolean(), default=False))
        batch_op.add_column(sa.Column("summarization_model", sa.String(), nullable=True))
        batch_op.add_column(sa.Column("summarization_guidance", sa.Text(), nullable=True))

    with op.batch_alter_table("traces") as batch_op:
        batch_op.add_column(sa.Column("summary", sa.JSON(), nullable=True))


def downgrade() -> None:
    with op.batch_alter_table("traces") as batch_op:
        batch_op.drop_column("summary")

    with op.batch_alter_table("workshops") as batch_op:
        batch_op.drop_column("summarization_guidance")
        batch_op.drop_column("summarization_model")
        batch_op.drop_column("summarization_enabled")
