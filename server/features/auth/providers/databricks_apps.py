from __future__ import annotations

import os
import time
from dataclasses import dataclass

from fastapi import HTTPException, Request

from server.features.auth.schemas import ProviderIdentity, ProviderRole


@dataclass
class _CachedRole:
    role: ProviderRole
    expires_at: float


class DatabricksAppsIdentityProvider:
    provider_name = "databricks_apps"

    def __init__(self, *, app_name: str | None = None, ttl_seconds: int | None = None):
        self.app_name = app_name or os.getenv("DATABRICKS_APP_NAME") or os.getenv("APP_NAME")
        self.ttl_seconds = ttl_seconds or int(os.getenv("DATABRICKS_APP_ROLE_CACHE_SECONDS", "60"))
        self._role_cache: dict[str, _CachedRole] = {}

    def resolve_identity(self, request: Request) -> ProviderIdentity:
        email = (
            request.headers.get("x-forwarded-email")
            or request.headers.get("x-forwarded-user")
            or request.headers.get("x-forwarded-preferred-username")
        )
        if not email:
            raise HTTPException(status_code=401, detail="Missing Databricks Apps identity headers")

        display_name = request.headers.get("x-forwarded-preferred-username") or email
        return ProviderIdentity(provider=self.provider_name, email=email.strip().lower(), display_name=display_name)

    def resolve_provider_role(self, identity: ProviderIdentity) -> ProviderRole:
        cached = self._role_cache.get(identity.email)
        now = time.time()
        if cached and cached.expires_at > now:
            return cached.role

        role = self._fetch_provider_role(identity.email)
        self._role_cache[identity.email] = _CachedRole(role=role, expires_at=now + self.ttl_seconds)
        return role

    def _fetch_provider_role(self, email: str) -> ProviderRole:
        if not self.app_name:
            # Databricks Apps should supply a configured app name for permission lookup.
            # If it is absent, fall back to the least-privileged app role for an authenticated user.
            return ProviderRole.CAN_USE

        try:
            from databricks.sdk import WorkspaceClient
        except Exception as exc:  # pragma: no cover - only hit in misconfigured deployments
            raise RuntimeError("databricks-sdk is required for Databricks Apps role resolution") from exc

        permissions = WorkspaceClient().apps.get_permissions(self.app_name)
        access_control_list = getattr(permissions, "access_control_list", None) or []
        best_role = ProviderRole.CAN_USE

        for acl in access_control_list:
            user_name = (getattr(acl, "user_name", None) or "").strip().lower()
            if user_name and user_name != email:
                continue

            for permission in getattr(acl, "all_permissions", None) or []:
                level = getattr(permission, "permission_level", None)
                level_value = getattr(level, "value", None) or str(level)
                if level_value.endswith("CAN_MANAGE") or level_value == "CAN_MANAGE":
                    return ProviderRole.CAN_MANAGE
                if level_value.endswith("CAN_USE") or level_value == "CAN_USE":
                    best_role = ProviderRole.CAN_USE

        return best_role

