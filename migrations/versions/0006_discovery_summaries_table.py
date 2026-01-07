"""Add discovery_summaries table for persisted facilitator summaries.

Adds:
- discovery_summaries table
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0006_discovery_summaries_table"
down_revision = "0005_discovery_questions_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("discovery_summaries"):
        return

    op.create_table(
        "discovery_summaries",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("workshop_id", sa.String(), nullable=False),
        sa.Column("model_name", sa.String(), nullable=True),
        sa.Column("payload", sa.JSON(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["workshop_id"], ["workshops.id"]),
    )

    op.create_index(
        "ix_discovery_summaries_workshop_created_at",
        "discovery_summaries",
        ["workshop_id", "created_at"],
        unique=False,
    )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("discovery_summaries"):
        return
    op.drop_index("ix_discovery_summaries_workshop_created_at", table_name="discovery_summaries")
    op.drop_table("discovery_summaries")
