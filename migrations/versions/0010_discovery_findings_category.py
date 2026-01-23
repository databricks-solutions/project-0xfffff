"""Add category column to discovery_findings table.

Adds:
- category column to discovery_findings for classification tracking
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0010_discovery_findings_category"
down_revision = "0009_discovery_question_category"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("discovery_findings"):
        return

    columns = [c["name"] for c in inspector.get_columns("discovery_findings")]
    if "category" not in columns:
        op.add_column(
            "discovery_findings",
            sa.Column("category", sa.String(), nullable=True),
        )


def downgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)

    if not inspector.has_table("discovery_findings"):
        return

    columns = [c["name"] for c in inspector.get_columns("discovery_findings")]
    if "category" in columns:
        op.drop_column("discovery_findings", "category")
