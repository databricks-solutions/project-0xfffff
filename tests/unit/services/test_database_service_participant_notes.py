"""Tests for participant notes in DatabaseService.

Tests the service-layer CRUD operations for participant notes,
including phase-aware filtering and the append-only behavior.
"""

from datetime import datetime
from unittest.mock import MagicMock, patch

import pytest

from server.models import ParticipantNote, ParticipantNoteCreate
from server.services.database_service import DatabaseService


def make_mock_note_db(
    note_id: str = "note-1",
    workshop_id: str = "ws-1",
    user_id: str = "sme-1",
    trace_id: str | None = "trace-1",
    content: str = "Test note",
    phase: str = "discovery",
):
    """Create a mock ParticipantNoteDB object."""
    mock = MagicMock()
    mock.id = note_id
    mock.workshop_id = workshop_id
    mock.user_id = user_id
    mock.trace_id = trace_id
    mock.content = content
    mock.phase = phase
    mock.created_at = datetime.now()
    mock.updated_at = datetime.now()
    return mock


def make_mock_user_db(user_id: str = "sme-1", name: str = "Test SME"):
    """Create a mock UserDB object."""
    mock = MagicMock()
    mock.id = user_id
    mock.name = name
    return mock


# ============================================================================
# add_participant_note tests
# ============================================================================


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
def test_add_participant_note_discovery():
    """Test adding a discovery-phase note persists correctly."""
    mock_db = MagicMock()
    service = DatabaseService(mock_db)

    mock_user = make_mock_user_db()
    mock_db.query.return_value.filter.return_value.first.return_value = mock_user

    # After db.refresh(), the note object needs valid datetime fields.
    # We make db.refresh set these attributes on whatever object is passed in.
    def fake_refresh(obj):
        if not obj.created_at:
            obj.created_at = datetime.now()
        if not obj.updated_at:
            obj.updated_at = datetime.now()

    mock_db.refresh.side_effect = fake_refresh

    note_data = ParticipantNoteCreate(
        user_id="sme-1",
        trace_id="trace-1",
        content="Discovery note",
        phase="discovery",
    )

    with patch("server.services.database_service.uuid") as mock_uuid:
        mock_uuid.uuid4.return_value = "generated-uuid"
        result = service.add_participant_note("ws-1", note_data)

    # Verify db.add was called with a new note
    mock_db.add.assert_called_once()
    added_obj = mock_db.add.call_args[0][0]
    assert added_obj.workshop_id == "ws-1"
    assert added_obj.user_id == "sme-1"
    assert added_obj.content == "Discovery note"
    assert added_obj.phase == "discovery"

    # Verify commit and refresh were called
    mock_db.commit.assert_called_once()
    mock_db.refresh.assert_called_once()

    # Verify returned ParticipantNote has correct fields
    assert result.user_name == "Test SME"
    assert result.phase == "discovery"


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
def test_add_participant_note_annotation():
    """Test adding an annotation-phase note persists the phase correctly."""
    mock_db = MagicMock()
    service = DatabaseService(mock_db)

    mock_user = make_mock_user_db()
    mock_db.query.return_value.filter.return_value.first.return_value = mock_user

    def fake_refresh(obj):
        if not obj.created_at:
            obj.created_at = datetime.now()
        if not obj.updated_at:
            obj.updated_at = datetime.now()

    mock_db.refresh.side_effect = fake_refresh

    note_data = ParticipantNoteCreate(
        user_id="sme-1",
        trace_id="trace-1",
        content="Annotation observation",
        phase="annotation",
    )

    with patch("server.services.database_service.uuid") as mock_uuid:
        mock_uuid.uuid4.return_value = "generated-uuid"
        result = service.add_participant_note("ws-1", note_data)

    added_obj = mock_db.add.call_args[0][0]
    assert added_obj.phase == "annotation"
    assert result.phase == "annotation"


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
def test_add_participant_note_without_trace():
    """Test adding a general note (no trace_id)."""
    mock_db = MagicMock()
    service = DatabaseService(mock_db)

    mock_user = make_mock_user_db()
    mock_db.query.return_value.filter.return_value.first.return_value = mock_user

    def fake_refresh(obj):
        if not obj.created_at:
            obj.created_at = datetime.now()
        if not obj.updated_at:
            obj.updated_at = datetime.now()

    mock_db.refresh.side_effect = fake_refresh

    note_data = ParticipantNoteCreate(
        user_id="sme-1",
        trace_id=None,
        content="General observation",
    )

    with patch("server.services.database_service.uuid") as mock_uuid:
        mock_uuid.uuid4.return_value = "generated-uuid"
        result = service.add_participant_note("ws-1", note_data)

    added_obj = mock_db.add.call_args[0][0]
    assert added_obj.trace_id is None


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
def test_add_participant_note_always_creates_new():
    """Test that add_participant_note always creates a new entry (append behavior)."""
    mock_db = MagicMock()
    service = DatabaseService(mock_db)

    mock_user = make_mock_user_db()
    mock_db.query.return_value.filter.return_value.first.return_value = mock_user

    def fake_refresh(obj):
        if not obj.created_at:
            obj.created_at = datetime.now()
        if not obj.updated_at:
            obj.updated_at = datetime.now()

    mock_db.refresh.side_effect = fake_refresh

    note_data = ParticipantNoteCreate(
        user_id="sme-1",
        trace_id="trace-1",
        content="First note",
    )

    with patch("server.services.database_service.uuid") as mock_uuid:
        mock_uuid.uuid4.side_effect = ["uuid-1", "uuid-2"]
        service.add_participant_note("ws-1", note_data)
        note_data2 = ParticipantNoteCreate(
            user_id="sme-1",
            trace_id="trace-1",
            content="Second note",
        )
        service.add_participant_note("ws-1", note_data2)

    # db.add should have been called twice (not an upsert)
    assert mock_db.add.call_count == 2
    assert mock_db.commit.call_count == 2


# ============================================================================
# get_participant_notes tests
# ============================================================================


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
def test_get_participant_notes_no_filters():
    """Test getting all notes without any filters."""
    mock_db = MagicMock()
    service = DatabaseService(mock_db)

    mock_note = make_mock_note_db()
    mock_user = make_mock_user_db()

    # Set up query chain
    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.outerjoin.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.order_by.return_value = mock_query
    mock_query.all.return_value = [(mock_note, mock_user)]

    result = service.get_participant_notes("ws-1")

    assert len(result) == 1
    assert result[0].id == "note-1"
    assert result[0].user_name == "Test SME"
    assert result[0].phase == "discovery"


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
def test_get_participant_notes_filtered_by_user():
    """Test getting notes filtered by user_id."""
    mock_db = MagicMock()
    service = DatabaseService(mock_db)

    mock_note = make_mock_note_db(user_id="sme-1")
    mock_user = make_mock_user_db(user_id="sme-1")

    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.outerjoin.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.order_by.return_value = mock_query
    mock_query.all.return_value = [(mock_note, mock_user)]

    result = service.get_participant_notes("ws-1", user_id="sme-1")

    assert len(result) == 1
    # filter should have been called twice: once for workshop_id, once for user_id
    assert mock_query.filter.call_count == 2


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
def test_get_participant_notes_filtered_by_phase():
    """Test getting notes filtered by phase."""
    mock_db = MagicMock()
    service = DatabaseService(mock_db)

    mock_note = make_mock_note_db(phase="annotation")
    mock_user = make_mock_user_db()

    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.outerjoin.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.order_by.return_value = mock_query
    mock_query.all.return_value = [(mock_note, mock_user)]

    result = service.get_participant_notes("ws-1", phase="annotation")

    assert len(result) == 1
    assert result[0].phase == "annotation"
    # filter called twice: once for workshop_id, once for phase
    assert mock_query.filter.call_count == 2


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
def test_get_participant_notes_filtered_by_user_and_phase():
    """Test getting notes filtered by both user_id and phase."""
    mock_db = MagicMock()
    service = DatabaseService(mock_db)

    mock_note = make_mock_note_db(user_id="sme-1", phase="annotation")
    mock_user = make_mock_user_db(user_id="sme-1")

    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.outerjoin.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.order_by.return_value = mock_query
    mock_query.all.return_value = [(mock_note, mock_user)]

    result = service.get_participant_notes("ws-1", user_id="sme-1", phase="annotation")

    assert len(result) == 1
    # filter called three times: workshop_id, user_id, phase
    assert mock_query.filter.call_count == 3


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
def test_get_participant_notes_empty_result():
    """Test getting notes when none exist."""
    mock_db = MagicMock()
    service = DatabaseService(mock_db)

    mock_query = MagicMock()
    mock_db.query.return_value = mock_query
    mock_query.outerjoin.return_value = mock_query
    mock_query.filter.return_value = mock_query
    mock_query.order_by.return_value = mock_query
    mock_query.all.return_value = []

    result = service.get_participant_notes("ws-1")

    assert len(result) == 0


# ============================================================================
# delete_participant_note tests
# ============================================================================


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
def test_delete_participant_note_success():
    """Test deleting an existing note returns True."""
    mock_db = MagicMock()
    service = DatabaseService(mock_db)

    mock_note = make_mock_note_db()
    mock_db.query.return_value.filter.return_value.first.return_value = mock_note

    result = service.delete_participant_note("note-1")

    assert result is True
    mock_db.delete.assert_called_once_with(mock_note)
    mock_db.commit.assert_called_once()


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
def test_delete_participant_note_not_found():
    """Test deleting a non-existent note returns False."""
    mock_db = MagicMock()
    service = DatabaseService(mock_db)

    mock_db.query.return_value.filter.return_value.first.return_value = None

    result = service.delete_participant_note("nonexistent")

    assert result is False
    mock_db.delete.assert_not_called()
    mock_db.commit.assert_not_called()
