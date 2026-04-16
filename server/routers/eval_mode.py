"""Eval mode API endpoints."""

from __future__ import annotations

import logging
import threading
import uuid
from typing import Any

from fastapi import APIRouter, Depends, HTTPException, Query, Response, status
from pydantic import BaseModel, Field
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
from server.services.eval_mode_service import EvalJob, EvalModeService

logger = logging.getLogger(__name__)

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


# ------------------------------------------------------------------
# Judge execution endpoints
# ------------------------------------------------------------------


class EvalEvaluateRequest(BaseModel):
    model_name: str = Field(default="demo", description="Model serving endpoint or 'demo'")
    trace_ids: list[str] | None = Field(default=None, description="Specific traces, or null for all with criteria")


@router.post("/{workshop_id}/evaluate")
async def start_eval_judge_run(
    workshop_id: str,
    request: EvalEvaluateRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Start a background judge evaluation job for eval-mode criteria."""
    criteria_service = EvalCriteriaService(db)
    db_service = DatabaseService(db)

    traces = db_service.get_traces(workshop_id)
    if request.trace_ids:
        traces = [t for t in traces if t.id in request.trace_ids]

    pairs: list[tuple[str, str]] = []
    for trace in traces:
        criteria = criteria_service.list_criteria(workshop_id, trace.id)
        for criterion in criteria:
            pairs.append((trace.id, criterion.id))

    if not pairs:
        raise HTTPException(status_code=400, detail="No criteria found to evaluate")

    job_id = str(uuid.uuid4())
    job = EvalJob(job_id, workshop_id)
    job.total = len(pairs)
    job.set_status("running")
    job.add_log(f"Starting evaluation of {len(pairs)} criteria across {len(traces)} traces")

    def _run_eval_background():
        from server.database import SessionLocal

        try:
            with SessionLocal() as bg_db:
                bg_criteria_svc = EvalCriteriaService(bg_db)
                bg_db_svc = DatabaseService(bg_db)
                bg_traces = bg_db_svc.get_traces(workshop_id)
                trace_map = {t.id: t for t in bg_traces}

                for trace_id, criterion_id in pairs:
                    trace = trace_map.get(trace_id)
                    criterion = bg_criteria_svc.get_criterion(workshop_id, criterion_id)
                    if not trace or not criterion:
                        job.failed += 1
                        job.add_log(f"Skip {criterion_id}: trace or criterion missing")
                        continue

                    try:
                        context = EvalModeService.build_judge_context(trace, criterion)
                        prompt = EvalModeService.build_criterion_judge_prompt(context, criterion)

                        if request.model_name == "demo":
                            import random
                            met = random.choice([True, True, True, False])
                            rationale = "Demo mode: simulated evaluation"
                        else:
                            from server.services.databricks_service import call_serving_endpoint
                            raw = call_serving_endpoint(request.model_name, prompt)
                            met, rationale = EvalModeService.parse_judge_response(raw)

                        bg_criteria_svc.create_evaluation(
                            workshop_id=workshop_id,
                            criterion_id=criterion_id,
                            trace_id=trace_id,
                            judge_model=request.model_name,
                            met=met,
                            rationale=rationale,
                        )
                        job.completed += 1
                    except Exception as exc:
                        job.failed += 1
                        job.add_log(f"Error evaluating {criterion_id}: {exc}")

                    job.save()

                job.set_status("completed")
                job.add_log(f"Completed: {job.completed} succeeded, {job.failed} failed")
        except Exception as exc:
            job.error = str(exc)
            job.set_status("failed")
            job.add_log(f"Job failed: {exc}")

    thread = threading.Thread(target=_run_eval_background, daemon=True)
    thread.start()

    return {
        "job_id": job_id,
        "total_criteria": len(pairs),
        "message": f"Evaluation started for {len(pairs)} criteria",
    }


@router.get("/{workshop_id}/eval-job/{job_id}")
async def get_eval_job_status(
    workshop_id: str,
    job_id: str,
) -> dict[str, Any]:
    """Poll eval-mode judge evaluation job progress."""
    job = EvalJob.load(job_id)
    if not job:
        raise HTTPException(status_code=404, detail="Eval job not found")
    if job.workshop_id != workshop_id:
        raise HTTPException(status_code=403, detail="Job does not belong to this workshop")
    return {
        "job_id": job.job_id,
        "status": job.status,
        "total": job.total,
        "completed": job.completed,
        "failed": job.failed,
        "error": job.error,
        "logs": job.logs[-20:],
    }


# ------------------------------------------------------------------
# Eval-mode IRR endpoint
# ------------------------------------------------------------------


@router.get("/{workshop_id}/eval-irr")
async def get_eval_irr(
    workshop_id: str,
    trace_id: str | None = Query(default=None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Compute eval-mode IRR (pairwise agreement on criterion decisions)."""
    criteria_service = EvalCriteriaService(db)
    db_service = DatabaseService(db)

    if trace_id:
        trace_ids = [trace_id]
    else:
        traces = db_service.get_traces(workshop_id)
        trace_ids = [t.id for t in traces]

    all_criteria: list[TraceCriterion] = []
    all_evaluations: list[CriterionEvaluation] = []
    for tid in trace_ids:
        all_criteria.extend(criteria_service.list_criteria(workshop_id, tid))
        all_evaluations.extend(criteria_service.list_evaluations(workshop_id, tid))

    return EvalModeService.calculate_eval_irr(all_criteria, all_evaluations)


# ------------------------------------------------------------------
# Eval-mode Alignment endpoints
# ------------------------------------------------------------------


class EvalAlignRequest(BaseModel):
    evaluation_model_name: str = Field(..., description="Model for judge evaluation")
    alignment_model_name: str | None = Field(default=None, description="Model for MemAlign optimizer")
    embedding_model_name: str = Field(default="databricks-gte-large-en")


@router.post("/{workshop_id}/align")
async def start_eval_alignment(
    workshop_id: str,
    request: EvalAlignRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Start eval-mode judge alignment using criterion-level assessments."""
    db_service = DatabaseService(db)
    mlflow_config = db_service.get_mlflow_config(workshop_id)
    if not mlflow_config:
        raise HTTPException(status_code=400, detail="MLflow configuration required")

    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    judge_name = "eval_mode_judge"

    job_id = str(uuid.uuid4())
    job = EvalJob(job_id, workshop_id)
    job.set_status("running")
    job.add_log("Starting eval-mode alignment")

    def _run_alignment_background():
        from server.database import SessionLocal

        try:
            with SessionLocal() as bg_db:
                from server.services.alignment_service import AlignmentService

                bg_db_svc = DatabaseService(bg_db)
                alignment_svc = AlignmentService(bg_db_svc)

                bg_mlflow_config = bg_db_svc.get_mlflow_config(workshop_id)
                if not bg_mlflow_config:
                    job.error = "MLflow configuration not found"
                    job.set_status("failed")
                    return

                judge_prompt = (
                    "You are an expert evaluator. Determine whether the trace "
                    "meets a single evaluation criterion. Return JSON with "
                    '"met" (boolean) and "rationale" (string).'
                )

                for message in alignment_svc.run_alignment(
                    workshop_id=workshop_id,
                    judge_name=judge_name,
                    judge_prompt=judge_prompt,
                    evaluation_model_name=request.evaluation_model_name,
                    alignment_model_name=request.alignment_model_name or request.evaluation_model_name,
                    mlflow_config=bg_mlflow_config,
                    embedding_model_name=request.embedding_model_name,
                ):
                    if isinstance(message, dict):
                        job.result = message
                        if message.get("success"):
                            job.set_status("completed")
                            job.add_log("Alignment completed successfully")
                        else:
                            job.error = message.get("error", "Unknown error")
                            job.set_status("failed")
                    else:
                        job.add_log(str(message))

        except Exception as exc:
            job.error = str(exc)
            job.set_status("failed")
            job.add_log(f"Alignment failed: {exc}")

    thread = threading.Thread(target=_run_alignment_background, daemon=True)
    thread.start()

    return {
        "job_id": job_id,
        "message": "Eval-mode alignment started",
        "judge_name": judge_name,
    }


@router.get("/{workshop_id}/alignment-status")
async def get_eval_alignment_status(
    workshop_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Get eval-mode alignment readiness status."""
    criteria_service = EvalCriteriaService(db)
    db_service = DatabaseService(db)

    traces = db_service.get_traces(workshop_id)
    mlflow_config = db_service.get_mlflow_config(workshop_id)

    total_criteria = 0
    human_evaluated = 0
    for trace in traces:
        criteria = criteria_service.list_criteria(workshop_id, trace.id)
        total_criteria += len(criteria)
        evals = criteria_service.list_evaluations(workshop_id, trace.id)
        human_evals = {e.criterion_id for e in evals if e.judge_model == "HUMAN"}
        human_evaluated += len(human_evals)

    return {
        "total_criteria": total_criteria,
        "human_evaluated": human_evaluated,
        "traces_count": len(traces),
        "mlflow_configured": mlflow_config is not None,
        "ready_for_alignment": human_evaluated > 0 and mlflow_config is not None,
        "message": f"{human_evaluated}/{total_criteria} criteria have human evaluations",
    }
