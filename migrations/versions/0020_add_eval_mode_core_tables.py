"""Add workshop mode and eval-mode core tables.

Adds:
- workshops.mode
- trace_criteria
- criterion_evaluations
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0020_add_eval_mode_core_tables"
down_revision = "0019_remove_databricks_host"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column("workshops", sa.Column("mode", sa.String(), nullable=False, server_default="workshop"))

    op.create_table(
        "trace_criteria",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "trace_id",
            sa.String(),
            sa.ForeignKey("traces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "workshop_id",
            sa.String(),
            sa.ForeignKey("workshops.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("text", sa.Text(), nullable=False),
        sa.Column("criterion_type", sa.String(), nullable=False),
        sa.Column("weight", sa.Integer(), nullable=False, server_default="1"),
        sa.Column("source_finding_id", sa.String(), nullable=True),
        sa.Column("created_by", sa.String(), nullable=False),
        sa.Column("order", sa.Integer(), nullable=False, server_default="0"),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_trace_criteria_trace_id", "trace_criteria", ["trace_id"])
    op.create_index("ix_trace_criteria_workshop_id", "trace_criteria", ["workshop_id"])

    op.create_table(
        "criterion_evaluations",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "criterion_id",
            sa.String(),
            sa.ForeignKey("trace_criteria.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "trace_id",
            sa.String(),
            sa.ForeignKey("traces.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "workshop_id",
            sa.String(),
            sa.ForeignKey("workshops.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column("judge_model", sa.String(), nullable=False),
        sa.Column("met", sa.Boolean(), nullable=False),
        sa.Column("rationale", sa.Text(), nullable=True),
        sa.Column("raw_response", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
    )
    op.create_index("ix_criterion_evaluations_criterion_id", "criterion_evaluations", ["criterion_id"])
    op.create_index("ix_criterion_evaluations_trace_id", "criterion_evaluations", ["trace_id"])
    op.create_index("ix_criterion_evaluations_workshop_id", "criterion_evaluations", ["workshop_id"])


def downgrade() -> None:
    op.drop_index("ix_criterion_evaluations_workshop_id", table_name="criterion_evaluations")
    op.drop_index("ix_criterion_evaluations_trace_id", table_name="criterion_evaluations")
    op.drop_index("ix_criterion_evaluations_criterion_id", table_name="criterion_evaluations")
    op.drop_table("criterion_evaluations")

    op.drop_index("ix_trace_criteria_workshop_id", table_name="trace_criteria")
    op.drop_index("ix_trace_criteria_trace_id", table_name="trace_criteria")
    op.drop_table("trace_criteria")

    op.drop_column("workshops", "mode")
