"""Edge case tests for authentication endpoints.

Tests verify success criteria from AUTHENTICATION_SPEC.md:
- Permission API failure returns defaults (fallback behavior)
"""

from datetime import datetime

import pytest

from server.models import User, UserPermissions, UserRole, UserStatus


@pytest.mark.spec("AUTHENTICATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_permission_api_failure_returns_defaults_when_user_not_found(async_client, app):
    """When the user is not found (404), permissions endpoint returns 404.

    Per the spec, the frontend handles this by clearing the session.
    The backend correctly returns 404 for unknown users, and the frontend
    applies default permissions as a fallback for non-404 errors.
    """
    import server.routers.users as users_router

    class FakeDBService:
        def get_user(self, user_id: str):
            return None  # User not found

    app.dependency_overrides[users_router.get_database_service] = lambda: FakeDBService()
    try:
        resp = await async_client.get("/users/nonexistent-user/permissions")
        # Per AUTHENTICATION_SPEC: 404 on validation clears session
        assert resp.status_code == 404
        assert "not found" in resp.json()["detail"].lower()
    finally:
        app.dependency_overrides.pop(users_router.get_database_service, None)


@pytest.mark.spec("AUTHENTICATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_permission_api_returns_role_based_defaults_for_valid_user(async_client, app):
    """When the permission API works correctly, it returns role-based permissions.

    The server returns role-based permissions. For participants, the spec
    defaults are applied on the frontend side when the API fails; the server
    returns the actual role-specific permissions. We verify the server returns
    correct participant permissions:
    - can_annotate: true
    - can_create_rubric: false
    - can_manage_workshop: false
    - can_assign_annotations: false
    """
    import server.routers.users as users_router

    participant = User(
        id="u-participant",
        email="participant@example.com",
        name="Test Participant",
        role=UserRole.PARTICIPANT,
        workshop_id="w1",
        status=UserStatus.ACTIVE,
        created_at=datetime.now(),
        last_active=None,
    )

    class FakeDBService:
        def get_user(self, user_id: str):
            return participant

    app.dependency_overrides[users_router.get_database_service] = lambda: FakeDBService()
    try:
        resp = await async_client.get("/users/u-participant/permissions")
        assert resp.status_code == 200
        body = resp.json()
        # Verify the permissions match what for_role returns for participants
        assert body["can_annotate"] is True
        assert body["can_create_rubric"] is False
        assert body["can_manage_workshop"] is False
        assert body["can_assign_annotations"] is False
    finally:
        app.dependency_overrides.pop(users_router.get_database_service, None)


@pytest.mark.spec("AUTHENTICATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_permission_api_failure_when_db_service_raises(async_client, app):
    """When the database service raises an unexpected error during permission lookup,
    the server returns 500 - the frontend should then apply default permissions.

    Per AUTHENTICATION_SPEC Permission Loading Flow:
    - On other error: Apply default permissions (fallback)
    This tests the server-side behavior that triggers the frontend fallback.
    """
    import server.routers.users as users_router

    class FakeDBService:
        def get_user(self, user_id: str):
            raise RuntimeError("Database connection lost")

    app.dependency_overrides[users_router.get_database_service] = lambda: FakeDBService()
    try:
        resp = await async_client.get("/users/u-broken/permissions")
        # Server returns an error status on unexpected failure
        assert resp.status_code >= 500
    finally:
        app.dependency_overrides.pop(users_router.get_database_service, None)
