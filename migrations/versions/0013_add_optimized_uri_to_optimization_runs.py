"""Add optimized_uri column to prompt_optimization_runs table.

Stores the MLflow prompt URI (e.g. prompts:/catalog.schema.name/2) of the
registered optimized prompt so it can be displayed in history.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0013_add_optimized_uri_to_optimization_runs"
down_revision = "0012_add_prompt_optimization_runs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("prompt_optimization_runs") as batch_op:
        batch_op.add_column(
            sa.Column("optimized_uri", sa.String(), nullable=True)
        )


def downgrade() -> None:
    with op.batch_alter_table("prompt_optimization_runs") as batch_op:
        batch_op.drop_column("optimized_uri")
