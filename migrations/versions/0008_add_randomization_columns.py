"""Add randomization columns to workshops.

This migration adds discovery_randomize_traces and annotation_randomize_traces
columns to the workshops table to allow toggling trace randomization.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0008_add_randomization_columns"
down_revision = "0007_discovery_question_category"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("workshops"):
        return

    columns = [c["name"] for c in inspector.get_columns("workshops")]

    if "discovery_randomize_traces" not in columns:
        op.add_column(
            "workshops",
            sa.Column("discovery_randomize_traces", sa.Boolean(), nullable=True, server_default="0")
        )

    if "annotation_randomize_traces" not in columns:
        op.add_column(
            "workshops",
            sa.Column("annotation_randomize_traces", sa.Boolean(), nullable=True, server_default="0")
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("workshops"):
        return

    columns = [c["name"] for c in inspector.get_columns("workshops")]

    if "annotation_randomize_traces" in columns:
        op.drop_column("workshops", "annotation_randomize_traces")
    if "discovery_randomize_traces" in columns:
        op.drop_column("workshops", "discovery_randomize_traces")
