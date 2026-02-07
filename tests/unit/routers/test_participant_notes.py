"""
Tests for participant notes feature.

Covers:
- Creating notes (discovery and annotation phases)
- Retrieving notes (all, by user, by phase)
- Deleting notes
- Toggle show_participant_notes flag
- 404 handling for missing workshops/notes
- Notes always append (never overwrite)
"""

from datetime import datetime
from unittest.mock import MagicMock, PropertyMock

import pytest

from server.models import (
    ParticipantNote,
    ParticipantNoteCreate,
    Workshop,
    WorkshopPhase,
    WorkshopStatus,
)


def create_test_workshop(show_notes: bool = False) -> Workshop:
    """Create a test workshop."""
    return Workshop(
        id="test-workshop",
        name="Test Workshop",
        description=None,
        facilitator_id="facilitator-1",
        status=WorkshopStatus.ACTIVE,
        current_phase=WorkshopPhase.DISCOVERY,
        completed_phases=[],
        discovery_started=True,
        annotation_started=False,
        active_discovery_trace_ids=["trace-1", "trace-2"],
        active_annotation_trace_ids=[],
        judge_name="test_judge",
        show_participant_notes=show_notes,
        created_at=datetime.now(),
    )


def create_test_note(
    note_id: str = "note-1",
    workshop_id: str = "test-workshop",
    user_id: str = "sme-1",
    trace_id: str | None = "trace-1",
    content: str = "Test note",
    phase: str = "discovery",
    user_name: str | None = "Test User",
) -> ParticipantNote:
    """Create a test participant note."""
    return ParticipantNote(
        id=note_id,
        workshop_id=workshop_id,
        user_id=user_id,
        trace_id=trace_id,
        content=content,
        phase=phase,
        user_name=user_name,
        created_at=datetime.now(),
        updated_at=datetime.now(),
    )


# ============================================================================
# CREATE participant note tests
# ============================================================================


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_create_discovery_note(async_client, override_get_db, monkeypatch):
    """Test creating a participant note during discovery phase."""
    import server.routers.workshops as workshops_router

    workshop = create_test_workshop()
    created_note = create_test_note(phase="discovery")

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def add_participant_note(self, workshop_id: str, note_data: ParticipantNoteCreate):
            assert workshop_id == "test-workshop"
            assert note_data.user_id == "sme-1"
            assert note_data.content == "My discovery observation"
            assert note_data.phase == "discovery"
            return created_note

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.post(
        "/workshops/test-workshop/participant-notes",
        json={
            "user_id": "sme-1",
            "trace_id": "trace-1",
            "content": "My discovery observation",
            "phase": "discovery",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["id"] == "note-1"
    assert body["content"] == "Test note"
    assert body["phase"] == "discovery"


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_create_annotation_note(async_client, override_get_db, monkeypatch):
    """Test creating a participant note during annotation phase."""
    import server.routers.workshops as workshops_router

    workshop = create_test_workshop()
    created_note = create_test_note(phase="annotation", content="Annotation observation")

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def add_participant_note(self, workshop_id: str, note_data: ParticipantNoteCreate):
            assert note_data.phase == "annotation"
            assert note_data.content == "Annotation observation"
            return created_note

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.post(
        "/workshops/test-workshop/participant-notes",
        json={
            "user_id": "sme-1",
            "trace_id": "trace-1",
            "content": "Annotation observation",
            "phase": "annotation",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["phase"] == "annotation"


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_create_note_defaults_to_discovery_phase(async_client, override_get_db, monkeypatch):
    """Test that notes default to discovery phase when no phase is specified."""
    import server.routers.workshops as workshops_router

    workshop = create_test_workshop()
    created_note = create_test_note(phase="discovery")

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def add_participant_note(self, workshop_id: str, note_data: ParticipantNoteCreate):
            assert note_data.phase == "discovery"  # default
            return created_note

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.post(
        "/workshops/test-workshop/participant-notes",
        json={
            "user_id": "sme-1",
            "content": "A general note",
        },
    )
    assert resp.status_code == 200


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_create_note_without_trace_id(async_client, override_get_db, monkeypatch):
    """Test creating a general note not tied to a specific trace."""
    import server.routers.workshops as workshops_router

    workshop = create_test_workshop()
    created_note = create_test_note(trace_id=None)

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def add_participant_note(self, workshop_id: str, note_data: ParticipantNoteCreate):
            assert note_data.trace_id is None
            return created_note

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.post(
        "/workshops/test-workshop/participant-notes",
        json={
            "user_id": "sme-1",
            "content": "General note without trace",
        },
    )
    assert resp.status_code == 200
    body = resp.json()
    assert body["trace_id"] is None


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_create_note_missing_workshop_returns_404(async_client, override_get_db, monkeypatch):
    """Test that creating a note for a non-existent workshop returns 404."""
    import server.routers.workshops as workshops_router

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return None

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.post(
        "/workshops/missing-workshop/participant-notes",
        json={
            "user_id": "sme-1",
            "content": "Should fail",
        },
    )
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Workshop not found"


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_create_note_service_error_returns_500(async_client, override_get_db, monkeypatch):
    """Test that a service error when creating a note returns 500."""
    import server.routers.workshops as workshops_router

    workshop = create_test_workshop()

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def add_participant_note(self, workshop_id: str, note_data: ParticipantNoteCreate):
            raise RuntimeError("DB connection failed")

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.post(
        "/workshops/test-workshop/participant-notes",
        json={
            "user_id": "sme-1",
            "content": "Should fail",
        },
    )
    assert resp.status_code == 500
    assert "Failed to save participant note" in resp.json()["detail"]


# ============================================================================
# GET participant notes tests
# ============================================================================


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_all_notes(async_client, override_get_db, monkeypatch):
    """Test getting all notes for a workshop (facilitator view)."""
    import server.routers.workshops as workshops_router

    workshop = create_test_workshop()
    notes = [
        create_test_note(note_id="note-1", user_id="sme-1", phase="discovery"),
        create_test_note(note_id="note-2", user_id="sme-2", phase="annotation"),
        create_test_note(note_id="note-3", user_id="sme-1", phase="annotation"),
    ]

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def get_participant_notes(self, workshop_id: str, user_id=None, phase=None):
            assert workshop_id == "test-workshop"
            assert user_id is None
            assert phase is None
            return notes

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.get("/workshops/test-workshop/participant-notes")
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 3


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_notes_filtered_by_user(async_client, override_get_db, monkeypatch):
    """Test getting notes filtered by user ID."""
    import server.routers.workshops as workshops_router

    workshop = create_test_workshop()
    user_notes = [
        create_test_note(note_id="note-1", user_id="sme-1"),
    ]

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def get_participant_notes(self, workshop_id: str, user_id=None, phase=None):
            assert user_id == "sme-1"
            return user_notes

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.get(
        "/workshops/test-workshop/participant-notes?user_id=sme-1"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["user_id"] == "sme-1"


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_notes_filtered_by_discovery_phase(async_client, override_get_db, monkeypatch):
    """Test getting notes filtered by discovery phase."""
    import server.routers.workshops as workshops_router

    workshop = create_test_workshop()
    discovery_notes = [
        create_test_note(note_id="note-1", phase="discovery"),
    ]

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def get_participant_notes(self, workshop_id: str, user_id=None, phase=None):
            assert phase == "discovery"
            return discovery_notes

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.get(
        "/workshops/test-workshop/participant-notes?phase=discovery"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1
    assert body[0]["phase"] == "discovery"


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_notes_filtered_by_annotation_phase(async_client, override_get_db, monkeypatch):
    """Test getting notes filtered by annotation phase."""
    import server.routers.workshops as workshops_router

    workshop = create_test_workshop()
    annotation_notes = [
        create_test_note(note_id="note-2", phase="annotation"),
        create_test_note(note_id="note-3", phase="annotation"),
    ]

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def get_participant_notes(self, workshop_id: str, user_id=None, phase=None):
            assert phase == "annotation"
            return annotation_notes

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.get(
        "/workshops/test-workshop/participant-notes?phase=annotation"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 2
    assert all(n["phase"] == "annotation" for n in body)


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_notes_filtered_by_user_and_phase(async_client, override_get_db, monkeypatch):
    """Test getting notes filtered by both user ID and phase."""
    import server.routers.workshops as workshops_router

    workshop = create_test_workshop()
    filtered_notes = [
        create_test_note(note_id="note-1", user_id="sme-1", phase="annotation"),
    ]

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def get_participant_notes(self, workshop_id: str, user_id=None, phase=None):
            assert user_id == "sme-1"
            assert phase == "annotation"
            return filtered_notes

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.get(
        "/workshops/test-workshop/participant-notes?user_id=sme-1&phase=annotation"
    )
    assert resp.status_code == 200
    body = resp.json()
    assert len(body) == 1


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_get_notes_missing_workshop_returns_404(async_client, override_get_db, monkeypatch):
    """Test that getting notes for a non-existent workshop returns 404."""
    import server.routers.workshops as workshops_router

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return None

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.get("/workshops/missing/participant-notes")
    assert resp.status_code == 404


# ============================================================================
# DELETE participant note tests
# ============================================================================


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_delete_note_success(async_client, override_get_db, monkeypatch):
    """Test deleting a participant note."""
    import server.routers.workshops as workshops_router

    workshop = create_test_workshop()

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def delete_participant_note(self, note_id: str):
            assert note_id == "note-to-delete"
            return True

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.delete(
        "/workshops/test-workshop/participant-notes/note-to-delete"
    )
    assert resp.status_code == 200
    assert resp.json()["status"] == "deleted"


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_delete_nonexistent_note_returns_404(async_client, override_get_db, monkeypatch):
    """Test that deleting a non-existent note returns 404."""
    import server.routers.workshops as workshops_router

    workshop = create_test_workshop()

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def delete_participant_note(self, note_id: str):
            return False

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.delete(
        "/workshops/test-workshop/participant-notes/nonexistent"
    )
    assert resp.status_code == 404
    assert resp.json()["detail"] == "Note not found"


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_delete_note_missing_workshop_returns_404(async_client, override_get_db, monkeypatch):
    """Test that deleting a note from a non-existent workshop returns 404."""
    import server.routers.workshops as workshops_router

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return None

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.delete(
        "/workshops/missing/participant-notes/note-1"
    )
    assert resp.status_code == 404


# ============================================================================
# Notes always append (never overwrite) tests
# ============================================================================


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_multiple_notes_same_user_same_trace_append(async_client, override_get_db, monkeypatch):
    """Test that creating multiple notes for the same user + trace appends, not overwrites."""
    import server.routers.workshops as workshops_router

    workshop = create_test_workshop()
    saved_notes: list[ParticipantNote] = []
    note_counter = 0

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def add_participant_note(self, workshop_id: str, note_data: ParticipantNoteCreate):
            nonlocal note_counter
            note_counter += 1
            note = create_test_note(
                note_id=f"note-{note_counter}",
                user_id=note_data.user_id,
                trace_id=note_data.trace_id,
                content=note_data.content,
                phase=note_data.phase,
            )
            saved_notes.append(note)
            return note

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    # Submit three notes for the same user and trace
    for i in range(3):
        resp = await async_client.post(
            "/workshops/test-workshop/participant-notes",
            json={
                "user_id": "sme-1",
                "trace_id": "trace-1",
                "content": f"Note {i + 1}",
                "phase": "discovery",
            },
        )
        assert resp.status_code == 200

    # All three notes should exist (appended, not overwritten)
    assert len(saved_notes) == 3
    assert saved_notes[0].id != saved_notes[1].id != saved_notes[2].id
    assert saved_notes[0].content == "Note 1"
    assert saved_notes[1].content == "Note 2"
    assert saved_notes[2].content == "Note 3"


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_notes_from_both_phases_coexist(async_client, override_get_db, monkeypatch):
    """Test that discovery and annotation notes from the same user can coexist."""
    import server.routers.workshops as workshops_router

    workshop = create_test_workshop()
    saved_notes: list[ParticipantNote] = []
    note_counter = 0

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def add_participant_note(self, workshop_id: str, note_data: ParticipantNoteCreate):
            nonlocal note_counter
            note_counter += 1
            note = create_test_note(
                note_id=f"note-{note_counter}",
                user_id=note_data.user_id,
                trace_id=note_data.trace_id,
                content=note_data.content,
                phase=note_data.phase,
            )
            saved_notes.append(note)
            return note

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    # Create one discovery note and one annotation note
    resp = await async_client.post(
        "/workshops/test-workshop/participant-notes",
        json={
            "user_id": "sme-1",
            "trace_id": "trace-1",
            "content": "Discovery insight",
            "phase": "discovery",
        },
    )
    assert resp.status_code == 200

    resp = await async_client.post(
        "/workshops/test-workshop/participant-notes",
        json={
            "user_id": "sme-1",
            "trace_id": "trace-1",
            "content": "Annotation observation",
            "phase": "annotation",
        },
    )
    assert resp.status_code == 200

    # Both notes should exist with correct phases
    assert len(saved_notes) == 2
    assert saved_notes[0].phase == "discovery"
    assert saved_notes[1].phase == "annotation"


# ============================================================================
# Toggle show_participant_notes tests
# ============================================================================


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_toggle_participant_notes_enables(async_client, override_get_db, monkeypatch):
    """Test toggling participant notes from off to on."""
    import server.routers.workshops as workshops_router
    from server.database import WorkshopDB

    workshop = create_test_workshop(show_notes=False)

    # Create a mock DB object for the toggle endpoint (it queries the DB directly)
    mock_workshop_db = MagicMock(spec=WorkshopDB)
    mock_workshop_db.id = "test-workshop"
    mock_workshop_db.show_participant_notes = False

    mock_db = override_get_db
    mock_db.query.return_value.filter.return_value.first.return_value = mock_workshop_db

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db
            self._cache = {}

        def _get_cache_key(self, prefix, key):
            return f"{prefix}:{key}"

        def _workshop_from_db(self, db_workshop):
            # Return a workshop with the toggled value
            return Workshop(
                id="test-workshop",
                name="Test Workshop",
                description=None,
                facilitator_id="facilitator-1",
                status=WorkshopStatus.ACTIVE,
                current_phase=WorkshopPhase.DISCOVERY,
                completed_phases=[],
                discovery_started=True,
                annotation_started=False,
                active_discovery_trace_ids=[],
                active_annotation_trace_ids=[],
                judge_name="test_judge",
                show_participant_notes=True,  # toggled to True
                created_at=datetime.now(),
            )

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.put("/workshops/test-workshop/toggle-participant-notes")
    assert resp.status_code == 200
    body = resp.json()
    assert body["show_participant_notes"] is True


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_toggle_participant_notes_disables(async_client, override_get_db, monkeypatch):
    """Test toggling participant notes from on to off."""
    import server.routers.workshops as workshops_router
    from server.database import WorkshopDB

    mock_workshop_db = MagicMock(spec=WorkshopDB)
    mock_workshop_db.id = "test-workshop"
    mock_workshop_db.show_participant_notes = True

    mock_db = override_get_db
    mock_db.query.return_value.filter.return_value.first.return_value = mock_workshop_db

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db
            self._cache = {}

        def _get_cache_key(self, prefix, key):
            return f"{prefix}:{key}"

        def _workshop_from_db(self, db_workshop):
            return Workshop(
                id="test-workshop",
                name="Test Workshop",
                description=None,
                facilitator_id="facilitator-1",
                status=WorkshopStatus.ACTIVE,
                current_phase=WorkshopPhase.DISCOVERY,
                completed_phases=[],
                discovery_started=True,
                annotation_started=False,
                active_discovery_trace_ids=[],
                active_annotation_trace_ids=[],
                judge_name="test_judge",
                show_participant_notes=False,  # toggled to False
                created_at=datetime.now(),
            )

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.put("/workshops/test-workshop/toggle-participant-notes")
    assert resp.status_code == 200
    body = resp.json()
    assert body["show_participant_notes"] is False


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_toggle_missing_workshop_returns_404(async_client, override_get_db, monkeypatch):
    """Test that toggling notes on a non-existent workshop returns 404."""
    import server.routers.workshops as workshops_router

    mock_db = override_get_db
    mock_db.query.return_value.filter.return_value.first.return_value = None

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.put("/workshops/missing/toggle-participant-notes")
    assert resp.status_code == 404


# ============================================================================
# Multiple annotators scenario tests
# ============================================================================


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_multiple_annotators_notes_during_annotation(async_client, override_get_db, monkeypatch):
    """Test that multiple annotators can each add annotation-phase notes."""
    import server.routers.workshops as workshops_router

    workshop = create_test_workshop()
    saved_notes: list[ParticipantNote] = []
    note_counter = 0

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id: str):
            return workshop

        def add_participant_note(self, workshop_id: str, note_data: ParticipantNoteCreate):
            nonlocal note_counter
            note_counter += 1
            note = create_test_note(
                note_id=f"note-{note_counter}",
                user_id=note_data.user_id,
                content=note_data.content,
                phase=note_data.phase,
            )
            saved_notes.append(note)
            return note

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    annotators = ["sme-1", "sme-2", "sme-3"]
    for annotator in annotators:
        resp = await async_client.post(
            "/workshops/test-workshop/participant-notes",
            json={
                "user_id": annotator,
                "trace_id": "trace-1",
                "content": f"Annotation note from {annotator}",
                "phase": "annotation",
            },
        )
        assert resp.status_code == 200, f"Failed for {annotator}: {resp.json()}"

    # All 3 annotators' notes were saved
    assert len(saved_notes) == 3
    user_ids = {n.user_id for n in saved_notes}
    assert user_ids == {"sme-1", "sme-2", "sme-3"}


# ============================================================================
# Pydantic model validation tests
# ============================================================================


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
def test_participant_note_create_model_defaults():
    """Test ParticipantNoteCreate model default values."""
    note = ParticipantNoteCreate(
        user_id="sme-1",
        content="Test note",
    )
    assert note.phase == "discovery"
    assert note.trace_id is None


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
def test_participant_note_create_model_with_annotation_phase():
    """Test ParticipantNoteCreate model with annotation phase."""
    note = ParticipantNoteCreate(
        user_id="sme-1",
        content="Annotation note",
        phase="annotation",
        trace_id="trace-1",
    )
    assert note.phase == "annotation"
    assert note.trace_id == "trace-1"


@pytest.mark.spec("ANNOTATION_SPEC")
@pytest.mark.unit
def test_participant_note_model_serialization():
    """Test ParticipantNote model serialization includes phase."""
    note = create_test_note(phase="annotation")
    data = note.model_dump()
    assert "phase" in data
    assert data["phase"] == "annotation"
    assert "user_name" in data
    assert "trace_id" in data
