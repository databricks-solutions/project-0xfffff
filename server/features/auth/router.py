from __future__ import annotations

from fastapi import APIRouter, Depends

from server.features.auth.schemas import AuthSession
from server.features.auth.service import get_current_session

router = APIRouter()


@router.get("/session", response_model=AuthSession)
async def get_auth_session(session: AuthSession = Depends(get_current_session)) -> AuthSession:
    return session

