"""Add phase column to participant_notes table.

Supports distinguishing between discovery-phase and annotation-phase notes
so annotators can also add notes that appear in the facilitator scratch pad.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0011_add_phase_to_participant_notes"
down_revision = "0010_add_participant_notes"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("participant_notes") as batch_op:
        batch_op.add_column(
            sa.Column("phase", sa.String(), server_default="discovery", nullable=False)
        )


def downgrade() -> None:
    with op.batch_alter_table("participant_notes") as batch_op:
        batch_op.drop_column("phase")
