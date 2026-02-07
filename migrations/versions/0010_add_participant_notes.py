"""Add participant_notes table.

Allows SME participants to jot down notes during discovery that are
persisted in the database and displayed in the facilitator's scratch pad
during rubric creation.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


# revision identifiers, used by Alembic.
revision = "0010_add_participant_notes"
down_revision = "0009_make_users_workshop_id_nullable"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.create_table(
        "participant_notes",
        sa.Column("id", sa.String(), primary_key=True),
        sa.Column(
            "workshop_id",
            sa.String(),
            sa.ForeignKey("workshops.id", ondelete="CASCADE"),
            nullable=False,
        ),
        sa.Column(
            "user_id",
            sa.String(),
            sa.ForeignKey("users.id"),
            nullable=False,
        ),
        sa.Column(
            "trace_id",
            sa.String(),
            sa.ForeignKey("traces.id"),
            nullable=True,
        ),
        sa.Column("content", sa.Text(), nullable=False),
        sa.Column("created_at", sa.DateTime(), server_default=sa.func.now()),
        sa.Column("updated_at", sa.DateTime(), server_default=sa.func.now()),
    )
    # Index for efficient lookups by workshop + user
    op.create_index(
        "ix_participant_notes_workshop_user",
        "participant_notes",
        ["workshop_id", "user_id"],
    )

    # Add facilitator toggle to workshops table
    with op.batch_alter_table("workshops") as batch_op:
        batch_op.add_column(
            sa.Column("show_participant_notes", sa.Boolean(), server_default=sa.text("0"), nullable=False)
        )


def downgrade() -> None:
    with op.batch_alter_table("workshops") as batch_op:
        batch_op.drop_column("show_participant_notes")
    op.drop_index("ix_participant_notes_workshop_user", table_name="participant_notes")
    op.drop_table("participant_notes")
