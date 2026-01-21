"""Add JSONPath columns to workshops.

This migration adds input_jsonpath and output_jsonpath columns to the workshops
table to allow facilitators to configure JSONPath queries for trace display.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0005_add_jsonpath_columns"
down_revision = "0004_add_randomization_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add input_jsonpath column for extracting values from trace input
    op.add_column(
        "workshops",
        sa.Column("input_jsonpath", sa.Text(), nullable=True)
    )

    # Add output_jsonpath column for extracting values from trace output
    op.add_column(
        "workshops",
        sa.Column("output_jsonpath", sa.Text(), nullable=True)
    )


def downgrade() -> None:
    op.drop_column("workshops", "output_jsonpath")
    op.drop_column("workshops", "input_jsonpath")
