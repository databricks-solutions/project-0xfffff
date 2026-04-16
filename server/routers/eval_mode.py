"""Eval mode API endpoints."""

from __future__ import annotations

from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from sqlalchemy.orm import Session

from server.database import get_db
from server.models import (
    CriterionEvaluation,
    CriterionEvaluationCreate,
    TraceCriterion,
    TraceCriterionCreate,
    TraceCriterionUpdate,
    TraceEvalScore,
    TraceRubric,
)
from server.services.database_service import DatabaseService
from server.services.eval_criteria_service import EvalCriteriaService
from server.services.eval_mode_service import EvalModeService

router = APIRouter()


@router.post("/{workshop_id}/traces/{trace_id}/criteria", response_model=TraceCriterion, status_code=status.HTTP_201_CREATED)
async def create_trace_criterion(
    workshop_id: str,
    trace_id: str,
    data: TraceCriterionCreate,
    db: Session = Depends(get_db),
) -> TraceCriterion:
    service = EvalCriteriaService(db)
    return service.create_criterion(workshop_id, trace_id, data)


@router.get("/{workshop_id}/traces/{trace_id}/criteria", response_model=list[TraceCriterion])
async def list_trace_criteria(
    workshop_id: str,
    trace_id: str,
    db: Session = Depends(get_db),
) -> list[TraceCriterion]:
    service = EvalCriteriaService(db)
    return service.list_criteria(workshop_id, trace_id)


@router.put("/{workshop_id}/criteria/{criterion_id}", response_model=TraceCriterion)
async def update_trace_criterion(
    workshop_id: str,
    criterion_id: str,
    updates: TraceCriterionUpdate,
    db: Session = Depends(get_db),
) -> TraceCriterion:
    service = EvalCriteriaService(db)
    updated = service.update_criterion(workshop_id, criterion_id, updates)
    if updated is None:
        raise HTTPException(status_code=404, detail="Criterion not found")
    return updated


@router.delete("/{workshop_id}/criteria/{criterion_id}", status_code=status.HTTP_204_NO_CONTENT)
async def delete_trace_criterion(
    workshop_id: str,
    criterion_id: str,
    db: Session = Depends(get_db),
) -> Response:
    service = EvalCriteriaService(db)
    deleted = service.delete_criterion(workshop_id, criterion_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Criterion not found")
    return Response(status_code=status.HTTP_204_NO_CONTENT)


@router.get("/{workshop_id}/traces/{trace_id}/rubric", response_model=TraceRubric)
async def get_trace_rubric(
    workshop_id: str,
    trace_id: str,
    db: Session = Depends(get_db),
) -> TraceRubric:
    criteria_service = EvalCriteriaService(db)
    criteria = criteria_service.list_criteria(workshop_id, trace_id)
    return EvalModeService.render_trace_rubric(workshop_id, trace_id, criteria)


@router.post("/{workshop_id}/traces/{trace_id}/criteria/{criterion_id}/evaluations", response_model=CriterionEvaluation, status_code=status.HTTP_201_CREATED)
async def create_criterion_evaluation(
    workshop_id: str,
    trace_id: str,
    criterion_id: str,
    data: CriterionEvaluationCreate,
    db: Session = Depends(get_db),
) -> CriterionEvaluation:
    service = EvalCriteriaService(db)
    return service.create_evaluation(
        workshop_id=workshop_id,
        criterion_id=criterion_id,
        trace_id=trace_id,
        judge_model=data.judge_model,
        met=data.met,
        rationale=data.rationale,
        raw_response=data.raw_response,
    )


@router.get("/{workshop_id}/eval-results", response_model=list[TraceEvalScore])
async def get_eval_results(
    workshop_id: str,
    trace_id: str | None = Query(default=None),
    judge_model: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> list[TraceEvalScore]:
    criteria_service = EvalCriteriaService(db)
    db_service = DatabaseService(db)

    if trace_id:
        trace_ids = [trace_id]
    else:
        traces = db_service.get_traces(workshop_id)
        trace_ids = [trace.id for trace in traces]

    results: list[TraceEvalScore] = []
    for current_trace_id in trace_ids:
        criteria = criteria_service.list_criteria(workshop_id, current_trace_id)
        evaluations = criteria_service.list_evaluations(workshop_id, current_trace_id, judge_model=judge_model)
        results.append(EvalModeService.aggregate_trace_score(current_trace_id, criteria, evaluations))

    return results
