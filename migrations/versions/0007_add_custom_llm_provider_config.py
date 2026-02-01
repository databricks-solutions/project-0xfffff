"""Add custom LLM provider config table.

This migration creates the custom_llm_provider_config table for storing
configuration for custom OpenAI-compatible LLM endpoints.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0007_add_custom_llm_provider_config"
down_revision = "0006_add_auto_evaluation_columns"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "custom_llm_provider_config",
        sa.Column("id", sa.String(), nullable=False),
        sa.Column("workshop_id", sa.String(), nullable=False),
        sa.Column("provider_name", sa.String(), nullable=False),
        sa.Column("base_url", sa.String(), nullable=False),
        sa.Column("model_name", sa.String(), nullable=False),
        sa.Column("is_enabled", sa.Boolean(), default=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now(), onupdate=sa.func.now()),
        sa.PrimaryKeyConstraint("id"),
        sa.ForeignKeyConstraint(["workshop_id"], ["workshops.id"]),
        sa.UniqueConstraint("workshop_id"),
    )


def downgrade() -> None:
    op.drop_table("custom_llm_provider_config")
