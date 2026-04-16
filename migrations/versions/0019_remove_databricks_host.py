"""Remove databricks_host from mlflow_intake_config.

The app now uses DATABRICKS_HOST from the environment (set by the Databricks
Apps platform) instead of a user-provided value stored in the database.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0019_remove_databricks_host"
down_revision = "0018_add_summarization_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("mlflow_intake_config") as batch_op:
        batch_op.drop_column("databricks_host")


def downgrade() -> None:
    with op.batch_alter_table("mlflow_intake_config") as batch_op:
        batch_op.add_column(
            sa.Column("databricks_host", sa.String(), nullable=True, server_default="")
        )
