"""Add event log column to discovery_agent_runs.

Adds:
- discovery_agent_runs.events (JSON)
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0022_add_discovery_agent_run_events"
down_revision = "0021_add_discovery_social_thread_tables"
branch_labels = None
depends_on = None


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(col["name"] == column_name for col in inspector.get_columns(table_name))


def upgrade() -> None:
    if not _has_column("discovery_agent_runs", "events"):
        op.add_column(
            "discovery_agent_runs",
            sa.Column("events", sa.JSON(), nullable=False, server_default="[]"),
        )


def downgrade() -> None:
    if _has_column("discovery_agent_runs", "events"):
        op.drop_column("discovery_agent_runs", "events")

