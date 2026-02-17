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
from server.models import (
    DiscoveryFeedback,
    DiscoveryFeedbackCreate,
    DiscoveryFinding,
    DiscoveryFindingCreate,
    GenerateFollowUpRequest,
    SubmitFollowUpAnswerRequest,
)
from server.services.discovery_service import DiscoveryService

router = APIRouter()
logger = logging.getLogger(__name__)


class DiscoveryQuestion(BaseModel):
    """A single discovery-phase question rendered in the participant UI."""

    id: str
    prompt: str
    placeholder: Optional[str] = None
    category: Optional[str] = None


class DiscoveryCoverage(BaseModel):
    """Coverage state for discovery questions."""

    covered: List[str]
    missing: List[str]


class DiscoveryQuestionsResponse(BaseModel):
    """Response model for discovery questions with coverage metadata."""

    questions: List[DiscoveryQuestion]
    can_generate_more: bool = True
    stop_reason: Optional[str] = None
    coverage: DiscoveryCoverage


class DiscoveryQuestionsModelConfig(BaseModel):
    """Workshop-level config for discovery question generation."""

    model_name: str


class KeyDisagreementResponse(BaseModel):
    """A disagreement between participants."""

    theme: str
    trace_ids: List[str] = []
    viewpoints: List[str] = []


class DiscussionPromptResponse(BaseModel):
    """A facilitator discussion prompt."""

    theme: str
    prompt: str


class ConvergenceMetricsResponse(BaseModel):
    """Cross-participant agreement metrics."""

    theme_agreement: Dict[str, float] = {}
    overall_alignment_score: float = 0.0


class DiscoverySummariesResponse(BaseModel):
    """LLM-generated summaries of discovery findings for facilitators."""

    overall: Dict[str, Any]
    by_user: List[Dict[str, Any]]
    by_trace: List[Dict[str, Any]]
    candidate_rubric_questions: List[str] = []
    key_disagreements: List[KeyDisagreementResponse] = []
    discussion_prompts: List[DiscussionPromptResponse] = []
    convergence: ConvergenceMetricsResponse = ConvergenceMetricsResponse()
    ready_for_rubric: bool = False


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
    result = svc.get_discovery_questions(workshop_id=workshop_id, trace_id=trace_id, user_id=user_id, append=append)
    return DiscoveryQuestionsResponse(
        questions=[DiscoveryQuestion(**q) for q in result["questions"]],
        can_generate_more=result.get("can_generate_more", True),
        stop_reason=result.get("stop_reason"),
        coverage=DiscoveryCoverage(**result.get("coverage", {"covered": [], "missing": []})),
    )


@router.put("/{workshop_id}/discovery-questions-model")
async def update_discovery_questions_model(
    workshop_id: str,
    config: DiscoveryQuestionsModelConfig,
    db: Session = Depends(get_db),
):
    svc = DiscoveryService(db)
    model_name = svc.set_discovery_questions_model(workshop_id=workshop_id, model_name=config.model_name)
    return {"message": "Discovery questions model updated", "model_name": model_name}


def _build_summaries_response(payload: Dict[str, Any]) -> DiscoverySummariesResponse:
    """Build a DiscoverySummariesResponse from a payload dict."""
    # Parse key_disagreements
    key_disagreements = []
    for d in payload.get("key_disagreements") or []:
        if isinstance(d, dict):
            key_disagreements.append(KeyDisagreementResponse(**d))

    # Parse discussion_prompts
    discussion_prompts = []
    for p in payload.get("discussion_prompts") or []:
        if isinstance(p, dict):
            discussion_prompts.append(DiscussionPromptResponse(**p))

    # Parse convergence
    convergence_data = payload.get("convergence") or {}
    if isinstance(convergence_data, dict):
        convergence = ConvergenceMetricsResponse(**convergence_data)
    else:
        convergence = ConvergenceMetricsResponse()

    return DiscoverySummariesResponse(
        overall=payload.get("overall") or {},
        by_user=payload.get("by_user") or [],
        by_trace=payload.get("by_trace") or [],
        candidate_rubric_questions=payload.get("candidate_rubric_questions") or [],
        key_disagreements=key_disagreements,
        discussion_prompts=discussion_prompts,
        convergence=convergence,
        ready_for_rubric=payload.get("ready_for_rubric", False),
    )


@router.post("/{workshop_id}/discovery-summaries", response_model=DiscoverySummariesResponse)
async def generate_discovery_summaries(
    workshop_id: str, refresh: bool = False, db: Session = Depends(get_db)
) -> DiscoverySummariesResponse:
    svc = DiscoveryService(db)
    payload = svc.generate_discovery_summaries(workshop_id=workshop_id, refresh=refresh)
    return _build_summaries_response(payload)


@router.get("/{workshop_id}/discovery-summaries", response_model=DiscoverySummariesResponse)
async def get_discovery_summaries(workshop_id: str, db: Session = Depends(get_db)) -> DiscoverySummariesResponse:
    svc = DiscoveryService(db)
    payload = svc.get_discovery_summaries(workshop_id=workshop_id)
    return _build_summaries_response(payload)


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


# ---------------------------------------------------------------------------
# Discovery Feedback (v2 Structured Feedback) Endpoints
# ---------------------------------------------------------------------------


@router.post("/{workshop_id}/discovery-feedback", response_model=DiscoveryFeedback)
async def submit_discovery_feedback(
    workshop_id: str,
    data: DiscoveryFeedbackCreate,
    db: Session = Depends(get_db),
) -> DiscoveryFeedback:
    """Submit initial feedback (label + comment) for a trace. Upsert behavior."""
    svc = DiscoveryService(db)
    return svc.submit_discovery_feedback(workshop_id, data)


@router.post("/{workshop_id}/generate-followup-question")
async def generate_followup_question(
    workshop_id: str,
    request: GenerateFollowUpRequest,
    question_number: int = 1,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Generate the next follow-up question for a trace's feedback."""
    svc = DiscoveryService(db)
    return svc.generate_followup_question(
        workshop_id=workshop_id,
        trace_id=request.trace_id,
        user_id=request.user_id,
        question_number=question_number,
    )


@router.post("/{workshop_id}/submit-followup-answer")
async def submit_followup_answer(
    workshop_id: str,
    request: SubmitFollowUpAnswerRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Append a Q&A pair to the feedback record."""
    svc = DiscoveryService(db)
    return svc.submit_followup_answer(
        workshop_id=workshop_id,
        trace_id=request.trace_id,
        user_id=request.user_id,
        question=request.question,
        answer=request.answer,
    )


@router.get("/{workshop_id}/discovery-feedback", response_model=List[DiscoveryFeedback])
async def get_discovery_feedback(
    workshop_id: str,
    user_id: Optional[str] = None,
    db: Session = Depends(get_db),
) -> List[DiscoveryFeedback]:
    """Get all discovery feedback, optionally filtered by user_id."""
    svc = DiscoveryService(db)
    return svc.get_discovery_feedback(workshop_id, user_id)


# ---------------------------------------------------------------------------
# Assisted Facilitation v2 Endpoints
# ---------------------------------------------------------------------------


class SubmitFindingV2Request(BaseModel):
    """Request to submit a finding with classification."""

    trace_id: str
    user_id: str
    text: str


@router.post("/{workshop_id}/findings-v2", response_model=Dict[str, Any])
async def submit_finding_v2(
    workshop_id: str,
    request: SubmitFindingV2Request,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Submit finding with real-time classification (v2 assisted facilitation)."""
    svc = DiscoveryService(db)
    return await svc.submit_finding_v2(
        workshop_id=workshop_id,
        trace_id=request.trace_id,
        user_id=request.user_id,
        finding_text=request.text,
    )


@router.get("/{workshop_id}/traces/{trace_id}/discovery-state", response_model=Dict[str, Any])
async def get_trace_discovery_state(
    workshop_id: str,
    trace_id: str,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Get full structured state for facilitator."""
    svc = DiscoveryService(db)
    return svc.get_trace_discovery_state(workshop_id=workshop_id, trace_id=trace_id)


@router.get("/{workshop_id}/discovery-progress", response_model=Dict[str, Any])
async def get_discovery_progress(
    workshop_id: str,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Get fuzzy global progress for participants."""
    svc = DiscoveryService(db)
    return svc.get_fuzzy_progress(workshop_id=workshop_id)


class PromoteFindingRequest(BaseModel):
    """Request to promote a finding."""

    finding_id: str
    promoter_id: str


@router.post("/{workshop_id}/findings/{finding_id}/promote", response_model=Dict[str, Any])
async def promote_finding(
    workshop_id: str,
    finding_id: str,
    request: PromoteFindingRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Promote finding to draft rubric."""
    svc = DiscoveryService(db)
    return svc.promote_finding(
        workshop_id=workshop_id,
        finding_id=finding_id,
        promoter_id=request.promoter_id,
    )


class UpdateThresholdsRequest(BaseModel):
    """Request to update trace thresholds."""

    thresholds: Dict[str, int]


@router.put("/{workshop_id}/traces/{trace_id}/thresholds", response_model=Dict[str, Any])
async def update_trace_thresholds(
    workshop_id: str,
    trace_id: str,
    request: UpdateThresholdsRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Update thresholds for trace."""
    svc = DiscoveryService(db)
    return svc.update_trace_thresholds(
        workshop_id=workshop_id,
        trace_id=trace_id,
        thresholds=request.thresholds,
    )


@router.get("/{workshop_id}/draft-rubric", response_model=List[Dict[str, Any]])
async def get_draft_rubric(
    workshop_id: str,
    db: Session = Depends(get_db),
) -> List[Dict[str, Any]]:
    """Get all promoted findings."""
    # Placeholder - will query DraftRubricItemDB in Phase 3
    return []


