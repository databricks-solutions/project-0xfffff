from datetime import datetime

import pytest

from server.models import User, UserLogin, UserPermissions, UserRole, UserStatus


@pytest.mark.spec("AUTHENTICATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_users_login_facilitator_path(async_client, app):
    import server.routers.users as users_router

    facilitator_user = User(
        id="u_fac",
        email="fac@example.com",
        name="Fac",
        role=UserRole.FACILITATOR,
        workshop_id="w1",
        status=UserStatus.ACTIVE,
        created_at=datetime.now(),
        last_active=None,
    )

    class FakeDBService:
        def authenticate_facilitator_from_yaml(self, email: str, password: str):
            return {"email": email, "name": "Fac", "workshop_id": "w1"}

        def get_or_create_facilitator_user(self, facilitator_data):
            return facilitator_user

        # Not used in facilitator path:
        def authenticate_user(self, email: str, password: str):
            raise AssertionError("should not be called")

    app.dependency_overrides[users_router.get_database_service] = lambda: FakeDBService()
    try:
        resp = await async_client.post("/users/auth/login", json={"email": "fac@example.com", "password": "pw"})
        assert resp.status_code == 200
        body = resp.json()
        assert body["is_preconfigured_facilitator"] is True
        assert body["user"]["role"] == "facilitator"
    finally:
        app.dependency_overrides.pop(users_router.get_database_service, None)


@pytest.mark.spec("AUTHENTICATION_SPEC")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_users_login_invalid_credentials_returns_401(async_client, app):
    import server.routers.users as users_router

    class FakeDBService:
        def authenticate_facilitator_from_yaml(self, email: str, password: str):
            return None

        def authenticate_user(self, email: str, password: str):
            return None

    app.dependency_overrides[users_router.get_database_service] = lambda: FakeDBService()
    try:
        resp = await async_client.post("/users/auth/login", json={"email": "x@example.com", "password": "bad"})
        assert resp.status_code == 401
        assert resp.json()["detail"] == "Invalid email or password"
    finally:
        app.dependency_overrides.pop(users_router.get_database_service, None)


@pytest.mark.spec("AUTHENTICATION_SPEC")
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
        resp = await async_client.get("/users/u1/permissions")
        assert resp.status_code == 200
        body = resp.json()
        # SMEs cannot create rubric and cannot view rubric (facilitator shares)
        assert body["can_create_rubric"] is False
        assert body["can_view_rubric"] is False
    finally:
        app.dependency_overrides.pop(users_router.get_database_service, None)
