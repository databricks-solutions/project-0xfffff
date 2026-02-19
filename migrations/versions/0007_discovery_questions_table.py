"""Add discovery_questions table for per-user/per-trace generated questions.

Adds:
- discovery_questions table
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0007_discovery_questions_table"
down_revision = "0006_discovery_questions_model"
branch_labels = None
depends_on = None


def upgrade() -> None:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if inspector.has_table("discovery_questions"):
        return

    op.create_table(
        "discovery_questions",
        sa.Column("id", sa.String(), primary_key=True, nullable=False),
        sa.Column("workshop_id", sa.String(), nullable=False),
        sa.Column("trace_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("question_id", sa.String(), nullable=False),
        sa.Column("prompt", sa.Text(), nullable=False),
        sa.Column("placeholder", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.text("CURRENT_TIMESTAMP"), nullable=True),
        sa.ForeignKeyConstraint(["workshop_id"], ["workshops.id"]),
        sa.ForeignKeyConstraint(["trace_id"], ["traces.id"]),
    )

    # Helpful index for lookups
    op.create_index(
        "ix_discovery_questions_workshop_trace_user",
        "discovery_questions",
        ["workshop_id", "trace_id", "user_id"],
        unique=False,
    )


def downgrade() -> None:
    # SQLite drop-table is supported; keep this simple.
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    if not inspector.has_table("discovery_questions"):
        return
    op.drop_index("ix_discovery_questions_workshop_trace_user", table_name="discovery_questions")
    op.drop_table("discovery_questions")
