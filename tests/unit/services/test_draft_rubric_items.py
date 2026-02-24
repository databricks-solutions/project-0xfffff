"""Tests for draft rubric items CRUD in DatabaseService.

Covers creation, listing, update, delete, group apply/clear,
and phase gate validation per DISCOVERY_SPEC Step 3.

Uses real in-memory SQLite (same pattern as test_database_service_feedback.py).
"""

import pytest
from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker

from server.database import (
    Base,
    DraftRubricItemDB,
    TraceDB,
    WorkshopDB,
)
from server.models import (
    DraftRubricItem,
    DraftRubricItemCreate,
    DraftRubricItemUpdate,
)
from server.services.database_service import DatabaseService


# ---------------------------------------------------------------------------
# Fixtures
# ---------------------------------------------------------------------------


@pytest.fixture
def test_db():
    """Create an in-memory SQLite database for testing."""
    engine = create_engine("sqlite:///:memory:")
    Base.metadata.create_all(engine)
    Session = sessionmaker(bind=engine)
    session = Session()
    yield session
    session.close()


@pytest.fixture
def db_service(test_db):
    return DatabaseService(test_db)


@pytest.fixture
def workshop(test_db):
    ws = WorkshopDB(
        id="ws-1",
        name="Test Workshop",
        facilitator_id="f-1",
    )
    test_db.add(ws)
    test_db.commit()
    return ws


@pytest.fixture
def traces(test_db, workshop):
    t1 = TraceDB(id="t-1", workshop_id="ws-1", input="Hello", output="Hi")
    t2 = TraceDB(id="t-2", workshop_id="ws-1", input="Bye", output="Later")
    test_db.add_all([t1, t2])
    test_db.commit()
    return [t1, t2]


# ---------------------------------------------------------------------------
# Tests
# ---------------------------------------------------------------------------


@pytest.mark.spec("DISCOVERY_SPEC")
class TestDraftRubricItemsCRUD:
    """@req DI-S3-CRUD: Draft rubric items can be created, read, updated, deleted."""

    @pytest.mark.req("Facilitator can manually add draft rubric items")
    def test_create_draft_rubric_item(self, db_service, workshop):
        """@req DI-S3-CREATE: Facilitator can add a draft rubric item."""
        data = DraftRubricItemCreate(
            text="Does the response cite sources?",
            source_type="manual",
        )
        item = db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")

        assert isinstance(item, DraftRubricItem)
        assert item.text == "Does the response cite sources?"
        assert item.source_type == "manual"
        assert item.promoted_by == "f-1"
        assert item.workshop_id == "ws-1"
        assert item.group_id is None
        assert item.group_name is None

    @pytest.mark.req("Source traceability maintained (which traces support each item)")
    def test_create_item_with_source_metadata(self, db_service, workshop):
        """@req DI-S3-SOURCE: Items track promotion source type and trace IDs."""
        data = DraftRubricItemCreate(
            text="Tone is appropriate",
            source_type="feedback",
            source_trace_ids=["t-1", "t-2"],
        )
        item = db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")

        assert item.source_type == "feedback"
        assert item.source_trace_ids == ["t-1", "t-2"]

    @pytest.mark.req("Draft rubric items available during Rubric Creation phase")
    def test_list_draft_rubric_items(self, db_service, workshop):
        """@req DI-S3-LIST: All items for a workshop can be retrieved."""
        for text in ["Item A", "Item B", "Item C"]:
            data = DraftRubricItemCreate(text=text, source_type="manual")
            db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")

        items = db_service.get_draft_rubric_items("ws-1")
        assert len(items) == 3
        assert all(isinstance(i, DraftRubricItem) for i in items)

    @pytest.mark.req("Draft rubric items available during Rubric Creation phase")
    def test_list_items_empty_workshop(self, db_service, workshop):
        """Listing items for a workshop with no items returns empty list."""
        items = db_service.get_draft_rubric_items("ws-1")
        assert items == []

    @pytest.mark.req("Draft rubric items editable and removable")
    def test_update_text(self, db_service, workshop):
        """@req DI-S3-EDIT: Draft rubric items are editable."""
        data = DraftRubricItemCreate(text="Original", source_type="manual")
        item = db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")

        updates = DraftRubricItemUpdate(text="Updated text")
        updated = db_service.update_draft_rubric_item(item.id, updates)

        assert updated is not None
        assert updated.text == "Updated text"

    @pytest.mark.req("Each group maps to one rubric question (group name = question title)")
    def test_update_group_fields(self, db_service, workshop):
        """@req DI-S3-GROUP: Items can be assigned to groups."""
        data = DraftRubricItemCreate(text="Item", source_type="manual")
        item = db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")

        updates = DraftRubricItemUpdate(group_id="g-1", group_name="Accuracy")
        updated = db_service.update_draft_rubric_item(item.id, updates)

        assert updated.group_id == "g-1"
        assert updated.group_name == "Accuracy"

    @pytest.mark.req("Draft rubric items editable and removable")
    def test_update_nonexistent_item(self, db_service, workshop):
        """Updating a nonexistent item returns None."""
        updates = DraftRubricItemUpdate(text="x")
        result = db_service.update_draft_rubric_item("nonexistent", updates)
        assert result is None

    @pytest.mark.req("Draft rubric items editable and removable")
    def test_delete_draft_rubric_item(self, db_service, workshop):
        """@req DI-S3-DELETE: Draft rubric items can be removed."""
        data = DraftRubricItemCreate(text="To delete", source_type="manual")
        item = db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")

        deleted = db_service.delete_draft_rubric_item(item.id)
        assert deleted is True

        items = db_service.get_draft_rubric_items("ws-1")
        assert len(items) == 0

    @pytest.mark.req("Draft rubric items editable and removable")
    def test_delete_nonexistent_item(self, db_service, workshop):
        """Deleting a nonexistent item returns False."""
        deleted = db_service.delete_draft_rubric_item("nonexistent")
        assert deleted is False


@pytest.mark.spec("DISCOVERY_SPEC")
class TestDraftRubricGrouping:
    """@req DI-S3-GROUPING: Items can be organized into groups."""

    @pytest.mark.req("Facilitator can review, adjust, and apply group proposal")
    def test_apply_groups(self, db_service, workshop):
        """@req DI-S3-APPLY: apply_draft_rubric_groups persists group assignments."""
        items = []
        for text in ["Accuracy", "Completeness", "Tone"]:
            data = DraftRubricItemCreate(text=text, source_type="manual")
            items.append(db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1"))

        groups = [
            {"name": "Content Quality", "item_ids": [items[0].id, items[1].id]},
            {"name": "Communication", "item_ids": [items[2].id]},
        ]
        db_service.apply_draft_rubric_groups("ws-1", groups)

        updated_items = db_service.get_draft_rubric_items("ws-1")
        grouped = {i.id: i for i in updated_items}

        # Items 0 and 1 should be in "Content Quality"
        assert grouped[items[0].id].group_name == "Content Quality"
        assert grouped[items[1].id].group_name == "Content Quality"
        assert grouped[items[0].id].group_id == grouped[items[1].id].group_id

        # Item 2 should be in "Communication"
        assert grouped[items[2].id].group_name == "Communication"

    @pytest.mark.req("Facilitator can review, adjust, and apply group proposal")
    def test_apply_groups_clears_previous(self, db_service, workshop):
        """@req DI-S3-REGROUP: Applying new groups clears previous assignments."""
        data = DraftRubricItemCreate(text="Item", source_type="manual")
        item = db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")

        # First grouping
        db_service.apply_draft_rubric_groups(
            "ws-1", [{"name": "Group A", "item_ids": [item.id]}]
        )
        items = db_service.get_draft_rubric_items("ws-1")
        assert items[0].group_name == "Group A"

        # Second grouping - should replace
        db_service.apply_draft_rubric_groups(
            "ws-1", [{"name": "Group B", "item_ids": [item.id]}]
        )
        items = db_service.get_draft_rubric_items("ws-1")
        assert items[0].group_name == "Group B"

    @pytest.mark.req("Manual grouping: create groups, name them, move items between groups")
    def test_apply_empty_groups_clears_all(self, db_service, workshop):
        """Applying empty groups list clears all group assignments."""
        data = DraftRubricItemCreate(text="Item", source_type="manual")
        item = db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")

        db_service.apply_draft_rubric_groups(
            "ws-1", [{"name": "G", "item_ids": [item.id]}]
        )
        db_service.apply_draft_rubric_groups("ws-1", [])

        items = db_service.get_draft_rubric_items("ws-1")
        assert items[0].group_id is None
        assert items[0].group_name is None


@pytest.mark.spec("DISCOVERY_SPEC")
class TestSourceTypeValidation:
    """@req DI-S3-SOURCE-TYPES: Items support multiple source types."""

    @pytest.mark.req("Draft rubric items track promotion source and promoter")
    @pytest.mark.parametrize("source_type", ["finding", "disagreement", "feedback", "manual"])
    def test_valid_source_types(self, db_service, workshop, source_type):
        """@req DI-S3-SOURCE: All four source types are accepted."""
        data = DraftRubricItemCreate(text=f"From {source_type}", source_type=source_type)
        item = db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")
        assert item.source_type == source_type

    @pytest.mark.req("Facilitator can promote distilled criteria to draft rubric")
    def test_source_analysis_id(self, db_service, workshop):
        """@req DI-S3-ANALYSIS: Items can reference a source analysis."""
        data = DraftRubricItemCreate(
            text="From analysis",
            source_type="finding",
            source_analysis_id="analysis-123",
        )
        item = db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")
        assert item.source_analysis_id == "analysis-123"
