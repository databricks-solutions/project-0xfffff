"""Remove legacy app-owned password auth columns.

V2 resolves users through provider identity instead of app-owned login.
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0024_remove_legacy_password_auth"
down_revision = "0023_add_project_setup_tables"
branch_labels = None
depends_on = None


def _has_table(table_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return table_name in inspector.get_table_names()


def _has_column(table_name: str, column_name: str) -> bool:
    bind = op.get_bind()
    inspector = sa.inspect(bind)
    return any(column["name"] == column_name for column in inspector.get_columns(table_name))


def upgrade() -> None:
    if _has_table("users") and _has_column("users", "password_hash"):
        op.drop_column("users", "password_hash")
    if _has_table("facilitator_configs"):
        op.drop_table("facilitator_configs")


def downgrade() -> None:
    if _has_table("users") and not _has_column("users", "password_hash"):
        op.add_column("users", sa.Column("password_hash", sa.String(), nullable=True))
    if not _has_table("facilitator_configs"):
        op.create_table(
            "facilitator_configs",
            sa.Column("id", sa.String(), primary_key=True),
            sa.Column("email", sa.String(), nullable=False),
            sa.Column("password_hash", sa.String(), nullable=False),
            sa.Column("name", sa.String(), nullable=False),
            sa.Column("description", sa.Text(), nullable=True),
            sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
            sa.UniqueConstraint("email"),
        )

