"""Discovery API endpoints.

All discovery-phase endpoints live here to keep `workshops.py` focused on workshop CRUD
and non-discovery flows.
"""

import logging
import time
import json
from typing import Any, Dict, List, Optional

from fastapi import APIRouter, Depends, HTTPException, Request
from fastapi.responses import StreamingResponse
from pydantic_ai.ag_ui import run_ag_ui
from pydantic_ai.ui.ag_ui import AGUIAdapter
from pydantic import BaseModel
from sqlalchemy.orm import Session

from server.database import get_db
from server.models import (
    DiscoveryAgentRun,
    DiscoveryComment,
    DiscoveryCommentCreate,
    DiscoveryCommentVoteRequest,
    DiscoveryFeedback,
    DiscoveryFeedbackCreate,
    DiscoveryFeedbackWithUser,
    DiscoveryFinding,
    DiscoveryFindingCreate,
    DiscoveryFindingWithUser,
    DraftRubricItem,
    DraftRubricItemCreate,
    DraftRubricItemUpdate,
    GenerateFollowUpRequest,
    ProposedGroup,
    Rubric,
    SubmitFollowUpAnswerRequest,
    SuggestGroupsResponse,
    WorkshopMode,
)
from server.services.discovery_service import DiscoveryService
from server.services.eval_criteria_service import EvalCriteriaService
from server.services.trace_summarization_service import TraceContext, TraceSummarizationService
from server.models import TraceCriterionCreate, TraceCriterionType

router = APIRouter()
logger = logging.getLogger(__name__)


def _build_trace_summarization_service(
    svc: DiscoveryService,
    workshop_id: str,
    model_name: str,
) -> tuple[Any, TraceSummarizationService]:
    workshop = svc._get_workshop_or_404(workshop_id)
    selected_model = (model_name or "").strip()
    if not selected_model or selected_model == "demo":
        raise HTTPException(status_code=400, detail="A non-demo model is required for AG-UI assistant runs")

    workspace_url, databricks_token = svc._resolve_databricks_llm_auth()
    if not workspace_url or not databricks_token:
        raise HTTPException(status_code=400, detail="Databricks auth is required for AG-UI assistant runs")

    service = TraceSummarizationService(
        endpoint_url=f"{workspace_url.rstrip('/')}/serving-endpoints",
        token=databricks_token,
        model_name=selected_model,
        guidance=getattr(workshop, "summarization_guidance", None),
        use_case_description=getattr(workshop, "description", None),
    )
    return workshop, service


class DiscoveryQuestion(BaseModel):
    """A single discovery-phase question rendered in the participant UI."""

    id: str
    prompt: str
    placeholder: str | None = None
    category: str | None = None


class DiscoveryCoverage(BaseModel):
    """Coverage state for discovery questions."""

    covered: list[str]
    missing: list[str]


class DiscoveryQuestionsResponse(BaseModel):
    """Response model for discovery questions with coverage metadata."""

    questions: list[DiscoveryQuestion]
    can_generate_more: bool = True
    stop_reason: str | None = None
    coverage: DiscoveryCoverage


class DiscoveryQuestionsModelConfig(BaseModel):
    """Workshop-level config for discovery question generation."""

    model_name: str


class DiscoverySettingsConfig(BaseModel):
    """Workshop-level config for discovery workspace behavior."""

    discovery_mode: str | None = None
    discovery_followups_enabled: bool | None = None


class KeyDisagreementResponse(BaseModel):
    """A disagreement between participants."""

    theme: str
    trace_ids: list[str] = []
    viewpoints: list[str] = []


class DiscussionPromptResponse(BaseModel):
    """A facilitator discussion prompt."""

    theme: str
    prompt: str


class ConvergenceMetricsResponse(BaseModel):
    """Cross-participant agreement metrics."""

    theme_agreement: dict[str, float] = {}
    overall_alignment_score: float = 0.0


class DiscoverySummariesResponse(BaseModel):
    """LLM-generated summaries of discovery findings for facilitators."""

    overall: dict[str, Any]
    by_user: list[dict[str, Any]]
    by_trace: list[dict[str, Any]]
    candidate_rubric_questions: list[str] = []
    key_disagreements: list[KeyDisagreementResponse] = []
    discussion_prompts: list[DiscussionPromptResponse] = []
    convergence: ConvergenceMetricsResponse = ConvergenceMetricsResponse()
    ready_for_rubric: bool = False


@router.get(
    "/{workshop_id}/traces/{trace_id}/discovery-questions",
    response_model=DiscoveryQuestionsResponse,
)
async def get_discovery_questions(
    workshop_id: str,
    trace_id: str,
    user_id: str | None = None,
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


@router.put("/{workshop_id}/discovery-settings")
async def update_discovery_settings(
    workshop_id: str,
    config: DiscoverySettingsConfig,
    db: Session = Depends(get_db),
):
    svc = DiscoveryService(db)
    payload = svc.update_discovery_settings(
        workshop_id=workshop_id,
        discovery_mode=config.discovery_mode,
        discovery_followups_enabled=config.discovery_followups_enabled,
    )
    return {"message": "Discovery settings updated", **payload}


def _build_summaries_response(payload: dict[str, Any]) -> DiscoverySummariesResponse:
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


@router.get("/{workshop_id}/findings", response_model=list[DiscoveryFinding])
async def get_findings(
    workshop_id: str, user_id: str | None = None, db: Session = Depends(get_db)
) -> list[DiscoveryFinding]:
    svc = DiscoveryService(db)
    return svc.get_findings(workshop_id, user_id)


@router.get("/{workshop_id}/findings-with-users", response_model=list[DiscoveryFindingWithUser])
async def get_findings_with_user_details(
    workshop_id: str, user_id: str | None = None, db: Session = Depends(get_db)
) -> list[DiscoveryFindingWithUser]:
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
async def mark_user_discovery_complete(workshop_id: str, user_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    svc = DiscoveryService(db)
    return svc.mark_user_discovery_complete(workshop_id, user_id)


@router.get("/{workshop_id}/discovery-completion-status")
async def get_discovery_completion_status(workshop_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    svc = DiscoveryService(db)
    return svc.get_discovery_completion_status(workshop_id)


@router.get("/{workshop_id}/users/{user_id}/discovery-complete")
async def is_user_discovery_complete(workshop_id: str, user_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
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
) -> dict[str, Any]:
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
) -> dict[str, Any]:
    """Append a Q&A pair to the feedback record."""
    svc = DiscoveryService(db)
    return svc.submit_followup_answer(
        workshop_id=workshop_id,
        trace_id=request.trace_id,
        user_id=request.user_id,
        question=request.question,
        answer=request.answer,
        milestone_references=request.milestone_references,
    )


@router.get("/{workshop_id}/discovery-feedback", response_model=list[DiscoveryFeedback])
async def get_discovery_feedback(
    workshop_id: str,
    user_id: str | None = None,
    db: Session = Depends(get_db),
) -> list[DiscoveryFeedback]:
    """Get all discovery feedback, optionally filtered by user_id."""
    svc = DiscoveryService(db)
    return svc.get_discovery_feedback(workshop_id, user_id)


@router.get("/{workshop_id}/discovery-feedback-with-users", response_model=list[DiscoveryFeedbackWithUser])
async def get_discovery_feedback_with_user_details(
    workshop_id: str,
    user_id: str | None = None,
    db: Session = Depends(get_db),
) -> list[DiscoveryFeedbackWithUser]:
    """Get all discovery feedback with user details (name, role) for facilitator view."""
    svc = DiscoveryService(db)
    return svc.get_discovery_feedback_with_user_details(workshop_id, user_id)


class DiscoveryCommentCreateRequest(BaseModel):
    trace_id: str
    user_id: str
    body: str
    milestone_ref: str | None = None
    parent_comment_id: str | None = None
    suppress_auto_agent_run: bool = False


class DiscoveryCommentDeleteRequest(BaseModel):
    user_id: str


def _sse_event(event: str, payload: dict[str, Any]) -> str:
    return f"event: {event}\ndata: {json.dumps(payload, default=str)}\n\n"


def _iter_sse_data_payloads(chunk: str) -> list[str]:
    normalized = chunk.replace("\r\n", "\n")
    payloads: list[str] = []
    for raw_event in normalized.split("\n\n"):
        raw_event = raw_event.strip()
        if not raw_event:
            continue
        lines = [line.strip() for line in raw_event.split("\n") if line.strip().startswith("data:")]
        if not lines:
            continue
        payload = "\n".join(line[5:].strip() for line in lines)
        if payload:
            payloads.append(payload)
    return payloads


def _summarize_text(value: Any, max_len: int = 240) -> str:
    text = value if isinstance(value, str) else json.dumps(value, default=str)
    compact = " ".join(text.split()).strip()
    if len(compact) <= max_len:
        return compact
    return compact[: max_len - 1] + "…"


def _parse_percent_value(raw: Any) -> float | None:
    if isinstance(raw, (int, float)):
        return float(raw)
    if not isinstance(raw, str):
        return None
    text = raw.strip().replace("%", "")
    if not text:
        return None
    try:
        return float(text)
    except ValueError:
        return None


def _normalize_criterion_weight(criterion_type: TraceCriterionType, args: dict[str, Any]) -> tuple[int, dict[str, Any]]:
    if criterion_type == TraceCriterionType.HURDLE:
        return 1, {"mode": "hurdle_default"}

    weight_raw = args.get("weight")
    if isinstance(weight_raw, (int, float)):
        bounded = max(-10, min(10, int(round(float(weight_raw)))))
        return bounded, {"mode": "explicit_weight", "input": weight_raw}
    if isinstance(weight_raw, str):
        try:
            parsed = float(weight_raw.strip())
            bounded = max(-10, min(10, int(round(parsed))))
            return bounded, {"mode": "explicit_weight", "input": weight_raw}
        except ValueError:
            pass

    percent = _parse_percent_value(args.get("weight_percent"))
    if percent is not None:
        scaled = int(round((percent / 100.0) * 10.0))
        if percent > 0 and scaled == 0:
            scaled = 1
        if percent < 0 and scaled == 0:
            scaled = -1
        bounded = max(-10, min(10, scaled))
        return bounded, {"mode": "weight_percent", "input": percent, "scale": "percent_to_10"}

    return 1, {"mode": "default_weight"}


def _persist_ag_ui_payload(
    svc: DiscoveryService,
    run_id: str,
    payload: dict[str, Any],
    *,
    state: dict[str, Any],
) -> None:
    event_type = str(payload.get("type") or "").upper()
    now_ms = int(time.time() * 1000)
    current_partial = str(state.get("partial_output") or "")
    tool_calls_count = int(state.get("tool_calls_count") or 0)

    if event_type == "RUN_STARTED":
        svc.db_service.append_discovery_agent_run_event(
            run_id,
            {"event": "run_started", "timestamp_ms": now_ms},
        )
        svc.db_service.update_discovery_agent_run(run_id, status="running")
        return

    if event_type == "TEXT_MESSAGE_CONTENT":
        delta = payload.get("delta")
        if isinstance(delta, str) and delta:
            current_partial += delta
            state["partial_output"] = current_partial
            svc.db_service.update_discovery_agent_run(run_id, partial_output=current_partial)
        return

    if event_type == "THINKING_TEXT_MESSAGE_CONTENT":
        delta = payload.get("delta")
        if isinstance(delta, str) and delta.strip():
            svc.db_service.append_discovery_agent_run_event(
                run_id,
                {
                    "event": "reasoning_delta",
                    "timestamp_ms": now_ms,
                    "reasoning": delta,
                },
            )
        return

    if event_type == "TOOL_CALL_START":
        tool_calls_count += 1
        state["tool_calls_count"] = tool_calls_count
        svc.db_service.append_discovery_agent_run_event(
            run_id,
            {
                "event": "tool_start",
                "timestamp_ms": now_ms,
                "tool_name": payload.get("toolCallName"),
                "tool_call_id": payload.get("toolCallId"),
                "tool_call_index": tool_calls_count,
            },
        )
        svc.db_service.update_discovery_agent_run(run_id, tool_calls_count=tool_calls_count)
        return

    if event_type == "TOOL_CALL_RESULT":
        result_summary = _summarize_text(payload.get("content"))
        svc.db_service.append_discovery_agent_run_event(
            run_id,
            {
                "event": "tool_result",
                "timestamp_ms": now_ms,
                "tool_call_id": payload.get("toolCallId"),
                "result_summary": result_summary,
            },
        )
        return

    if event_type == "RUN_FINISHED":
        svc.db_service.append_discovery_agent_run_event(
            run_id,
            {"event": "run_completed", "timestamp_ms": now_ms},
        )
        svc.db_service.update_discovery_agent_run(
            run_id,
            status="completed",
            tool_calls_count=tool_calls_count,
            partial_output=current_partial,
            final_output=current_partial,
            completed=True,
        )
        return

    if event_type == "RUN_ERROR":
        message = payload.get("message")
        error_text = str(message) if message is not None else "AG-UI run failed"
        svc.db_service.append_discovery_agent_run_event(
            run_id,
            {"event": "run_failed", "timestamp_ms": now_ms, "error": error_text},
        )
        svc.db_service.update_discovery_agent_run(
            run_id,
            status="failed",
            tool_calls_count=tool_calls_count,
            partial_output=current_partial,
            error=error_text,
            completed=True,
        )


@router.post("/{workshop_id}/discovery-comments", response_model=dict[str, Any])
async def create_discovery_comment(
    workshop_id: str,
    request: DiscoveryCommentCreateRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    svc = DiscoveryService(db)
    payload = svc.create_discovery_comment(
        workshop_id,
        DiscoveryCommentCreate(
            trace_id=request.trace_id,
            user_id=request.user_id,
            body=request.body,
            milestone_ref=request.milestone_ref,
            parent_comment_id=request.parent_comment_id,
            suppress_auto_agent_run=request.suppress_auto_agent_run,
        ),
    )
    return payload


@router.get("/{workshop_id}/discovery-comments", response_model=list[DiscoveryComment])
async def list_discovery_comments(
    workshop_id: str,
    trace_id: str,
    milestone_ref: str | None = None,
    user_id: str | None = None,
    db: Session = Depends(get_db),
) -> list[DiscoveryComment]:
    svc = DiscoveryService(db)
    return svc.list_discovery_comments(
        workshop_id=workshop_id,
        trace_id=trace_id,
        milestone_ref=milestone_ref,
        user_id=user_id,
    )


@router.post("/{workshop_id}/discovery-comments/{comment_id}/vote", response_model=DiscoveryComment)
async def vote_discovery_comment(
    workshop_id: str,
    comment_id: str,
    request: DiscoveryCommentVoteRequest,
    db: Session = Depends(get_db),
) -> DiscoveryComment:
    svc = DiscoveryService(db)
    return svc.vote_discovery_comment(workshop_id, comment_id, request)


@router.delete("/{workshop_id}/discovery-comments/{comment_id}", response_model=dict[str, Any])
async def delete_discovery_comment(
    workshop_id: str,
    comment_id: str,
    request: DiscoveryCommentDeleteRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    svc = DiscoveryService(db)
    return svc.delete_discovery_comment(workshop_id, comment_id, request.user_id)


@router.get("/{workshop_id}/discovery-agent-runs/{run_id}", response_model=DiscoveryAgentRun)
async def get_discovery_agent_run(
    workshop_id: str,
    run_id: str,
    db: Session = Depends(get_db),
) -> DiscoveryAgentRun:
    svc = DiscoveryService(db)
    return svc.get_discovery_agent_run(workshop_id, run_id)


@router.get("/{workshop_id}/discovery-agent-runs/{run_id}/stream")
async def stream_discovery_agent_run(
    workshop_id: str,
    run_id: str,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    svc = DiscoveryService(db)

    def event_generator():
        sent_started = False
        last_len = 0
        sent_event_count = 0
        while True:
            run = svc.get_discovery_agent_run(workshop_id, run_id)
            if not sent_started:
                sent_started = True
                yield _sse_event("run_started", {"run_id": run.id, "status": run.status})

            events = list(run.events or [])
            if sent_event_count < len(events):
                for evt in events[sent_event_count:]:
                    event_name = str(evt.get("event") or "event")
                    if event_name == "run_started":
                        continue
                    payload = {"run_id": run.id, **evt}
                    yield _sse_event(event_name, payload)
                sent_event_count = len(events)

            current = run.partial_output or ""
            if len(current) > last_len:
                delta = current[last_len:]
                last_len = len(current)
                yield _sse_event("token_delta", {"run_id": run.id, "delta": delta})

            if run.status in {"completed", "failed", "timeout"}:
                if run.status == "completed":
                    event_name = "run_completed"
                elif run.status == "timeout":
                    event_name = "run_timeout"
                else:
                    event_name = "run_failed"
                payload = {
                    "run_id": run.id,
                    "status": run.status,
                    "final_output": run.final_output,
                    "error": run.error,
                    "tool_calls_count": run.tool_calls_count,
                }
                yield _sse_event(event_name, payload)
                break

            yield _sse_event("heartbeat", {"run_id": run.id, "status": run.status})
            time.sleep(0.35)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


@router.post("/{workshop_id}/traces/{trace_id}/ag-ui/thread-assistant")
async def run_thread_assistant_ag_ui(
    workshop_id: str,
    trace_id: str,
    request: Request,
    user_id: str,
    trigger_comment_id: str,
    milestone_ref: str | None = None,
    parent_comment_id: str | None = None,
    db: Session = Depends(get_db),
):
    """Run the discovery thread assistant through AG-UI streaming protocol."""
    svc = DiscoveryService(db)
    workshop = svc._get_workshop_or_404(workshop_id)
    trace = svc.db_service.get_trace(trace_id)
    if not trace or trace.workshop_id != workshop_id:
        raise HTTPException(status_code=404, detail="Trace not found")

    model_name = (getattr(workshop, "discovery_questions_model_name", None) or "").strip()
    _, ts_service = _build_trace_summarization_service(svc, workshop_id, model_name=model_name)

    deps = TraceContext.from_dict(trace.context if isinstance(trace.context, dict) else {})
    trigger_comment = svc.db_service.get_discovery_comment(trigger_comment_id, viewer_user_id=user_id)
    if not trigger_comment or trigger_comment.workshop_id != workshop_id or trigger_comment.trace_id != trace_id:
        raise HTTPException(status_code=404, detail="Trigger comment not found")

    body = await request.body()
    run_input = AGUIAdapter.build_run_input(body)
    existing_run = svc.db_service.get_discovery_agent_run(run_input.run_id)
    run_record = existing_run
    if existing_run is None:
        run_record = svc.db_service.create_discovery_agent_run(
            workshop_id=workshop_id,
            trace_id=trace_id,
            trigger_comment_id=trigger_comment_id,
            created_by=user_id,
            milestone_ref=milestone_ref,
            run_id=run_input.run_id,
        )
    run_state: dict[str, Any] = {"partial_output": "", "tool_calls_count": 0, "reply_created": False}

    def _list_thread_comments(limit: int, include_agent: bool) -> list[dict[str, Any]]:
        rows = svc.db_service.list_discovery_comments(
            workshop_id=workshop_id,
            trace_id=trace_id,
            milestone_ref=milestone_ref,
            viewer_user_id=user_id,
        )
        if not include_agent:
            rows = [c for c in rows if c.author_type != "agent"]
        sample = rows[-limit:] if limit else rows
        return [
            {
                "id": c.id,
                "author": c.user_name,
                "author_type": c.author_type,
                "body": c.body,
                "created_at": c.created_at.isoformat(),
            }
            for c in sample
        ]

    def _create_thread_reply_comment(body: str) -> dict[str, Any]:
        created = svc.db_service.create_discovery_comment(
            workshop_id,
            DiscoveryCommentCreate(
                trace_id=trace_id,
                user_id="agent",
                body=body,
                milestone_ref=milestone_ref,
                parent_comment_id=parent_comment_id,
            ),
            author_type="agent",
        )
        run_state["reply_created"] = True
        return {"id": created.id, "status": "created"}

    def _create_rubric_criterion(args: dict[str, Any]) -> dict[str, Any]:
        def _normalize_text(value: str) -> str:
            return " ".join((value or "").strip().lower().split())

        if not run_record:
            return {"error": "Agent run is unavailable"}
        if run_record.created_by != workshop.facilitator_id:
            return {"error": "Only facilitators can create rubric criteria"}

        text = str(args.get("text") or "").strip()
        if not text:
            return {"error": "Missing required argument `text`"}

        raw_type = str(args.get("criterion_type") or "standard").strip().lower()
        if raw_type not in {"standard", "hurdle"}:
            return {"error": "Invalid `criterion_type` (expected `standard` or `hurdle`)"}
        criterion_type = TraceCriterionType(raw_type)
        weight, weight_details = _normalize_criterion_weight(criterion_type, args)

        rows = svc.db_service.list_discovery_comments(
            workshop_id=workshop_id,
            trace_id=trace_id,
            milestone_ref=milestone_ref,
            viewer_user_id=user_id,
        )
        comment_map = {c.id: c for c in rows}
        raw_lineage = args.get("lineage") if isinstance(args.get("lineage"), dict) else {}
        raw_comment_ids = raw_lineage.get("source_comment_ids", args.get("source_comment_ids", []))
        provided_comment_ids: list[str] = []
        if isinstance(raw_comment_ids, list):
            provided_comment_ids = [str(v) for v in raw_comment_ids if str(v).strip()]
        elif isinstance(raw_comment_ids, str) and raw_comment_ids.strip():
            provided_comment_ids = [raw_comment_ids.strip()]
        comment_ids = [cid for cid in provided_comment_ids if cid in comment_map]
        if not comment_ids:
            human_comment_ids = [c.id for c in rows if c.author_type == "human"]
            comment_ids = human_comment_ids[-5:] if human_comment_ids else [run_record.trigger_comment_id]
        vote_rows = [comment_map[cid] for cid in comment_ids if cid in comment_map]
        lineage = {
            "source_thread_type": "milestone" if run_record.milestone_ref else "trace",
            "source_milestone_ref": run_record.milestone_ref or None,
            "source_comment_ids": comment_ids,
            "source_vote_snapshot": {
                "included_comment_count": len(vote_rows),
                "upvotes_total": sum(max(0, int(c.upvotes or 0)) for c in vote_rows),
                "downvotes_total": sum(max(0, int(c.downvotes or 0)) for c in vote_rows),
                "score_total": sum(int(c.score or 0) for c in vote_rows),
            },
            "trigger_comment_id": run_record.trigger_comment_id,
        }

        if getattr(workshop, "mode", WorkshopMode.WORKSHOP.value) == WorkshopMode.EVAL.value:
            eval_service = EvalCriteriaService(db)
            normalized_new = _normalize_text(text)
            existing = eval_service.list_criteria(workshop_id=workshop_id, trace_id=trace_id)
            duplicate = next(
                (
                    c
                    for c in existing
                    if c.criterion_type == criterion_type
                    and int(c.weight) == int(weight)
                    and _normalize_text(c.text) == normalized_new
                ),
                None,
            )
            if duplicate:
                return {
                    "target": "trace_criteria",
                    "criterion_id": duplicate.id,
                    "trace_id": duplicate.trace_id,
                    "criterion_type": duplicate.criterion_type.value,
                    "weight": duplicate.weight,
                    "lineage": lineage,
                    "weight_details": {**weight_details, "deduped": True, "deduped_to": duplicate.id},
                }

            criterion = eval_service.create_criterion(
                workshop_id=workshop_id,
                trace_id=trace_id,
                data=TraceCriterionCreate(
                    text=text,
                    criterion_type=criterion_type,
                    weight=weight,
                    created_by=run_record.created_by,
                    lineage=lineage,
                ),
            )
            return {
                "target": "trace_criteria",
                "criterion_id": criterion.id,
                "trace_id": criterion.trace_id,
                "criterion_type": criterion.criterion_type.value,
                "weight": criterion.weight,
                "lineage": criterion.lineage,
                "weight_details": weight_details,
            }

        draft_item = svc.db_service.add_draft_rubric_item(
            workshop_id,
            DraftRubricItemCreate(
                text=text,
                source_type="feedback",
                source_trace_ids=[trace_id],
            ),
            promoted_by=run_record.created_by,
        )
        return {
            "target": "draft_rubric_items",
            "item_id": draft_item.id,
            "criterion_type": criterion_type.value,
            "weight": weight,
            "lineage": {
                **lineage,
                "criterion_type": criterion_type.value,
                "weight": weight,
            },
            "weight_details": weight_details,
        }

    deps.list_thread_comments_fn = _list_thread_comments
    deps.create_thread_reply_comment_fn = _create_thread_reply_comment
    deps.create_rubric_criterion_fn = _create_rubric_criterion

    async def _event_stream():
        state: dict[str, Any] = {"partial_output": "", "tool_calls_count": 0}
        try:
            async for chunk in run_ag_ui(
                ts_service.thread_agent,
                run_input=run_input,
                accept=request.headers.get("accept", "text/event-stream"),
                deps=deps,
            ):
                for payload_str in _iter_sse_data_payloads(chunk):
                    if payload_str == "[DONE]":
                        continue
                    try:
                        payload = json.loads(payload_str)
                    except json.JSONDecodeError:
                        continue
                    if isinstance(payload, dict):
                        _persist_ag_ui_payload(svc, run_input.run_id, payload, state=state)
                yield chunk
            final_text = str(state.get("partial_output") or "").strip()
            if final_text and not run_state.get("reply_created"):
                svc.db_service.create_discovery_comment(
                    workshop_id,
                    DiscoveryCommentCreate(
                        trace_id=trace_id,
                        user_id="agent",
                        body=final_text,
                        milestone_ref=milestone_ref,
                        parent_comment_id=parent_comment_id,
                    ),
                    author_type="agent",
                )
                run_state["reply_created"] = True
        except Exception as e:
            svc.db_service.update_discovery_agent_run(
                run_input.run_id,
                status="failed",
                partial_output=str(state.get("partial_output") or ""),
                error=str(e),
                completed=True,
            )
            raise

    return StreamingResponse(_event_stream(), media_type="text/event-stream")


@router.post("/{workshop_id}/traces/{trace_id}/ag-ui/summarization-assistant")
async def run_summarization_assistant_ag_ui(
    workshop_id: str,
    trace_id: str,
    request: Request,
    user_id: str,
    trigger_comment_id: str,
    db: Session = Depends(get_db),
):
    """Run trace summarization assistant through AG-UI streaming protocol."""
    svc = DiscoveryService(db)
    workshop = svc._get_workshop_or_404(workshop_id)
    trace = svc.db_service.get_trace(trace_id)
    if not trace or trace.workshop_id != workshop_id:
        raise HTTPException(status_code=404, detail="Trace not found")

    model_name = (
        (getattr(workshop, "summarization_model", None) or "").strip()
        or (getattr(workshop, "discovery_questions_model_name", None) or "").strip()
    )
    _, ts_service = _build_trace_summarization_service(svc, workshop_id, model_name=model_name)
    deps = TraceContext.from_dict(trace.context if isinstance(trace.context, dict) else {})
    trigger_comment = svc.db_service.get_discovery_comment(trigger_comment_id, viewer_user_id=user_id)
    if not trigger_comment or trigger_comment.workshop_id != workshop_id or trigger_comment.trace_id != trace_id:
        raise HTTPException(status_code=404, detail="Trigger comment not found")

    body = await request.body()
    run_input = AGUIAdapter.build_run_input(body)
    existing_run = svc.db_service.get_discovery_agent_run(run_input.run_id)
    if existing_run is None:
        svc.db_service.create_discovery_agent_run(
            workshop_id=workshop_id,
            trace_id=trace_id,
            trigger_comment_id=trigger_comment_id,
            created_by=user_id,
            milestone_ref=None,
            run_id=run_input.run_id,
        )

    async def _event_stream():
        state: dict[str, Any] = {"partial_output": "", "tool_calls_count": 0}
        try:
            async for chunk in run_ag_ui(
                ts_service.summary_agent,
                run_input=run_input,
                accept=request.headers.get("accept", "text/event-stream"),
                deps=deps,
            ):
                for payload_str in _iter_sse_data_payloads(chunk):
                    if payload_str == "[DONE]":
                        continue
                    try:
                        payload = json.loads(payload_str)
                    except json.JSONDecodeError:
                        continue
                    if isinstance(payload, dict):
                        _persist_ag_ui_payload(svc, run_input.run_id, payload, state=state)
                yield chunk
        except Exception as e:
            svc.db_service.update_discovery_agent_run(
                run_input.run_id,
                status="failed",
                partial_output=str(state.get("partial_output") or ""),
                error=str(e),
                completed=True,
            )
            raise

    return StreamingResponse(_event_stream(), media_type="text/event-stream")


@router.get("/{workshop_id}/discovery-comments/stream")
async def stream_discovery_comments(
    workshop_id: str,
    trace_id: str,
    milestone_ref: str | None = None,
    user_id: str | None = None,
    db: Session = Depends(get_db),
) -> StreamingResponse:
    svc = DiscoveryService(db)

    def event_generator():
        last_signature = ""
        while True:
            comments = svc.list_discovery_comments(
                workshop_id=workshop_id,
                trace_id=trace_id,
                milestone_ref=milestone_ref,
                user_id=user_id,
            )
            signature = f"{len(comments)}:{comments[-1].updated_at if comments else ''}"
            if signature != last_signature:
                last_signature = signature
                yield _sse_event(
                    "comments_snapshot",
                    {
                        "trace_id": trace_id,
                        "milestone_ref": milestone_ref,
                        "comments": [c.model_dump(mode="json") if hasattr(c, "model_dump") else c.dict() for c in comments],
                    },
                )
            else:
                yield _sse_event("heartbeat", {"trace_id": trace_id, "milestone_ref": milestone_ref})
            time.sleep(0.75)

    return StreamingResponse(event_generator(), media_type="text/event-stream")


# ---------------------------------------------------------------------------
# Assisted Facilitation v2 Endpoints
# ---------------------------------------------------------------------------


class SubmitFindingV2Request(BaseModel):
    """Request to submit a finding with classification."""

    trace_id: str
    user_id: str
    text: str


@router.post("/{workshop_id}/findings-v2", response_model=dict[str, Any])
async def submit_finding_v2(
    workshop_id: str,
    request: SubmitFindingV2Request,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Submit finding with real-time classification (v2 assisted facilitation)."""
    svc = DiscoveryService(db)
    return await svc.submit_finding_v2(
        workshop_id=workshop_id,
        trace_id=request.trace_id,
        user_id=request.user_id,
        finding_text=request.text,
    )


@router.get("/{workshop_id}/traces/{trace_id}/discovery-state", response_model=dict[str, Any])
async def get_trace_discovery_state(
    workshop_id: str,
    trace_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Get full structured state for facilitator."""
    svc = DiscoveryService(db)
    return svc.get_trace_discovery_state(workshop_id=workshop_id, trace_id=trace_id)


@router.get("/{workshop_id}/discovery-progress", response_model=dict[str, Any])
async def get_discovery_progress(
    workshop_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Get fuzzy global progress for participants."""
    svc = DiscoveryService(db)
    return svc.get_fuzzy_progress(workshop_id=workshop_id)


class PromoteFindingRequest(BaseModel):
    """Request to promote a finding."""

    finding_id: str
    promoter_id: str


@router.post("/{workshop_id}/findings/{finding_id}/promote", response_model=dict[str, Any])
async def promote_finding(
    workshop_id: str,
    finding_id: str,
    request: PromoteFindingRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Promote finding to draft rubric."""
    svc = DiscoveryService(db)
    return svc.promote_finding(
        workshop_id=workshop_id,
        finding_id=finding_id,
        promoter_id=request.promoter_id,
    )


class UpdateThresholdsRequest(BaseModel):
    """Request to update trace thresholds."""

    thresholds: dict[str, int]


@router.put("/{workshop_id}/traces/{trace_id}/thresholds", response_model=dict[str, Any])
async def update_trace_thresholds(
    workshop_id: str,
    trace_id: str,
    request: UpdateThresholdsRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Update thresholds for trace."""
    svc = DiscoveryService(db)
    return svc.update_trace_thresholds(
        workshop_id=workshop_id,
        trace_id=trace_id,
        thresholds=request.thresholds,
    )


@router.get("/{workshop_id}/draft-rubric", response_model=List[DraftRubricItem])
async def get_draft_rubric(
    workshop_id: str,
    db: Session = Depends(get_db),
) -> List[DraftRubricItem]:
    """Get all promoted findings (legacy endpoint, delegates to draft-rubric-items)."""
    svc = DiscoveryService(db)
    return svc.get_draft_rubric_items(workshop_id)


# ---------------------------------------------------------------------------
# Draft Rubric Items (Step 3 — Structured Feedback & Promotion)
# ---------------------------------------------------------------------------


class CreateDraftRubricItemRequest(BaseModel):
    """Request to create a draft rubric item."""

    text: str
    source_type: str = "manual"
    source_analysis_id: Optional[str] = None
    source_trace_ids: List[str] = []
    promoted_by: str


class UpdateDraftRubricItemRequest(BaseModel):
    """Request to update a draft rubric item."""

    text: Optional[str] = None
    group_id: Optional[str] = None
    group_name: Optional[str] = None


class ApplyGroupsRequest(BaseModel):
    """Request to apply group assignments."""

    groups: List[Dict[str, Any]]  # [{name: str, item_ids: [str]}]


@router.post("/{workshop_id}/draft-rubric-items", response_model=DraftRubricItem)
async def create_draft_rubric_item(
    workshop_id: str,
    request: CreateDraftRubricItemRequest,
    db: Session = Depends(get_db),
) -> DraftRubricItem:
    """Create a new draft rubric item."""
    svc = DiscoveryService(db)
    data = DraftRubricItemCreate(
        text=request.text,
        source_type=request.source_type,
        source_analysis_id=request.source_analysis_id,
        source_trace_ids=request.source_trace_ids,
    )
    return svc.create_draft_rubric_item(workshop_id, data, promoted_by=request.promoted_by)


@router.get("/{workshop_id}/draft-rubric-items", response_model=List[DraftRubricItem])
async def get_draft_rubric_items(
    workshop_id: str,
    db: Session = Depends(get_db),
) -> List[DraftRubricItem]:
    """Get all draft rubric items for a workshop."""
    svc = DiscoveryService(db)
    return svc.get_draft_rubric_items(workshop_id)


@router.post("/{workshop_id}/draft-rubric-items/suggest-groups")
async def suggest_draft_rubric_groups(
    workshop_id: str,
    db: Session = Depends(get_db),
) -> SuggestGroupsResponse:
    """LLM-suggested grouping of draft rubric items (not persisted)."""
    svc = DiscoveryService(db)
    groups = svc.suggest_draft_rubric_groups(workshop_id)
    return SuggestGroupsResponse(groups=[ProposedGroup(**g) if isinstance(g, dict) else g for g in groups])


@router.post("/{workshop_id}/draft-rubric-items/apply-groups")
async def apply_draft_rubric_groups(
    workshop_id: str,
    request: ApplyGroupsRequest,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Persist group assignments to draft rubric items."""
    svc = DiscoveryService(db)
    svc.apply_draft_rubric_groups(workshop_id, request.groups)
    return {"message": "Groups applied successfully"}


class CreateRubricFromDraftRequest(BaseModel):
    """Request to create a rubric from draft items."""

    created_by: str


@router.post("/{workshop_id}/draft-rubric-items/create-rubric", response_model=Rubric)
async def create_rubric_from_draft(
    workshop_id: str,
    request: CreateRubricFromDraftRequest,
    db: Session = Depends(get_db),
) -> Rubric:
    """Create a rubric from draft rubric items.

    Groups become rubric questions (group_name -> title, item texts -> description).
    Ungrouped items each become their own question. All default to LIKERT judge type.
    """
    svc = DiscoveryService(db)
    return svc.create_rubric_from_draft(workshop_id, created_by=request.created_by)



@router.put("/{workshop_id}/draft-rubric-items/{item_id}", response_model=DraftRubricItem)
async def update_draft_rubric_item(
    workshop_id: str,
    item_id: str,
    request: UpdateDraftRubricItemRequest,
    db: Session = Depends(get_db),
) -> DraftRubricItem:
    """Update a draft rubric item."""
    svc = DiscoveryService(db)
    updates = DraftRubricItemUpdate(
        text=request.text,
        group_id=request.group_id,
        group_name=request.group_name,
    )
    return svc.update_draft_rubric_item(item_id, updates)


@router.delete("/{workshop_id}/draft-rubric-items/{item_id}")
async def delete_draft_rubric_item(
    workshop_id: str,
    item_id: str,
    db: Session = Depends(get_db),
) -> Dict[str, Any]:
    """Delete a draft rubric item."""
    svc = DiscoveryService(db)
    svc.delete_draft_rubric_item(item_id)
    return {"message": "Draft rubric item deleted"}


