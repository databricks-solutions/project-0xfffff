"""Add category column to discovery_questions table.

Adds:
- category column to discovery_questions for coverage tracking
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0009_discovery_question_category"
down_revision = "0008_discovery_summaries_table"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("discovery_questions"):
        return

    columns = [c["name"] for c in inspector.get_columns("discovery_questions")]
    if "category" not in columns:
        op.add_column(
            "discovery_questions",
            sa.Column("category", sa.String(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("discovery_questions"):
        return

    columns = [c["name"] for c in inspector.get_columns("discovery_questions")]
    if "category" in columns:
        op.drop_column("discovery_questions", "category")
