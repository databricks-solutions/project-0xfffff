"""Discovery API endpoints.

All discovery-phase endpoints live here to keep `workshops.py` focused on workshop CRUD
and non-discovery flows.
"""

import logging
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends
from pydantic import BaseModel
from sqlalchemy.orm import Session

from server.database import get_db
from server.models import DiscoveryFinding, DiscoveryFindingCreate
from server.services.discovery_service import DiscoveryService

router = APIRouter()
logger = logging.getLogger(__name__)


class DiscoveryQuestion(BaseModel):
    """A single discovery-phase question rendered in the participant UI."""

    id: str
    prompt: str
    placeholder: Optional[str] = None


class DiscoveryQuestionsResponse(BaseModel):
    """Response model for discovery questions."""

    questions: List[DiscoveryQuestion]


class DiscoveryQuestionsModelConfig(BaseModel):
    """Workshop-level config for discovery question generation."""

    model_name: str


class DiscoverySummariesResponse(BaseModel):
    """LLM-generated summaries of discovery findings for facilitators."""

    overall: Dict[str, Any]
    by_user: List[Dict[str, Any]]
    by_trace: List[Dict[str, Any]]


@router.get(
    "/{workshop_id}/traces/{trace_id}/discovery-questions",
    response_model=DiscoveryQuestionsResponse,
)
async def get_discovery_questions(
    workshop_id: str,
    trace_id: str,
    user_id: Optional[str] = None,
    append: bool = False,
    db: Session = Depends(get_db),
) -> DiscoveryQuestionsResponse:
    svc = DiscoveryService(db)
    questions = svc.get_discovery_questions(workshop_id=workshop_id, trace_id=trace_id, user_id=user_id, append=append)
    return DiscoveryQuestionsResponse(questions=[DiscoveryQuestion(**q) for q in questions])


@router.put("/{workshop_id}/discovery-questions-model")
async def update_discovery_questions_model(
    workshop_id: str,
    config: DiscoveryQuestionsModelConfig,
    db: Session = Depends(get_db),
):
    svc = DiscoveryService(db)
    model_name = svc.set_discovery_questions_model(workshop_id=workshop_id, model_name=config.model_name)
    return {"message": "Discovery questions model updated", "model_name": model_name}


@router.post("/{workshop_id}/discovery-summaries", response_model=DiscoverySummariesResponse)
async def generate_discovery_summaries(
    workshop_id: str, refresh: bool = False, db: Session = Depends(get_db)
) -> DiscoverySummariesResponse:
    svc = DiscoveryService(db)
    payload = svc.generate_discovery_summaries(workshop_id=workshop_id, refresh=refresh)
    return DiscoverySummariesResponse(
        overall=payload.get("overall") or {},
        by_user=payload.get("by_user") or [],
        by_trace=payload.get("by_trace") or [],
    )


@router.get("/{workshop_id}/discovery-summaries", response_model=DiscoverySummariesResponse)
async def get_discovery_summaries(workshop_id: str, db: Session = Depends(get_db)) -> DiscoverySummariesResponse:
    svc = DiscoveryService(db)
    payload = svc.get_discovery_summaries(workshop_id=workshop_id)
    return DiscoverySummariesResponse(
        overall=payload.get("overall") or {},
        by_user=payload.get("by_user") or [],
        by_trace=payload.get("by_trace") or [],
    )


@router.post("/{workshop_id}/findings", response_model=DiscoveryFinding)
async def submit_finding(
    workshop_id: str, finding: DiscoveryFindingCreate, db: Session = Depends(get_db)
) -> DiscoveryFinding:
    svc = DiscoveryService(db)
    return svc.submit_finding(workshop_id, finding)


@router.get("/{workshop_id}/findings", response_model=List[DiscoveryFinding])
async def get_findings(
    workshop_id: str, user_id: Optional[str] = None, db: Session = Depends(get_db)
) -> List[DiscoveryFinding]:
    svc = DiscoveryService(db)
    return svc.get_findings(workshop_id, user_id)


@router.get("/{workshop_id}/findings-with-users", response_model=List[Dict[str, Any]])
async def get_findings_with_user_details(
    workshop_id: str, user_id: Optional[str] = None, db: Session = Depends(get_db)
) -> List[Dict[str, Any]]:
    svc = DiscoveryService(db)
    return svc.get_findings_with_user_details(workshop_id, user_id)


@router.delete("/{workshop_id}/findings")
async def clear_findings(workshop_id: str, db: Session = Depends(get_db)):
    """Clear all findings for a workshop (for testing)."""
    svc = DiscoveryService(db)
    svc.clear_findings(workshop_id)
    return {"message": "Findings cleared successfully"}


@router.post("/{workshop_id}/begin-discovery")
async def begin_discovery_phase(workshop_id: str, trace_limit: Optional[int] = None, db: Session = Depends(get_db)):
    svc = DiscoveryService(db)
    return svc.begin_discovery_phase(workshop_id=workshop_id, trace_limit=trace_limit)


@router.post("/{workshop_id}/reset-discovery")
async def reset_discovery(workshop_id: str, db: Session = Depends(get_db)):
    svc = DiscoveryService(db)
    return svc.reset_discovery(workshop_id)


@router.post("/{workshop_id}/advance-to-discovery")
async def advance_to_discovery(workshop_id: str, db: Session = Depends(get_db)):
    svc = DiscoveryService(db)
    return svc.advance_to_discovery(workshop_id)


@router.post("/{workshop_id}/generate-discovery-data")
async def generate_discovery_test_data(workshop_id: str, db: Session = Depends(get_db)):
    svc = DiscoveryService(db)
    return svc.generate_discovery_test_data(workshop_id)


# User Discovery Completion endpoints
@router.post("/{workshop_id}/users/{user_id}/complete-discovery")
async def mark_user_discovery_complete(workshop_id: str, user_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    svc = DiscoveryService(db)
    return svc.mark_user_discovery_complete(workshop_id, user_id)


@router.get("/{workshop_id}/discovery-completion-status")
async def get_discovery_completion_status(workshop_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    svc = DiscoveryService(db)
    return svc.get_discovery_completion_status(workshop_id)


@router.get("/{workshop_id}/users/{user_id}/discovery-complete")
async def is_user_discovery_complete(workshop_id: str, user_id: str, db: Session = Depends(get_db)) -> Dict[str, Any]:
    svc = DiscoveryService(db)
    return svc.is_user_discovery_complete(workshop_id, user_id)


