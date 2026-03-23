"""Merge main-feature and discovery migration branches.

The migration history branched at 0005_add_jsonpath_columns into two
parallel chains (main features and discovery). This revision merges
them back into a single head so that ``alembic upgrade head`` works.

Revision ID: 0013_merge_heads
Revises: 0011_add_phase_to_participant_notes, 0012_add_discovery_feedback
Create Date: 2026-02-17
"""

from __future__ import annotations

# revision identifiers, used by Alembic.
revision = "0013_merge_heads"
down_revision = ("0011_add_phase_to_participant_notes", "0012_add_discovery_feedback")
branch_labels = None
depends_on = None


def upgrade() -> None:
    pass


def downgrade() -> None:
    pass
