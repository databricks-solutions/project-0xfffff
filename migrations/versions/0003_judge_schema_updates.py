"""Add judge/rubric schema fields from main branch.

This migration adds:
- rubrics.judge_type, rubrics.binary_labels, rubrics.rating_scale
- judge_prompts.judge_type, judge_prompts.binary_labels, judge_prompts.rating_scale
- judge_evaluations predicted/human fields for binary + freeform judges, and relaxes
  NOT NULL constraints on predicted_rating/human_rating so non-likert judges can store NULLs.

Written to be safe on existing databases by checking for column existence before adding.
Supports both SQLite and PostgreSQL (Lakebase) backends.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0003_judge_schema_updates"
down_revision = "0002_legacy_schema_fixes"
branch_labels = None
depends_on = None


def _is_postgres() -> bool:
    """Check if the current database is PostgreSQL."""
    bind = op.get_bind()
    return bind.dialect.name == "postgresql"


def _get_table_info(table: str):
    """Get table column information (works for both SQLite and PostgreSQL)."""
    bind = op.get_bind()
    if _is_postgres():
        # PostgreSQL: use information_schema
        result = bind.execute(
            sa.text(
                "SELECT column_name, is_nullable FROM information_schema.columns "
                "WHERE table_name = :table"
            ),
            {"table": table}
        ).fetchall()
        # Return list of (column_name, is_nullable) tuples
        return [(r[0], r[1] == "NO") for r in result]  # Convert to (name, notnull) format
    else:
        # SQLite: use PRAGMA table_info
        # PRAGMA table_info returns: cid, name, type, notnull, dflt_value, pk
        rows = bind.execute(sa.text(f"PRAGMA table_info({table})")).fetchall()
        return [(r[1], bool(r[3])) for r in rows]  # (name, notnull)


def _has_column(table: str, column: str) -> bool:
    """Check if a column exists in a table."""
    return any(r[0] == column for r in _get_table_info(table))


def _column_notnull(table: str, column: str) -> bool:
    """Check if a column has NOT NULL constraint."""
    for r in _get_table_info(table):
        if r[0] == column:
            return r[1]
    return False


def _add_column_if_missing(table: str, column: sa.Column) -> None:
    if _has_column(table, column.name):
        return
    with op.batch_alter_table(table) as batch_op:
        batch_op.add_column(column)


def upgrade() -> None:
    # rubrics.*
    _add_column_if_missing(
        "rubrics",
        sa.Column("judge_type", sa.String(), server_default=sa.text("'likert'"), nullable=True),
    )
    _add_column_if_missing(
        "rubrics",
        sa.Column("binary_labels", sa.JSON(), nullable=True),
    )
    _add_column_if_missing(
        "rubrics",
        sa.Column("rating_scale", sa.Integer(), server_default=sa.text("5"), nullable=True),
    )

    # judge_prompts.*
    _add_column_if_missing(
        "judge_prompts",
        sa.Column("judge_type", sa.String(), server_default=sa.text("'likert'"), nullable=True),
    )
    _add_column_if_missing(
        "judge_prompts",
        sa.Column("binary_labels", sa.JSON(), nullable=True),
    )
    _add_column_if_missing(
        "judge_prompts",
        sa.Column("rating_scale", sa.Integer(), server_default=sa.text("5"), nullable=True),
    )

    # judge_evaluations: allow null ratings + add binary/freeform fields.
    needs_relax_predicted_rating = (
        _has_column("judge_evaluations", "predicted_rating")
        and _column_notnull("judge_evaluations", "predicted_rating")
    )
    needs_relax_human_rating = (
        _has_column("judge_evaluations", "human_rating")
        and _column_notnull("judge_evaluations", "human_rating")
    )

    has_predicted_binary = _has_column("judge_evaluations", "predicted_binary")
    has_human_binary = _has_column("judge_evaluations", "human_binary")
    has_predicted_feedback = _has_column("judge_evaluations", "predicted_feedback")
    has_human_feedback = _has_column("judge_evaluations", "human_feedback")

    # If we need to change nullability, use batch mode to recreate the table.
    # Otherwise, we can just add columns (also via batch for consistency).
    with op.batch_alter_table("judge_evaluations") as batch_op:
        if needs_relax_predicted_rating:
            batch_op.alter_column(
                "predicted_rating",
                existing_type=sa.Integer(),
                nullable=True,
            )
        if needs_relax_human_rating:
            batch_op.alter_column(
                "human_rating",
                existing_type=sa.Integer(),
                nullable=True,
            )

        if not has_predicted_binary:
            batch_op.add_column(sa.Column("predicted_binary", sa.Boolean(), nullable=True))
        if not has_human_binary:
            batch_op.add_column(sa.Column("human_binary", sa.Boolean(), nullable=True))
        if not has_predicted_feedback:
            batch_op.add_column(sa.Column("predicted_feedback", sa.Text(), nullable=True))
        if not has_human_feedback:
            batch_op.add_column(sa.Column("human_feedback", sa.Text(), nullable=True))


def downgrade() -> None:
    # SQLite drop-column is non-trivial; we intentionally omit downgrade support.
    pass
