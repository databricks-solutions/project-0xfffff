"""Baseline schema.

This revision captures the current SQLAlchemy models in `server/database.py`.
Existing databases (created before Alembic) should be stamped to this revision.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0001_baseline"
down_revision = None
branch_labels = None
depends_on = None


def upgrade() -> None:
    # Workshops
    op.create_table(
        "workshops",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("facilitator_id", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("current_phase", sa.String(), nullable=True),
        sa.Column("completed_phases", sa.JSON(), nullable=True),
        sa.Column("discovery_started", sa.Boolean(), nullable=True),
        sa.Column("annotation_started", sa.Boolean(), nullable=True),
        sa.Column("active_discovery_trace_ids", sa.JSON(), nullable=True),
        sa.Column("active_annotation_trace_ids", sa.JSON(), nullable=True),
        sa.Column("judge_name", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
    )

    # Users
    op.create_table(
        "users",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("workshop_id", sa.String(), nullable=False),
        sa.Column("status", sa.String(), nullable=True),
        sa.Column("password_hash", sa.String(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("last_active", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["workshop_id"], ["workshops.id"]),
        sa.UniqueConstraint("email"),
    )

    # Facilitator configs
    op.create_table(
        "facilitator_configs",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("email", sa.String(), nullable=False),
        sa.Column("password_hash", sa.String(), nullable=False),
        sa.Column("name", sa.String(), nullable=False),
        sa.Column("description", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.UniqueConstraint("email"),
    )

    # Workshop participants
    op.create_table(
        "workshop_participants",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("workshop_id", sa.String(), nullable=False),
        sa.Column("role", sa.String(), nullable=False),
        sa.Column("assigned_traces", sa.JSON(), nullable=True),
        sa.Column("annotation_quota", sa.Integer(), nullable=True),
        sa.Column("joined_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
        sa.ForeignKeyConstraint(["workshop_id"], ["workshops.id"]),
    )

    # Traces
    op.create_table(
        "traces",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("workshop_id", sa.String(), nullable=True),
        sa.Column("input", sa.Text(), nullable=False),
        sa.Column("output", sa.Text(), nullable=False),
        sa.Column("context", sa.JSON(), nullable=True),
        sa.Column("trace_metadata", sa.JSON(), nullable=True),
        sa.Column("mlflow_trace_id", sa.String(), nullable=True),
        sa.Column("mlflow_url", sa.String(), nullable=True),
        sa.Column("mlflow_host", sa.String(), nullable=True),
        sa.Column("mlflow_experiment_id", sa.String(), nullable=True),
        sa.Column("include_in_alignment", sa.Boolean(), nullable=True),
        sa.Column("sme_feedback", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["workshop_id"], ["workshops.id"], ondelete="CASCADE"),
    )

    # Discovery findings
    op.create_table(
        "discovery_findings",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("workshop_id", sa.String(), nullable=False),
        sa.Column("trace_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("insight", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["workshop_id"], ["workshops.id"]),
        sa.ForeignKeyConstraint(["trace_id"], ["traces.id"]),
    )

    # User discovery completions
    op.create_table(
        "user_discovery_completions",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("workshop_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("completed_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["workshop_id"], ["workshops.id"]),
        sa.ForeignKeyConstraint(["user_id"], ["users.id"]),
    )

    # Rubrics
    op.create_table(
        "rubrics",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("workshop_id", sa.String(), nullable=False),
        sa.Column("question", sa.Text(), nullable=False),
        sa.Column("created_by", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["workshop_id"], ["workshops.id"]),
    )

    # Annotations
    op.create_table(
        "annotations",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("workshop_id", sa.String(), nullable=False),
        sa.Column("trace_id", sa.String(), nullable=False),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("rating", sa.Integer(), nullable=False),
        sa.Column("ratings", sa.JSON(), nullable=True),
        sa.Column("comment", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["workshop_id"], ["workshops.id"]),
        sa.ForeignKeyConstraint(["trace_id"], ["traces.id"]),
    )

    # MLflow intake config
    op.create_table(
        "mlflow_intake_config",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("workshop_id", sa.String(), nullable=False),
        sa.Column("databricks_host", sa.String(), nullable=False),
        sa.Column("experiment_id", sa.String(), nullable=False),
        sa.Column("max_traces", sa.Integer(), nullable=True),
        sa.Column("filter_string", sa.Text(), nullable=True),
        sa.Column("is_ingested", sa.Boolean(), nullable=True),
        sa.Column("trace_count", sa.Integer(), nullable=True),
        sa.Column("last_ingestion_time", sa.DateTime(), nullable=True),
        sa.Column("error_message", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["workshop_id"], ["workshops.id"]),
        sa.UniqueConstraint("workshop_id"),
    )

    # Databricks tokens
    op.create_table(
        "databricks_tokens",
        sa.Column("workshop_id", sa.String(), primary_key=True),
        sa.Column("token", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["workshop_id"], ["workshops.id"]),
    )

    # Judge prompts
    op.create_table(
        "judge_prompts",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("workshop_id", sa.String(), nullable=False),
        sa.Column("prompt_text", sa.Text(), nullable=False),
        sa.Column("version", sa.Integer(), nullable=False),
        sa.Column("few_shot_examples", sa.JSON(), nullable=True),
        sa.Column("model_name", sa.String(), nullable=True),
        sa.Column("model_parameters", sa.JSON(), nullable=True),
        sa.Column("created_by", sa.String(), nullable=False),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("performance_metrics", sa.JSON(), nullable=True),
        sa.ForeignKeyConstraint(["workshop_id"], ["workshops.id"]),
    )

    # Judge evaluations
    op.create_table(
        "judge_evaluations",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("workshop_id", sa.String(), nullable=False),
        sa.Column("prompt_id", sa.String(), nullable=False),
        sa.Column("trace_id", sa.String(), nullable=False),
        sa.Column("predicted_rating", sa.Integer(), nullable=False),
        sa.Column("human_rating", sa.Integer(), nullable=False),
        sa.Column("confidence", sa.Float(), nullable=True),
        sa.Column("reasoning", sa.Text(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["workshop_id"], ["workshops.id"]),
        sa.ForeignKeyConstraint(["prompt_id"], ["judge_prompts.id"]),
        sa.ForeignKeyConstraint(["trace_id"], ["traces.id"]),
    )

    # User trace orders
    op.create_table(
        "user_trace_orders",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column("user_id", sa.String(), nullable=False),
        sa.Column("workshop_id", sa.String(), nullable=False),
        sa.Column("discovery_traces", sa.JSON(), nullable=True),
        sa.Column("annotation_traces", sa.JSON(), nullable=True),
        sa.Column("created_at", sa.DateTime(), nullable=True),
        sa.Column("updated_at", sa.DateTime(), nullable=True),
        sa.ForeignKeyConstraint(["workshop_id"], ["workshops.id"]),
    )


def downgrade() -> None:
    op.drop_table("user_trace_orders")
    op.drop_table("judge_evaluations")
    op.drop_table("judge_prompts")
    op.drop_table("databricks_tokens")
    op.drop_table("mlflow_intake_config")
    op.drop_table("annotations")
    op.drop_table("rubrics")
    op.drop_table("user_discovery_completions")
    op.drop_table("discovery_findings")
    op.drop_table("traces")
    op.drop_table("workshop_participants")
    op.drop_table("facilitator_configs")
    op.drop_table("users")
    op.drop_table("workshops")


