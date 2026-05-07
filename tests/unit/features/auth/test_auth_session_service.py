import pytest


class FakeProvider:
    provider_name = "fake"

    def __init__(self, role):
        self.role = role

    def resolve_identity(self, request):
        from server.features.auth.schemas import ProviderIdentity

        return ProviderIdentity(provider="fake", email="user@example.com", display_name="User Example")

    def resolve_provider_role(self, request, identity):
        return self.role


class FakeUsers:
    def __init__(self):
        self.created = None

    def get_user_by_email(self, email):
        return None

    def create_user(self, user):
        self.created = user
        return user


class FakeProjects:
    def get_latest_project(self):
        return None


def build_service(db, role):
    from server.features.auth.service import AuthSessionService

    service = AuthSessionService(db, provider=FakeProvider(role))
    service.users = FakeUsers()
    service.projects = FakeProjects()
    return service


@pytest.mark.spec("AUTHENTICATION_SPEC")
@pytest.mark.req("Databricks Apps `CAN MANAGE` maps to facilitator role")
def test_can_manage_session_grants_project_management(mock_db_session):
    from starlette.requests import Request

    from server.features.auth.schemas import ProviderRole
    service = build_service(mock_db_session, ProviderRole.CAN_MANAGE)
    session = service.resolve_session(Request({"type": "http", "headers": []}))

    assert session.user.email == "user@example.com"
    assert session.user.role == "facilitator"
    assert session.permissions.can_manage_project is True


@pytest.mark.spec("AUTHENTICATION_SPEC")
@pytest.mark.req("Databricks Apps `CAN USE` maps to non-facilitator role")
def test_can_use_session_is_non_project_manager(mock_db_session):
    from starlette.requests import Request

    from server.features.auth.schemas import ProviderRole
    service = build_service(mock_db_session, ProviderRole.CAN_USE)
    session = service.resolve_session(Request({"type": "http", "headers": []}))

    assert session.user.email == "user@example.com"
    assert session.user.role == "sme"
    assert session.permissions.can_manage_project is False

