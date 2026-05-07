from __future__ import annotations

import os

from fastapi import Request

from server.features.auth.schemas import ProviderIdentity, ProviderRole


class LocalDevIdentityProvider:
    provider_name = "local_dev"

    def resolve_identity(self, request: Request) -> ProviderIdentity:
        email = os.getenv("LOCAL_DEV_USER_EMAIL", "local.facilitator@example.com").strip().lower()
        display_name = os.getenv("LOCAL_DEV_USER_NAME", "Local Facilitator")
        return ProviderIdentity(provider=self.provider_name, email=email, display_name=display_name)

    def resolve_provider_role(self, request: Request, identity: ProviderIdentity) -> ProviderRole:
        configured = os.getenv("LOCAL_DEV_PROVIDER_ROLE", "CAN_MANAGE").strip().upper()
        if configured in {"CAN_USE", "USE", "USER"}:
            return ProviderRole.CAN_USE
        return ProviderRole.CAN_MANAGE

