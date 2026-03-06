"""Tests for draft rubric promotion and grouping — DISCOVERY_SPEC Step 3.

Covers promotion from different source types (findings, disagreements, feedback),
the suggest-groups service, group-to-rubric mapping, source traceability, and
promoter tracking.

Uses real in-memory SQLite (same pattern as test_draft_rubric_items.py).
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
    t3 = TraceDB(id="t-3", workshop_id="ws-1", input="Help", output="Sure")
    test_db.add_all([t1, t2, t3])
    test_db.commit()
    return [t1, t2, t3]


# ---------------------------------------------------------------------------
# Promotion from Different Source Types
# ---------------------------------------------------------------------------


@pytest.mark.spec("DISCOVERY_SPEC")
class TestPromoteDistilledCriteria:
    """Promoting analysis findings (distilled criteria) to draft rubric."""

    @pytest.mark.req("Facilitator can promote distilled criteria to draft rubric")
    def test_promote_finding_source_type(self, db_service, workshop, traces):
        """Creating a draft item with source_type='finding' records the source correctly."""
        data = DraftRubricItemCreate(
            text="Response should cite verifiable sources",
            source_type="finding",
            source_analysis_id="analysis-001",
            source_trace_ids=["t-1", "t-2"],
        )
        item = db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")

        assert item.source_type == "finding"
        assert item.source_analysis_id == "analysis-001"
        assert item.source_trace_ids == ["t-1", "t-2"]
        assert item.promoted_by == "f-1"
        assert item.text == "Response should cite verifiable sources"

    @pytest.mark.req("Facilitator can promote distilled criteria to draft rubric")
    def test_promote_finding_persists_and_retrieves(self, db_service, workshop, traces):
        """Finding-sourced items are retrievable after creation."""
        data = DraftRubricItemCreate(
            text="Accuracy of factual claims",
            source_type="finding",
            source_analysis_id="analysis-002",
            source_trace_ids=["t-1"],
        )
        db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")

        items = db_service.get_draft_rubric_items("ws-1")
        assert len(items) == 1
        assert items[0].source_type == "finding"
        assert items[0].source_analysis_id == "analysis-002"


@pytest.mark.spec("DISCOVERY_SPEC")
class TestPromoteDisagreementInsights:
    """Promoting disagreement insights to draft rubric."""

    @pytest.mark.req("Facilitator can promote disagreement insights to draft rubric")
    def test_promote_disagreement_source_type(self, db_service, workshop, traces):
        """Creating a draft item with source_type='disagreement' works correctly."""
        data = DraftRubricItemCreate(
            text="Rating split on tone: one found it fine, other wanted formal",
            source_type="disagreement",
            source_analysis_id="analysis-003",
            source_trace_ids=["t-1"],
        )
        item = db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")

        assert item.source_type == "disagreement"
        assert item.text == "Rating split on tone: one found it fine, other wanted formal"
        assert item.source_trace_ids == ["t-1"]

    @pytest.mark.req("Facilitator can promote disagreement insights to draft rubric")
    def test_disagreement_item_editable_after_promotion(self, db_service, workshop, traces):
        """Disagreement-sourced items can be edited post-promotion."""
        data = DraftRubricItemCreate(
            text="Original disagreement text",
            source_type="disagreement",
            source_trace_ids=["t-2"],
        )
        item = db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")

        updated = db_service.update_draft_rubric_item(
            item.id, DraftRubricItemUpdate(text="Refined disagreement insight")
        )
        assert updated.text == "Refined disagreement insight"
        assert updated.source_type == "disagreement"


@pytest.mark.spec("DISCOVERY_SPEC")
class TestPromoteRawFeedback:
    """Promoting raw participant feedback to draft rubric."""

    @pytest.mark.req("Facilitator can promote raw participant feedback to draft rubric")
    def test_promote_feedback_source_type(self, db_service, workshop, traces):
        """Creating a draft item with source_type='feedback' from a participant comment."""
        data = DraftRubricItemCreate(
            text="The chatbot should ask clarifying questions before answering",
            source_type="feedback",
            source_trace_ids=["t-1"],
        )
        item = db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")

        assert item.source_type == "feedback"
        assert item.source_trace_ids == ["t-1"]
        assert item.promoted_by == "f-1"

    @pytest.mark.req("Facilitator can promote raw participant feedback to draft rubric")
    def test_all_source_types_coexist(self, db_service, workshop, traces):
        """Items from all source types can coexist in the same workshop."""
        for source_type in ["finding", "disagreement", "feedback", "manual"]:
            data = DraftRubricItemCreate(
                text=f"Item from {source_type}",
                source_type=source_type,
            )
            db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")

        items = db_service.get_draft_rubric_items("ws-1")
        assert len(items) == 4
        source_types = {i.source_type for i in items}
        assert source_types == {"finding", "disagreement", "feedback", "manual"}


# ---------------------------------------------------------------------------
# Suggest Groups — Returns LLM proposal without persisting
# ---------------------------------------------------------------------------


@pytest.mark.spec("DISCOVERY_SPEC")
class TestSuggestGroupsService:
    """Tests for the DraftRubricGroupingService.suggest_groups method."""

    @pytest.mark.req('"Suggest Groups" returns LLM proposal without persisting')
    def test_fallback_grouping_returns_proposal(self, db_service, workshop):
        """When LLM is unavailable, fallback groups all items together."""
        from server.services.draft_rubric_grouping_service import DraftRubricGroupingService

        # Create some draft items
        items = []
        for text in ["Accuracy", "Completeness", "Tone"]:
            data = DraftRubricItemCreate(text=text, source_type="manual")
            items.append(db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1"))

        result = DraftRubricGroupingService._fallback_grouping(items)

        assert len(result) == 1
        assert result[0]["name"] == "All Draft Items"
        assert len(result[0]["item_ids"]) == 3
        assert set(result[0]["item_ids"]) == {i.id for i in items}

    @pytest.mark.req('"Suggest Groups" returns LLM proposal without persisting')
    def test_suggest_groups_does_not_persist(self, test_db, db_service, workshop):
        """suggest_groups returns proposal without changing DB state."""
        from server.services.draft_rubric_grouping_service import DraftRubricGroupingService

        # Create items
        items = []
        for text in ["Item A", "Item B"]:
            data = DraftRubricItemCreate(text=text, source_type="manual")
            items.append(db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1"))

        service = DraftRubricGroupingService(test_db)
        proposal = service.suggest_groups("ws-1", items)

        # Proposal should exist
        assert len(proposal) >= 1

        # DB items should still be ungrouped
        db_items = db_service.get_draft_rubric_items("ws-1")
        for item in db_items:
            assert item.group_id is None
            assert item.group_name is None

    @pytest.mark.req('"Suggest Groups" returns LLM proposal without persisting')
    def test_suggest_groups_empty_items(self, test_db, workshop):
        """suggest_groups with empty list returns empty proposal."""
        from server.services.draft_rubric_grouping_service import DraftRubricGroupingService

        service = DraftRubricGroupingService(test_db)
        result = service.suggest_groups("ws-1", [])
        assert result == []


# ---------------------------------------------------------------------------
# Apply Group Proposal
# ---------------------------------------------------------------------------


@pytest.mark.spec("DISCOVERY_SPEC")
class TestApplyGroupProposal:
    """Tests for reviewing, adjusting, and applying group proposals."""

    @pytest.mark.req("Facilitator can review, adjust, and apply group proposal")
    def test_apply_groups_persists_assignments(self, db_service, workshop):
        """Applying a group proposal updates group_id and group_name on items."""
        items = []
        for text in ["Accuracy", "Completeness", "Tone"]:
            data = DraftRubricItemCreate(text=text, source_type="manual")
            items.append(db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1"))

        groups = [
            {"name": "Content Quality", "item_ids": [items[0].id, items[1].id]},
            {"name": "Communication", "item_ids": [items[2].id]},
        ]
        db_service.apply_draft_rubric_groups("ws-1", groups)

        updated = db_service.get_draft_rubric_items("ws-1")
        by_id = {i.id: i for i in updated}

        assert by_id[items[0].id].group_name == "Content Quality"
        assert by_id[items[1].id].group_name == "Content Quality"
        assert by_id[items[2].id].group_name == "Communication"
        # Items in the same group share a group_id
        assert by_id[items[0].id].group_id == by_id[items[1].id].group_id
        # Different groups have different group_ids
        assert by_id[items[0].id].group_id != by_id[items[2].id].group_id

    @pytest.mark.req("Facilitator can review, adjust, and apply group proposal")
    def test_apply_adjusted_groups(self, db_service, workshop):
        """Facilitator can modify a proposal before applying (different grouping)."""
        items = []
        for text in ["A", "B", "C", "D"]:
            data = DraftRubricItemCreate(text=text, source_type="manual")
            items.append(db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1"))

        # Simulate facilitator adjusting the LLM proposal before applying
        adjusted_groups = [
            {"name": "Group X", "item_ids": [items[0].id, items[2].id]},
            {"name": "Group Y", "item_ids": [items[1].id, items[3].id]},
        ]
        db_service.apply_draft_rubric_groups("ws-1", adjusted_groups)

        updated = db_service.get_draft_rubric_items("ws-1")
        by_id = {i.id: i for i in updated}

        assert by_id[items[0].id].group_name == "Group X"
        assert by_id[items[2].id].group_name == "Group X"
        assert by_id[items[1].id].group_name == "Group Y"
        assert by_id[items[3].id].group_name == "Group Y"


# ---------------------------------------------------------------------------
# Manual Grouping
# ---------------------------------------------------------------------------


@pytest.mark.spec("DISCOVERY_SPEC")
class TestManualGrouping:
    """Tests for manual group creation, naming, and item movement."""

    @pytest.mark.req("Manual grouping: create groups, name them, move items between groups")
    def test_create_group_by_updating_items(self, db_service, workshop):
        """Manually create a group by setting group_id and group_name on items."""
        data = DraftRubricItemCreate(text="Test item", source_type="manual")
        item = db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")

        updated = db_service.update_draft_rubric_item(
            item.id, DraftRubricItemUpdate(group_id="manual-g1", group_name="My Custom Group")
        )
        assert updated.group_id == "manual-g1"
        assert updated.group_name == "My Custom Group"

    @pytest.mark.req("Manual grouping: create groups, name them, move items between groups")
    def test_move_item_between_groups(self, db_service, workshop):
        """Move an item from one group to another by updating group fields."""
        data = DraftRubricItemCreate(text="Movable item", source_type="manual")
        item = db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")

        # Assign to first group
        db_service.update_draft_rubric_item(
            item.id, DraftRubricItemUpdate(group_id="g-1", group_name="Group A")
        )
        # Move to second group
        updated = db_service.update_draft_rubric_item(
            item.id, DraftRubricItemUpdate(group_id="g-2", group_name="Group B")
        )

        assert updated.group_id == "g-2"
        assert updated.group_name == "Group B"

    @pytest.mark.req("Manual grouping: create groups, name them, move items between groups")
    def test_rename_group_via_item_update(self, db_service, workshop):
        """Rename a group by updating group_name on items within it."""
        items = []
        for text in ["Item 1", "Item 2"]:
            data = DraftRubricItemCreate(text=text, source_type="manual")
            items.append(db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1"))

        # Put both in a group
        for item in items:
            db_service.update_draft_rubric_item(
                item.id, DraftRubricItemUpdate(group_id="g-1", group_name="Original Name")
            )

        # Rename by updating group_name
        for item in items:
            db_service.update_draft_rubric_item(
                item.id, DraftRubricItemUpdate(group_name="Renamed Group")
            )

        updated = db_service.get_draft_rubric_items("ws-1")
        for u in updated:
            assert u.group_name == "Renamed Group"


# ---------------------------------------------------------------------------
# Group → Rubric Question Mapping
# ---------------------------------------------------------------------------


@pytest.mark.spec("DISCOVERY_SPEC")
class TestGroupToRubricMapping:
    """Each group maps to one rubric question; group name = question title."""

    @pytest.mark.req("Each group maps to one rubric question (group name = question title)")
    def test_group_name_serves_as_question_title(self, db_service, workshop):
        """Items in a group share the same group_name which becomes the rubric question title."""
        items = []
        for text in ["Cites sources", "Provides references", "Evidence-based"]:
            data = DraftRubricItemCreate(text=text, source_type="finding")
            items.append(db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1"))

        groups = [
            {"name": "Response Accuracy", "item_ids": [i.id for i in items]},
        ]
        db_service.apply_draft_rubric_groups("ws-1", groups)

        updated = db_service.get_draft_rubric_items("ws-1")
        # All items in the group share the same group_name
        group_names = {i.group_name for i in updated}
        assert group_names == {"Response Accuracy"}
        # All items share the same group_id
        group_ids = {i.group_id for i in updated}
        assert len(group_ids) == 1
        assert None not in group_ids

    @pytest.mark.req("Each group maps to one rubric question (group name = question title)")
    def test_multiple_groups_map_to_separate_questions(self, db_service, workshop):
        """Multiple groups create multiple distinct rubric questions."""
        items = []
        for text in ["Item A", "Item B", "Item C", "Item D"]:
            data = DraftRubricItemCreate(text=text, source_type="manual")
            items.append(db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1"))

        groups = [
            {"name": "Accuracy", "item_ids": [items[0].id, items[1].id]},
            {"name": "Tone", "item_ids": [items[2].id, items[3].id]},
        ]
        db_service.apply_draft_rubric_groups("ws-1", groups)

        updated = db_service.get_draft_rubric_items("ws-1")
        by_group = {}
        for i in updated:
            by_group.setdefault(i.group_name, []).append(i)

        assert set(by_group.keys()) == {"Accuracy", "Tone"}
        assert len(by_group["Accuracy"]) == 2
        assert len(by_group["Tone"]) == 2


# ---------------------------------------------------------------------------
# Draft Rubric Items Available During Rubric Creation Phase
# ---------------------------------------------------------------------------


@pytest.mark.spec("DISCOVERY_SPEC")
class TestDraftItemsAvailability:
    """Draft rubric items persist and are accessible for the Rubric Creation phase."""

    @pytest.mark.req("Draft rubric items available during Rubric Creation phase")
    def test_items_persist_across_queries(self, db_service, workshop):
        """Items created during Discovery are retrievable (simulating Rubric Creation access)."""
        # Simulate discovery-phase creation
        for text in ["Criterion 1", "Criterion 2", "Criterion 3"]:
            data = DraftRubricItemCreate(text=text, source_type="finding")
            db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")

        # Apply groups
        items = db_service.get_draft_rubric_items("ws-1")
        groups = [{"name": "Quality", "item_ids": [i.id for i in items]}]
        db_service.apply_draft_rubric_groups("ws-1", groups)

        # Simulate rubric creation phase query
        rubric_items = db_service.get_draft_rubric_items("ws-1")
        assert len(rubric_items) == 3
        for item in rubric_items:
            assert item.group_name == "Quality"
            assert item.text.startswith("Criterion")


# ---------------------------------------------------------------------------
# Source Traceability
# ---------------------------------------------------------------------------


@pytest.mark.spec("DISCOVERY_SPEC")
class TestSourceTraceability:
    """Source traceability: which traces support each draft rubric item."""

    @pytest.mark.req("Source traceability maintained (which traces support each item)")
    def test_source_trace_ids_stored(self, db_service, workshop, traces):
        """Items store the trace IDs that generated/support them."""
        data = DraftRubricItemCreate(
            text="Response uses appropriate tone",
            source_type="finding",
            source_trace_ids=["t-1", "t-2", "t-3"],
        )
        item = db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")

        assert item.source_trace_ids == ["t-1", "t-2", "t-3"]

        # Verify persistence via get
        retrieved = db_service.get_draft_rubric_items("ws-1")
        assert retrieved[0].source_trace_ids == ["t-1", "t-2", "t-3"]

    @pytest.mark.req("Source traceability maintained (which traces support each item)")
    def test_empty_trace_ids_default(self, db_service, workshop):
        """Manual items without traces default to an empty trace list."""
        data = DraftRubricItemCreate(
            text="Manually added criterion",
            source_type="manual",
        )
        item = db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")

        assert item.source_trace_ids == []


# ---------------------------------------------------------------------------
# Draft Rubric Items Track Promotion Source and Promoter
# ---------------------------------------------------------------------------


@pytest.mark.spec("DISCOVERY_SPEC")
class TestPromotionTracking:
    """Items track who promoted them and from what source."""

    @pytest.mark.req("Draft rubric items track promotion source and promoter")
    def test_promoted_by_field_stored(self, db_service, workshop):
        """Each item records the user who promoted it."""
        data = DraftRubricItemCreate(text="Criterion A", source_type="finding")
        item = db_service.add_draft_rubric_item("ws-1", data, promoted_by="facilitator-abc")

        assert item.promoted_by == "facilitator-abc"

    @pytest.mark.req("Draft rubric items track promotion source and promoter")
    def test_source_type_and_analysis_id_tracked(self, db_service, workshop):
        """Items record source_type and source_analysis_id for traceability."""
        data = DraftRubricItemCreate(
            text="Criterion from disagreement",
            source_type="disagreement",
            source_analysis_id="analysis-xyz",
        )
        item = db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")

        assert item.source_type == "disagreement"
        assert item.source_analysis_id == "analysis-xyz"

    @pytest.mark.req("Draft rubric items track promotion source and promoter")
    def test_promoted_at_timestamp_set(self, db_service, workshop):
        """Items have a promoted_at timestamp set automatically."""
        data = DraftRubricItemCreate(text="Criterion B", source_type="manual")
        item = db_service.add_draft_rubric_item("ws-1", data, promoted_by="f-1")

        assert item.promoted_at is not None
