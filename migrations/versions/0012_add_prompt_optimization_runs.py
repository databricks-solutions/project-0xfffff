"""Add prompt_optimization_runs table.

Stores GEPA prompt optimization run history — original and optimized prompts,
metrics, status, and error details for each optimization job.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0012_add_prompt_optimization_runs"
down_revision = "0011_add_phase_to_participant_notes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "prompt_optimization_runs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "workshop_id",
            sa.String(),
            sa.ForeignKey("workshops.id"),
            nullable=False,
        ),
        sa.Column("job_id", sa.String(), nullable=False),
        sa.Column("prompt_uri", sa.String(), nullable=False),
        sa.Column("original_prompt", sa.Text(), nullable=True),
        sa.Column("optimized_prompt", sa.Text(), nullable=True),
        sa.Column("optimized_version", sa.Integer(), nullable=True),
        sa.Column("optimizer_model", sa.String(), nullable=True),
        sa.Column("num_iterations", sa.Integer(), nullable=True),
        sa.Column("num_candidates", sa.Integer(), nullable=True),
        sa.Column("metrics", sa.Text(), nullable=True),
        sa.Column("status", sa.String(), server_default="pending"),
        sa.Column("error", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    op.create_index(
        "ix_prompt_optimization_runs_workshop_id",
        "prompt_optimization_runs",
        ["workshop_id"],
    )


def downgrade() -> None:
    op.drop_index(
        "ix_prompt_optimization_runs_workshop_id",
        table_name="prompt_optimization_runs",
    )
    op.drop_table("prompt_optimization_runs")
