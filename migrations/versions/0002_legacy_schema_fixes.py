"""Legacy schema fixes for pre-Alembic databases.

Some older `workshop.db` files were created before certain columns existed.
Those DBs were previously patched at runtime via ad-hoc ALTER TABLE statements.

Now that schema is managed by Alembic, we apply the equivalent upgrades here.
This migration is written to be safe on fresh databases as well (it checks for
column existence before adding).

Supports both SQLite and PostgreSQL (Lakebase) backends.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0002_legacy_schema_fixes"
down_revision = "0001_baseline"
branch_labels = None
depends_on = None


def _is_postgres() -> bool:
    """Check if the current database is PostgreSQL."""
    bind = op.get_bind()
    return bind.dialect.name == "postgresql"


def _has_column(table: str, column: str) -> bool:
    """Check if a column exists in a table (works for both SQLite and PostgreSQL)."""
    bind = op.get_bind()
    if _is_postgres():
        # PostgreSQL: use information_schema
        result = bind.execute(
            sa.text(
                "SELECT column_name FROM information_schema.columns "
                "WHERE table_name = :table AND column_name = :column"
            ),
            {"table": table, "column": column}
        ).fetchone()
        return result is not None
    else:
        # SQLite: use PRAGMA table_info
        rows = bind.execute(sa.text(f"PRAGMA table_info({table})")).fetchall()
        # PRAGMA table_info returns: cid, name, type, notnull, dflt_value, pk
        return any(r[1] == column for r in rows)


def _add_column_if_missing(table: str, column: sa.Column) -> None:
    if _has_column(table, column.name):
        return
    with op.batch_alter_table(table) as batch_op:
        batch_op.add_column(column)


def upgrade() -> None:
    # workshops.judge_name
    _add_column_if_missing(
        "workshops",
        sa.Column("judge_name", sa.String(), server_default=sa.text("'workshop_judge'")),
    )

    # judge_prompts.model_name / model_parameters
    _add_column_if_missing(
        "judge_prompts",
        sa.Column("model_name", sa.String(), server_default=sa.text("'demo'")),
    )
    _add_column_if_missing(
        "judge_prompts",
        sa.Column("model_parameters", sa.JSON(), nullable=True),
    )

    # annotations.ratings (multi-question support)
    _add_column_if_missing(
        "annotations",
        sa.Column("ratings", sa.JSON(), nullable=True),
    )

    # traces.include_in_alignment / sme_feedback (alignment filtering + concatenated feedback)
    # Use dialect-specific default for boolean: 1 for SQLite, TRUE for PostgreSQL
    bool_default = sa.text("TRUE") if _is_postgres() else sa.text("1")
    _add_column_if_missing(
        "traces",
        sa.Column("include_in_alignment", sa.Boolean(), server_default=bool_default),
    )
    _add_column_if_missing(
        "traces",
        sa.Column("sme_feedback", sa.Text(), nullable=True),
    )


def downgrade() -> None:
    # SQLite drop-column is non-trivial; we intentionally omit downgrade support.
    # If needed later, implement via batch mode "recreate" to drop columns.
    pass
