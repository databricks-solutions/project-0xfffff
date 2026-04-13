"""Add workshop-level config for discovery question generation model.

Adds:
- workshops.discovery_questions_model_name

Written to be safe on existing SQLite DBs by checking for column existence before adding.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0006_discovery_questions_model"
down_revision = "0005_add_jsonpath_columns"
branch_labels = None
depends_on = None


def _has_column(table: str, column: str) -> bool:
    """Check if a column exists in a table (works for both SQLite and PostgreSQL)."""
    bind = op.get_bind()
    if bind.dialect.name == "postgresql":
        result = bind.execute(
            sa.text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = :table AND column_name = :column"
            ),
            {"table": table, "column": column},
        ).fetchone()
        return result is not None
    else:
        rows = bind.execute(sa.text(f"PRAGMA table_info({table})")).fetchall()
        return any(r[1] == column for r in rows)


def upgrade() -> None:
    if _has_column("workshops", "discovery_questions_model_name"):
        return
    with op.batch_alter_table("workshops") as batch_op:
        batch_op.add_column(
            sa.Column(
                "discovery_questions_model_name",
                sa.String(),
                server_default=sa.text("'demo'"),
                nullable=True,
            )
        )


def downgrade() -> None:
    # SQLite drop-column is non-trivial; we intentionally omit downgrade support.
    pass
