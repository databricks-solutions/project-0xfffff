from __future__ import annotations

import os
import uuid
from datetime import datetime

from fastapi import Depends, HTTPException, Request
from sqlalchemy.orm import Session

from server.database import get_db
from server.features.auth.providers import DatabricksAppsIdentityProvider, LocalDevIdentityProvider
from server.features.auth.providers.base import IdentityProvider
from server.features.auth.schemas import AuthSession, CurrentProjectSummary, ProviderIdentity, ProviderRole
from server.features.project_setup.repository import ProjectSetupRepository
from server.models import User, UserPermissions, UserRole, UserStatus
from server.services.database_service import DatabaseService


class AuthSessionService:
    def __init__(self, db: Session, *, provider: IdentityProvider | None = None):
        self.db = db
        self.provider = provider
        self.users = DatabaseService(db)
        self.projects = ProjectSetupRepository(db)

    def resolve_session(self, request: Request) -> AuthSession:
        provider = self.provider or self._select_provider(request)
        identity = provider.resolve_identity(request)
        provider_role = provider.resolve_provider_role(request, identity)
        user = self._materialize_user(identity, provider_role)
        permissions = self._permissions_for(user, provider_role)
        project = self._current_project_summary()

        return AuthSession(
            user=user,
            permissions=permissions,
            provider=identity.provider,
            provider_role=provider_role,
            project=project,
        )

    def _select_provider(self, request: Request) -> IdentityProvider:
        configured = os.getenv("IDENTITY_PROVIDER", "").strip().lower()
        has_databricks_headers = any(
            request.headers.get(header)
            for header in ("x-forwarded-email", "x-forwarded-user", "x-forwarded-preferred-username")
        )
        if configured == "databricks_apps" or has_databricks_headers:
            return DatabricksAppsIdentityProvider()
        return LocalDevIdentityProvider()

    def _materialize_user(self, identity: ProviderIdentity, provider_role: ProviderRole) -> User:
        existing = self.users.get_user_by_email(identity.email)
        role = self._app_role_for(existing, provider_role)
        status = UserStatus.ACTIVE
        now = datetime.now()

        if existing:
            updated = existing.copy(
                update={
                    "email": identity.email,
                    "name": identity.display_name or existing.name or identity.email,
                    "role": role,
                    "status": status,
                    "last_active": now,
                }
            )
            return self.users.update_user(updated)

        user = User(
            id=str(uuid.uuid4()),
            email=identity.email,
            name=identity.display_name or identity.email,
            role=role,
            status=status,
            created_at=now,
            last_active=now,
        )
        return self.users.create_user(user)

    def _app_role_for(self, existing: User | None, provider_role: ProviderRole) -> UserRole:
        if provider_role == ProviderRole.CAN_MANAGE:
            return UserRole.FACILITATOR
        if existing and existing.role in {UserRole.SME, UserRole.PARTICIPANT}:
            return existing.role
        return UserRole.SME

    def _permissions_for(self, user: User, provider_role: ProviderRole) -> UserPermissions:
        permissions = UserPermissions.for_role(user.role)
        permissions.can_manage_project = provider_role == ProviderRole.CAN_MANAGE
        return permissions

    def _current_project_summary(self) -> CurrentProjectSummary | None:
        project = self.projects.get_latest_project()
        if project is None:
            return None
        job = self.projects.get_latest_setup_job_for_project(getattr(project, "id"))
        return CurrentProjectSummary(
            id=getattr(project, "id"),
            name=getattr(project, "name"),
            setup_status=getattr(job, "status") if job is not None else None,
        )


def get_current_session(request: Request, db: Session = Depends(get_db)) -> AuthSession:
    return AuthSessionService(db).resolve_session(request)


def require_project_manager(session: AuthSession = Depends(get_current_session)) -> AuthSession:
    if not session.permissions.can_manage_project:
        raise HTTPException(status_code=403, detail="Project management permission required")
    return session

