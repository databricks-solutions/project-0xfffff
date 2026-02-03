"""Add auto_evaluation_model column to workshops table.

This migration adds the auto_evaluation_model column to store the LLM model
used for auto-evaluation, so re-evaluation uses the same model.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0008_add_auto_evaluation_model"
down_revision = "0007_add_custom_llm_provider_config"
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Add auto_evaluation_model column to workshops table
    op.add_column('workshops', sa.Column('auto_evaluation_model', sa.String(), nullable=True))


def downgrade() -> None:
    op.drop_column('workshops', 'auto_evaluation_model')
