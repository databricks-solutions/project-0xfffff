"""Add discovery social-thread columns and tables.

Adds:
- workshops.discovery_mode
- workshops.discovery_followups_enabled
- discovery_comments
- discovery_comment_votes
- discovery_agent_runs
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0021_add_discovery_social_thread_tables"
down_revision = "0020_add_eval_mode_core_tables"
branch_labels = None
depends_on = None


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(col["name"] == column_name for col in inspector.get_columns(table_name))


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def upgrade() -> None:
    if not _has_column("workshops", "discovery_mode"):
        op.add_column("workshops", sa.Column("discovery_mode", sa.String(), nullable=False, server_default="analysis"))

    if not _has_column("workshops", "discovery_followups_enabled"):
        op.add_column(
            "workshops",
            sa.Column("discovery_followups_enabled", sa.Boolean(), nullable=False, server_default=sa.true()),
        )

    if not _has_table("discovery_comments"):
        op.create_table(
            "discovery_comments",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("workshop_id", sa.String(), sa.ForeignKey("workshops.id", ondelete="CASCADE"), nullable=False),
            sa.Column("trace_id", sa.String(), sa.ForeignKey("traces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("milestone_ref", sa.String(), nullable=True),
            sa.Column("parent_comment_id", sa.String(), nullable=True),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("author_type", sa.String(), nullable=False, server_default="human"),
            sa.Column("body", sa.Text(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_discovery_comments_workshop_trace", "discovery_comments", ["workshop_id", "trace_id"])
        op.create_index("ix_discovery_comments_parent", "discovery_comments", ["parent_comment_id"])

    if not _has_table("discovery_comment_votes"):
        op.create_table(
            "discovery_comment_votes",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("workshop_id", sa.String(), sa.ForeignKey("workshops.id", ondelete="CASCADE"), nullable=False),
            sa.Column(
                "comment_id",
                sa.String(),
                sa.ForeignKey("discovery_comments.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("user_id", sa.String(), nullable=False),
            sa.Column("value", sa.Integer(), nullable=False),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index(
            "ix_discovery_comment_votes_unique",
            "discovery_comment_votes",
            ["comment_id", "user_id"],
            unique=True,
        )

    if not _has_table("discovery_agent_runs"):
        op.create_table(
            "discovery_agent_runs",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("workshop_id", sa.String(), sa.ForeignKey("workshops.id", ondelete="CASCADE"), nullable=False),
            sa.Column("trace_id", sa.String(), sa.ForeignKey("traces.id", ondelete="CASCADE"), nullable=False),
            sa.Column("milestone_ref", sa.String(), nullable=True),
            sa.Column(
                "trigger_comment_id",
                sa.String(),
                sa.ForeignKey("discovery_comments.id", ondelete="CASCADE"),
                nullable=False,
            ),
            sa.Column("status", sa.String(), nullable=False, server_default="running"),
            sa.Column("tool_calls_count", sa.Integer(), nullable=False, server_default="0"),
            sa.Column("partial_output", sa.Text(), nullable=False, server_default=""),
            sa.Column("final_output", sa.Text(), nullable=True),
            sa.Column("error", sa.Text(), nullable=True),
            sa.Column("created_by", sa.String(), nullable=False),
            sa.Column("completed_at", sa.DateTime(), nullable=True),
            sa.Column("created_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
            sa.Column("updated_at", sa.DateTime(), nullable=False, server_default=sa.func.now()),
        )
        op.create_index("ix_discovery_agent_runs_workshop_trace", "discovery_agent_runs", ["workshop_id", "trace_id"])


def downgrade() -> None:
    if _has_table("discovery_agent_runs"):
        op.drop_index("ix_discovery_agent_runs_workshop_trace", table_name="discovery_agent_runs")
        op.drop_table("discovery_agent_runs")

    if _has_table("discovery_comment_votes"):
        op.drop_index("ix_discovery_comment_votes_unique", table_name="discovery_comment_votes")
        op.drop_table("discovery_comment_votes")

    if _has_table("discovery_comments"):
        op.drop_index("ix_discovery_comments_parent", table_name="discovery_comments")
        op.drop_index("ix_discovery_comments_workshop_trace", table_name="discovery_comments")
        op.drop_table("discovery_comments")

    if _has_column("workshops", "discovery_followups_enabled"):
        op.drop_column("workshops", "discovery_followups_enabled")

    if _has_column("workshops", "discovery_mode"):
        op.drop_column("workshops", "discovery_mode")
