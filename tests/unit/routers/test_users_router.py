from datetime import datetime

import pytest

from server.features.auth.schemas import AuthSession, ProviderRole
from server.models import User, UserPermissions, UserRole, UserStatus


@pytest.mark.spec("AUTHENTICATION_SPEC")
@pytest.mark.req("Production derives the current app user from `IdentityProvider` before role permissions load")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_current_user_profile_comes_from_session(async_client, app):
    from server.features.auth.service import get_current_session

    user = User(
        id="u_fac",
        email="fac@example.com",
        name="Fac",
        role=UserRole.FACILITATOR,
        status=UserStatus.ACTIVE,
        created_at=datetime.now(),
        last_active=None,
    )
    session = AuthSession(
        user=user,
        permissions=UserPermissions.for_role(UserRole.FACILITATOR),
        provider="local_dev",
        provider_role=ProviderRole.CAN_MANAGE,
        project=None,
    )

    app.dependency_overrides[get_current_session] = lambda: session
    try:
        resp = await async_client.get("/api/users/me")
        assert resp.status_code == 200
        assert resp.json()["email"] == "fac@example.com"
    finally:
        app.dependency_overrides.pop(get_current_session, None)


@pytest.mark.spec("AUTHENTICATION_SPEC")
@pytest.mark.req("Legacy app-owned login is not part of V2")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_legacy_login_endpoint_removed(async_client):
    resp = await async_client.post("/api/users/auth/login", json={"email": "x@example.com", "password": "bad"})
    assert resp.status_code in {404, 405}


@pytest.mark.spec("AUTHENTICATION_SPEC")
@pytest.mark.req("No \"permission denied\" errors on normal login")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_user_permissions_derived_from_role(async_client, app):
    import server.routers.users as users_router

    u = User(
        id="u1",
        email="u@example.com",
        name="U",
        role=UserRole.SME,
        workshop_id="w1",
        status=UserStatus.ACTIVE,
        created_at=datetime.now(),
        last_active=None,
    )

    class FakeDBService:
        def get_user(self, user_id: str):
            assert user_id == "u1"
            return u

    app.dependency_overrides[users_router.get_database_service] = lambda: FakeDBService()
    try:
        resp = await async_client.get("/api/users/u1/permissions")
        assert resp.status_code == 200
        body = resp.json()
        # SMEs cannot create rubric and cannot view rubric (facilitator shares)
        assert body["can_create_rubric"] is False
        assert body["can_view_rubric"] is False
        assert body["can_manage_project"] is False
    finally:
        app.dependency_overrides.pop(users_router.get_database_service, None)
