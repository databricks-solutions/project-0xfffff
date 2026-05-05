"""Add V2 project setup tables.

Adds:
- projects
- project_setup_jobs
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0023_add_project_setup_tables"
down_revision = "0022_add_discovery_agent_run_events"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    if not _has_table("projects"):
        op.create_table(
            "projects",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("agent_description", sa.Text(), nullable=False),
            sa.Column("trace_provider", sa.String(), nullable=False, server_default="databricks_uc"),
            sa.Column("trace_provider_config", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("facilitator_id", sa.String(), nullable=False),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        )

    if not _has_table("project_setup_jobs"):
        op.create_table(
            "project_setup_jobs",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("project_id", sa.String(), sa.ForeignKey("projects.id", ondelete="CASCADE"), nullable=False),
            sa.Column("status", sa.String(), nullable=False, server_default="pending"),
            sa.Column("current_step", sa.String(), nullable=False, server_default="queued"),
            sa.Column("message", sa.Text(), nullable=True),
            sa.Column("queue_job_id", sa.String(), nullable=True),
            sa.Column("delegated_run_ids", sa.JSON(), nullable=False, server_default="[]"),
            sa.Column("details", sa.JSON(), nullable=False, server_default="{}"),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
        )
        op.create_index("ix_project_setup_jobs_project_id", "project_setup_jobs", ["project_id"])


def downgrade() -> None:
    if _has_table("project_setup_jobs"):
        op.drop_index("ix_project_setup_jobs_project_id", table_name="project_setup_jobs")
        op.drop_table("project_setup_jobs")
    if _has_table("projects"):
        op.drop_table("projects")
