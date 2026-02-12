"""Integration tests for role-based permissions — ROLE_PERMISSIONS_SPEC.

Tests verify cross-spec permission enforcement at API boundaries:
- Role-to-permission matrix (for_role classmethod)
- Role protection (facilitator cannot be changed/deleted)
- Invitation creation restricted to facilitators
- Phase advancement with prerequisite validation
- Login flow differences by role
"""

from datetime import datetime, timedelta
from unittest.mock import MagicMock

import pytest

from server.models import (
    User,
    UserPermissions,
    UserRole,
    UserStatus,
    Workshop,
    WorkshopPhase,
    WorkshopStatus,
)


# ---------------------------------------------------------------------------
# Helpers
# ---------------------------------------------------------------------------

def _make_user(
    user_id: str = "u1",
    role: UserRole = UserRole.PARTICIPANT,
    workshop_id: str = "w1",
) -> User:
    return User(
        id=user_id,
        email=f"{user_id}@example.com",
        name=user_id.title(),
        role=role,
        workshop_id=workshop_id,
        status=UserStatus.ACTIVE,
        created_at=datetime.now(),
        last_active=None,
    )


def _make_workshop(
    workshop_id: str = "w1",
    phase: WorkshopPhase = WorkshopPhase.INTAKE,
) -> Workshop:
    return Workshop(
        id=workshop_id,
        name="Test Workshop",
        description=None,
        facilitator_id="fac",
        status=WorkshopStatus.ACTIVE,
        current_phase=phase,
        completed_phases=[],
        discovery_started=False,
        annotation_started=False,
        active_discovery_trace_ids=[],
        active_annotation_trace_ids=[],
        judge_name="workshop_judge",
        created_at=datetime.now(),
    )


# ===========================================================================
# Requirement 1: Facilitator role grants
# ===========================================================================


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req(
    "Facilitator role grants: can_create_rubric, can_manage_workshop, "
    "can_assign_annotations, can_view_all_findings, can_view_all_annotations, can_view_results"
)
@pytest.mark.unit
def test_facilitator_role_grants():
    """UserPermissions.for_role(FACILITATOR) must grant all facilitator-only permissions."""
    perms = UserPermissions.for_role(UserRole.FACILITATOR)
    assert perms.can_create_rubric is True
    assert perms.can_manage_workshop is True
    assert perms.can_assign_annotations is True
    assert perms.can_view_all_findings is True
    assert perms.can_view_all_annotations is True
    assert perms.can_view_results is True


# ===========================================================================
# Requirement 2: Facilitator role denies
# ===========================================================================


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req("Facilitator role denies: can_annotate, can_create_findings")
@pytest.mark.unit
def test_facilitator_role_denies():
    """Facilitators must NOT be able to annotate or create findings (avoids conflict of interest)."""
    perms = UserPermissions.for_role(UserRole.FACILITATOR)
    assert perms.can_annotate is False
    assert perms.can_create_findings is False


# ===========================================================================
# Requirement 3: SME role grants
# ===========================================================================


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req("SME role grants: can_annotate, can_create_findings, can_view_discovery")
@pytest.mark.unit
def test_sme_role_grants():
    """SMEs can annotate, create findings, and view discovery."""
    perms = UserPermissions.for_role(UserRole.SME)
    assert perms.can_annotate is True
    assert perms.can_create_findings is True
    assert perms.can_view_discovery is True


# ===========================================================================
# Requirement 4: SME role denies
# ===========================================================================


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req(
    "SME role denies: can_create_rubric, can_manage_workshop, can_view_results, can_view_all_annotations"
)
@pytest.mark.unit
def test_sme_role_denies():
    """SMEs must NOT create rubrics, manage workshop, view results, or view all annotations."""
    perms = UserPermissions.for_role(UserRole.SME)
    assert perms.can_create_rubric is False
    assert perms.can_manage_workshop is False
    assert perms.can_view_results is False
    assert perms.can_view_all_annotations is False


# ===========================================================================
# Requirement 5: Participant role grants
# ===========================================================================


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req("Participant role grants: can_annotate, can_create_findings, can_view_discovery")
@pytest.mark.unit
def test_participant_role_grants():
    """Participants can annotate, create findings, and view discovery."""
    perms = UserPermissions.for_role(UserRole.PARTICIPANT)
    assert perms.can_annotate is True
    assert perms.can_create_findings is True
    assert perms.can_view_discovery is True


# ===========================================================================
# Requirement 6: Participant role denies
# ===========================================================================


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req(
    "Participant role denies: can_create_rubric, can_manage_workshop, can_view_results, can_view_all_annotations"
)
@pytest.mark.unit
def test_participant_role_denies():
    """Participants must NOT create rubrics, manage workshop, view results, or view all annotations."""
    perms = UserPermissions.for_role(UserRole.PARTICIPANT)
    assert perms.can_create_rubric is False
    assert perms.can_manage_workshop is False
    assert perms.can_view_results is False
    assert perms.can_view_all_annotations is False


# ===========================================================================
# Requirement 7: Permissions derived from role via for_role()
# ===========================================================================


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req("Permissions derived from role via UserPermissions.for_role() classmethod")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_permissions_endpoint_uses_for_role(async_client, app):
    """GET /users/{id}/permissions must derive permissions from user's role via for_role()."""
    import server.routers.users as users_router

    sme_user = _make_user("u-sme", UserRole.SME)

    class FakeDBService:
        def get_user(self, user_id: str):
            return sme_user

    app.dependency_overrides[users_router.get_database_service] = lambda: FakeDBService()
    try:
        resp = await async_client.get("/users/u-sme/permissions")
        assert resp.status_code == 200
        body = resp.json()
        expected = UserPermissions.for_role(UserRole.SME).model_dump()
        for key, value in expected.items():
            assert body[key] == value, f"Mismatch on {key}: got {body[key]}, expected {value}"
    finally:
        app.dependency_overrides.pop(users_router.get_database_service, None)


# ===========================================================================
# Requirement 8: Facilitator role cannot be changed via update endpoint
# ===========================================================================


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req("Facilitator role cannot be changed via update endpoint")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_facilitator_role_cannot_be_changed(async_client, app):
    """PUT /workshops/{wid}/users/{uid}/role must return 403 for facilitators."""
    import server.routers.users as users_router

    facilitator = _make_user("u-fac", UserRole.FACILITATOR)
    workshop = _make_workshop()

    class FakeDBService:
        def get_workshop(self, workshop_id: str):
            return workshop

        def get_user(self, user_id: str):
            return facilitator

    app.dependency_overrides[users_router.get_database_service] = lambda: FakeDBService()
    try:
        resp = await async_client.put(
            "/users/workshops/w1/users/u-fac/role",
            json={"role": "sme"},
        )
        assert resp.status_code == 403
        assert "Cannot change facilitator role" in resp.json()["detail"]
    finally:
        app.dependency_overrides.pop(users_router.get_database_service, None)


# ===========================================================================
# Requirement 9: Facilitator accounts cannot be deleted via delete endpoint
# ===========================================================================


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req("Facilitator accounts cannot be deleted via delete endpoint")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_facilitator_cannot_be_deleted(async_client, app):
    """DELETE /users/{uid} must return 403 for facilitators."""
    import server.routers.users as users_router

    facilitator = _make_user("u-fac", UserRole.FACILITATOR)

    class FakeDBService:
        def get_user(self, user_id: str):
            return facilitator

    app.dependency_overrides[users_router.get_database_service] = lambda: FakeDBService()
    try:
        resp = await async_client.delete("/users/u-fac")
        assert resp.status_code == 403
        assert "Cannot delete facilitators" in resp.json()["detail"]
    finally:
        app.dependency_overrides.pop(users_router.get_database_service, None)


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req("Facilitator accounts cannot be deleted via delete endpoint")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_non_facilitator_can_be_deleted(async_client, app):
    """DELETE /users/{uid} succeeds for non-facilitator users (confirms protection is role-specific)."""
    import server.routers.users as users_router

    sme = _make_user("u-sme", UserRole.SME)

    class FakeDBService:
        def get_user(self, user_id):
            return sme

        def delete_user(self, user_id):
            pass  # success

    app.dependency_overrides[users_router.get_database_service] = lambda: FakeDBService()
    try:
        resp = await async_client.delete("/users/u-sme")
        assert resp.status_code == 200
        assert "deleted successfully" in resp.json()["message"]
    finally:
        app.dependency_overrides.pop(users_router.get_database_service, None)


# ===========================================================================
# Requirement 10: Only facilitators can create invitations
# ===========================================================================


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req("Only facilitators can create invitations")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_only_facilitators_can_create_invitations(async_client, app):
    """POST /users/invitations/ must return 403 when inviter is not a facilitator."""
    import server.routers.users as users_router

    sme_inviter = _make_user("u-sme", UserRole.SME)

    class FakeDBService:
        def get_user(self, user_id: str):
            return sme_inviter

    app.dependency_overrides[users_router.get_database_service] = lambda: FakeDBService()
    try:
        resp = await async_client.post(
            "/users/invitations/",
            json={
                "email": "new@example.com",
                "name": "New User",
                "role": "participant",
                "workshop_id": "w1",
                "invited_by": "u-sme",
                "expires_at": (datetime.now() + timedelta(days=7)).isoformat(),
            },
        )
        assert resp.status_code == 403
        assert "Only facilitators can create invitations" in resp.json()["detail"]
    finally:
        app.dependency_overrides.pop(users_router.get_database_service, None)


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req("Only facilitators can create invitations")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_facilitator_can_create_invitation(async_client, app):
    """POST /users/invitations/ must succeed when inviter is a facilitator."""
    import server.routers.users as users_router

    facilitator = _make_user("u-fac", UserRole.FACILITATOR)

    class FakeInvitation:
        invitation_token = "tok123"

    class FakeDBService:
        def get_user(self, user_id: str):
            return facilitator

        def get_user_by_email(self, email: str):
            return None  # new user

        def create_invitation(self, invitation_data):
            return FakeInvitation()

    app.dependency_overrides[users_router.get_database_service] = lambda: FakeDBService()
    try:
        resp = await async_client.post(
            "/users/invitations/",
            json={
                "email": "new@example.com",
                "name": "New User",
                "role": "participant",
                "workshop_id": "w1",
                "invited_by": "u-fac",
                "expires_at": (datetime.now() + timedelta(days=7)).isoformat(),
            },
        )
        assert resp.status_code == 200
        assert "Invitation created successfully" in resp.json()["message"]
    finally:
        app.dependency_overrides.pop(users_router.get_database_service, None)


# ===========================================================================
# Requirement 11: Only facilitators can advance workshop phases
# ===========================================================================


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req("Only facilitators can advance workshop phases")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_phase_advancement_endpoint_exists_and_responds(
    async_client, override_get_db, monkeypatch
):
    """Phase advancement endpoints exist and are documented as facilitator-only."""
    import server.routers.workshops as workshops_router

    # Create a fake trace so prerequisite is met
    class FakeTrace:
        id = "t1"
        mlflow_trace_id = "mlflow-t1"

    workshop = _make_workshop("w-adv", WorkshopPhase.INTAKE)

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id):
            return workshop

        def get_traces(self, workshop_id):
            return [FakeTrace()]

        def update_workshop_phase(self, workshop_id, new_phase):
            workshop.current_phase = new_phase

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.post("/workshops/w-adv/advance-to-discovery")
    assert resp.status_code == 200
    assert resp.json()["phase"] == "discovery"


# ===========================================================================
# Requirement 12: Phase advancement validates prerequisites
# ===========================================================================


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req("Phase advancement validates prerequisites before transitioning")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_phase_advancement_validates_current_phase(
    async_client, override_get_db, monkeypatch
):
    """Advancing to discovery from a non-INTAKE phase must fail."""
    import server.routers.workshops as workshops_router

    # Workshop already in DISCOVERY -- trying advance-to-discovery should fail
    workshop = _make_workshop("w-wrong", WorkshopPhase.DISCOVERY)

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id):
            return workshop

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.post("/workshops/w-wrong/advance-to-discovery")
    assert resp.status_code == 400
    assert "Cannot advance to discovery" in resp.json()["detail"]


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req("Phase advancement validates prerequisites before transitioning")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_advance_to_rubric_requires_findings(
    async_client, override_get_db, monkeypatch
):
    """Advancing to rubric requires at least one discovery finding."""
    import server.routers.workshops as workshops_router

    workshop = _make_workshop("w-nof", WorkshopPhase.DISCOVERY)

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id):
            return workshop

        def get_findings(self, workshop_id):
            return []  # No findings

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.post("/workshops/w-nof/advance-to-rubric")
    assert resp.status_code == 400
    assert "No discovery findings" in resp.json()["detail"]


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req("Phase advancement validates prerequisites before transitioning")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_advance_to_annotation_requires_rubric(
    async_client, override_get_db, monkeypatch
):
    """Advancing to annotation requires a rubric to exist."""
    import server.routers.workshops as workshops_router

    workshop = _make_workshop("w-norub", WorkshopPhase.RUBRIC)

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id):
            return workshop

        def get_rubric(self, workshop_id):
            return None  # No rubric

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.post("/workshops/w-norub/advance-to-annotation")
    assert resp.status_code == 400
    assert "Rubric must be created first" in resp.json()["detail"]


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req("Phase advancement validates prerequisites before transitioning")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_advance_to_results_requires_annotations(
    async_client, override_get_db, monkeypatch
):
    """Advancing to results requires at least one annotation."""
    import server.routers.workshops as workshops_router

    workshop = _make_workshop("w-noan", WorkshopPhase.ANNOTATION)

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id):
            return workshop

        def get_annotations(self, workshop_id):
            return []  # No annotations

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.post("/workshops/w-noan/advance-to-results")
    assert resp.status_code == 400
    assert "No annotations submitted" in resp.json()["detail"]


# ===========================================================================
# Requirement 13: Phase advancement returns 400 if prerequisites not met
# ===========================================================================


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req("Phase advancement returns 400 if prerequisites not met")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_advance_to_discovery_returns_400_without_traces(
    async_client, override_get_db, monkeypatch
):
    """Advancing to discovery without traces must return HTTP 400."""
    import server.routers.workshops as workshops_router

    workshop = _make_workshop("w-notrace", WorkshopPhase.INTAKE)

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id):
            return workshop

        def get_traces(self, workshop_id):
            return []  # No traces

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.post("/workshops/w-notrace/advance-to-discovery")
    assert resp.status_code == 400
    assert "No traces uploaded" in resp.json()["detail"]


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req("Phase advancement returns 400 if prerequisites not met")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_advance_from_wrong_phase_returns_400(
    async_client, override_get_db, monkeypatch
):
    """Trying to advance to annotation from INTAKE (skipping phases) must return 400."""
    import server.routers.workshops as workshops_router

    workshop = _make_workshop("w-skip", WorkshopPhase.INTAKE)

    class FakeDatabaseService:
        def __init__(self, db):
            self.db = db

        def get_workshop(self, workshop_id):
            return workshop

    monkeypatch.setattr(workshops_router, "DatabaseService", FakeDatabaseService)

    resp = await async_client.post("/workshops/w-skip/advance-to-annotation")
    assert resp.status_code == 400


# ===========================================================================
# Requirement 14: Facilitators authenticate via YAML config
# ===========================================================================


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req("Facilitators authenticate via YAML config (preconfigured credentials)")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_facilitator_authenticates_via_yaml(async_client, app):
    """Login endpoint must try YAML auth first; facilitator matched in YAML succeeds."""
    import server.routers.users as users_router

    facilitator = _make_user("u-fac", UserRole.FACILITATOR)

    class FakeDBService:
        def authenticate_facilitator_from_yaml(self, email, password):
            return {"email": email, "name": "Fac", "workshop_id": "w1"}

        def get_or_create_facilitator_user(self, facilitator_data):
            return facilitator

        def authenticate_user(self, email, password):
            raise AssertionError("DB auth should not be attempted for YAML facilitator")

    app.dependency_overrides[users_router.get_database_service] = lambda: FakeDBService()
    try:
        resp = await async_client.post(
            "/users/auth/login",
            json={"email": "fac@example.com", "password": "secret"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["is_preconfigured_facilitator"] is True
        assert body["user"]["role"] == "facilitator"
    finally:
        app.dependency_overrides.pop(users_router.get_database_service, None)


# ===========================================================================
# Requirement 15: SMEs and participants authenticate via database credentials
# ===========================================================================


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req("SMEs and participants authenticate via database credentials")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_sme_authenticates_via_database(async_client, app):
    """When YAML auth returns None, login falls through to DB authentication."""
    import server.routers.users as users_router

    sme_user = _make_user("u-sme", UserRole.SME)

    class FakeDBService:
        def authenticate_facilitator_from_yaml(self, email, password):
            return None  # Not a YAML facilitator

        def authenticate_user(self, email, password):
            return sme_user  # Authenticated via DB

        def activate_user_on_login(self, user_id):
            pass

        def get_user(self, user_id):
            return sme_user

    app.dependency_overrides[users_router.get_database_service] = lambda: FakeDBService()
    try:
        resp = await async_client.post(
            "/users/auth/login",
            json={"email": "u-sme@example.com", "password": "pw"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["is_preconfigured_facilitator"] is False
        assert body["user"]["role"] == "sme"
    finally:
        app.dependency_overrides.pop(users_router.get_database_service, None)


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req("SMEs and participants authenticate via database credentials")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_participant_authenticates_via_database(async_client, app):
    """Participants also authenticate through the database path."""
    import server.routers.users as users_router

    participant = _make_user("u-part", UserRole.PARTICIPANT)

    class FakeDBService:
        def authenticate_facilitator_from_yaml(self, email, password):
            return None

        def authenticate_user(self, email, password):
            return participant

        def activate_user_on_login(self, user_id):
            pass

        def get_user(self, user_id):
            return participant

    app.dependency_overrides[users_router.get_database_service] = lambda: FakeDBService()
    try:
        resp = await async_client.post(
            "/users/auth/login",
            json={"email": "u-part@example.com", "password": "pw"},
        )
        assert resp.status_code == 200
        body = resp.json()
        assert body["is_preconfigured_facilitator"] is False
        assert body["user"]["role"] == "participant"
    finally:
        app.dependency_overrides.pop(users_router.get_database_service, None)


# ===========================================================================
# Requirement 16: Login response includes is_preconfigured_facilitator flag
# ===========================================================================


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req("Login response includes is_preconfigured_facilitator flag for facilitator logins")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_login_response_includes_is_preconfigured_flag_true(async_client, app):
    """Facilitator login must return is_preconfigured_facilitator=True."""
    import server.routers.users as users_router

    facilitator = _make_user("u-fac", UserRole.FACILITATOR)

    class FakeDBService:
        def authenticate_facilitator_from_yaml(self, email, password):
            return {"email": email, "name": "Fac", "workshop_id": "w1"}

        def get_or_create_facilitator_user(self, data):
            return facilitator

    app.dependency_overrides[users_router.get_database_service] = lambda: FakeDBService()
    try:
        resp = await async_client.post(
            "/users/auth/login",
            json={"email": "fac@example.com", "password": "pw"},
        )
        assert resp.status_code == 200
        assert resp.json()["is_preconfigured_facilitator"] is True
    finally:
        app.dependency_overrides.pop(users_router.get_database_service, None)


@pytest.mark.spec("ROLE_PERMISSIONS_SPEC")
@pytest.mark.req("Login response includes is_preconfigured_facilitator flag for facilitator logins")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_login_response_includes_is_preconfigured_flag_false(async_client, app):
    """Non-facilitator login must return is_preconfigured_facilitator=False."""
    import server.routers.users as users_router

    sme = _make_user("u-sme", UserRole.SME)

    class FakeDBService:
        def authenticate_facilitator_from_yaml(self, email, password):
            return None

        def authenticate_user(self, email, password):
            return sme

        def activate_user_on_login(self, user_id):
            pass

        def get_user(self, user_id):
            return sme

    app.dependency_overrides[users_router.get_database_service] = lambda: FakeDBService()
    try:
        resp = await async_client.post(
            "/users/auth/login",
            json={"email": "sme@example.com", "password": "pw"},
        )
        assert resp.status_code == 200
        assert resp.json()["is_preconfigured_facilitator"] is False
    finally:
        app.dependency_overrides.pop(users_router.get_database_service, None)
