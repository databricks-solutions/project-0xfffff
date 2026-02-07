"""Make users.workshop_id nullable.

Facilitator users don't belong to a specific workshop, so workshop_id
must be nullable. The baseline migration (0001) incorrectly created it
as NOT NULL. PostgreSQL deployments already had a runtime ALTER fix in
app.py; this migration fixes the schema properly for all backends
(SQLite uses batch mode / table recreation via render_as_batch=True in
env.py).
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0009_make_users_workshop_id_nullable"
down_revision = "0008_add_auto_evaluation_model"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column(
            "workshop_id",
            existing_type=sa.String(),
            nullable=True,
        )


def downgrade() -> None:
    with op.batch_alter_table("users") as batch_op:
        batch_op.alter_column(
            "workshop_id",
            existing_type=sa.String(),
            nullable=False,
        )
