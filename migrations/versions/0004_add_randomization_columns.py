"""Add randomization columns to workshops.

This migration adds discovery_randomize_traces and annotation_randomize_traces
columns to the workshops table to allow toggling trace randomization.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0004_add_randomization_columns"
down_revision = "0003_judge_schema_updates"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add discovery_randomize_traces column with default False
    op.add_column(
        "workshops",
        sa.Column("discovery_randomize_traces", sa.Boolean(), nullable=True, server_default="0")
    )
    
    # Add annotation_randomize_traces column with default False
    op.add_column(
        "workshops",
        sa.Column("annotation_randomize_traces", sa.Boolean(), nullable=True, server_default="0")
    )


def downgrade() -> None:
    op.drop_column("workshops", "annotation_randomize_traces")
    op.drop_column("workshops", "discovery_randomize_traces")
