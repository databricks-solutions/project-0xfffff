"""Add rationales dict and legacy_comment archive columns to annotations.

Adds:
- `rationales` (JSON, nullable): per-question rationale dict keyed by rubric question_id.
  Parallels the existing `ratings` column. Populated going forward by the per-question
  "Why this rating?" textareas in AnnotationDemo.tsx.
- `legacy_comment` (Text, nullable): one-time archival snapshot of the pre-Fix-1 `comment`
  for existing rows. Backfilled at migration time. Never written at runtime afterward;
  the frontend reads it to display a reference banner when editing pre-Fix-1 annotations.

The backfill copies `comment` → `legacy_comment` for every row with a non-null comment.
The `comment` column itself is untouched by this migration. Going forward, `comment`
serves as the freeform-answers packing container only (no per-question rationale text).
"""

from __future__ import annotations

import sqlalchemy as sa
from alembic import op

# revision identifiers, used by Alembic.
revision = "0019_add_annotation_rationales"
down_revision = "0018_add_summarization_jobs"
branch_labels = None
depends_on = None


def upgrade() -> None:
    op.add_column(
        "annotations",
        sa.Column("rationales", sa.JSON(), nullable=True),
    )
    op.add_column(
        "annotations",
        sa.Column("legacy_comment", sa.Text(), nullable=True),
    )

    # Backfill legacy_comment from existing comment values so the frontend can
    # display the pre-Fix-1 cross-judge feedback as a reference banner.
    op.execute(
        """
        UPDATE annotations
        SET legacy_comment = comment
        WHERE comment IS NOT NULL
          AND legacy_comment IS NULL
        """
    )


def downgrade() -> None:
    op.drop_column("annotations", "legacy_comment")
    op.drop_column("annotations", "rationales")
