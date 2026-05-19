"""Persistence service for eval-mode per-trace criteria and evaluations."""

from __future__ import annotations

from typing import Optional

from fastapi import HTTPException
from sqlalchemy.orm import Session

from server.database import CriterionEvaluationDB, TraceCriterionDB, TraceDB, WorkshopDB
from server.models import (
    CriterionEvaluation,
    TraceCriterion,
    TraceCriterionCreate,
    TraceCriterionType,
    TraceCriterionUpdate,
    WorkshopMode,
)


class EvalCriteriaService:
    """Owns CRUD for eval-mode trace criteria and criterion evaluations."""

    def __init__(self, db: Session):
        self.db = db

    def _get_eval_workshop_or_404(self, workshop_id: str) -> WorkshopDB:
        workshop = self.db.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()
        if not workshop:
            raise HTTPException(status_code=404, detail="Workshop not found")
        mode = getattr(workshop, "mode", WorkshopMode.WORKSHOP.value) or WorkshopMode.WORKSHOP.value
        if mode != WorkshopMode.EVAL.value:
            raise HTTPException(
                status_code=409,
                detail="Global rubric workflow is disabled for this endpoint; workshop mode must be 'eval'.",
            )
        return workshop

    def _criterion_from_db(self, row: TraceCriterionDB) -> TraceCriterion:
        return TraceCriterion(
            id=row.id,
            trace_id=row.trace_id,
            workshop_id=row.workshop_id,
            text=row.text,
            criterion_type=TraceCriterionType(row.criterion_type),
            weight=row.weight,
            source_finding_id=row.source_finding_id,
            created_by=row.created_by,
            order=row.order or 0,
            created_at=row.created_at,
            updated_at=row.updated_at or row.created_at,
        )

    def _evaluation_from_db(self, row: CriterionEvaluationDB) -> CriterionEvaluation:
        return CriterionEvaluation(
            id=row.id,
            criterion_id=row.criterion_id,
            trace_id=row.trace_id,
            workshop_id=row.workshop_id,
            judge_model=row.judge_model,
            met=row.met,
            rationale=row.rationale,
            raw_response=row.raw_response,
            created_at=row.created_at,
        )

    def create_criterion(self, workshop_id: str, trace_id: str, data: TraceCriterionCreate) -> TraceCriterion:
        self._get_eval_workshop_or_404(workshop_id)

        trace = self.db.query(TraceDB).filter(TraceDB.id == trace_id, TraceDB.workshop_id == workshop_id).first()
        if not trace:
            raise HTTPException(status_code=404, detail="Trace not found")

        db_row = TraceCriterionDB(
            trace_id=trace_id,
            workshop_id=workshop_id,
            text=data.text,
            criterion_type=data.criterion_type.value,
            weight=data.weight,
            source_finding_id=data.source_finding_id,
            created_by=data.created_by,
            order=data.order,
        )
        self.db.add(db_row)
        self.db.commit()
        self.db.refresh(db_row)
        return self._criterion_from_db(db_row)

    def list_criteria(self, workshop_id: str, trace_id: str) -> list[TraceCriterion]:
        self._get_eval_workshop_or_404(workshop_id)
        rows = (
            self.db.query(TraceCriterionDB)
            .filter(TraceCriterionDB.workshop_id == workshop_id, TraceCriterionDB.trace_id == trace_id)
            .order_by(TraceCriterionDB.order.asc(), TraceCriterionDB.created_at.asc())
            .all()
        )
        return [self._criterion_from_db(row) for row in rows]

    def get_criterion(self, workshop_id: str, criterion_id: str) -> Optional[TraceCriterion]:
        self._get_eval_workshop_or_404(workshop_id)
        row = (
            self.db.query(TraceCriterionDB)
            .filter(TraceCriterionDB.id == criterion_id, TraceCriterionDB.workshop_id == workshop_id)
            .first()
        )
        if not row:
            return None
        return self._criterion_from_db(row)

    def update_criterion(self, workshop_id: str, criterion_id: str, updates: TraceCriterionUpdate) -> Optional[TraceCriterion]:
        self._get_eval_workshop_or_404(workshop_id)
        row = (
            self.db.query(TraceCriterionDB)
            .filter(TraceCriterionDB.id == criterion_id, TraceCriterionDB.workshop_id == workshop_id)
            .first()
        )
        if not row:
            return None

        if updates.text is not None:
            row.text = updates.text
        if updates.criterion_type is not None:
            row.criterion_type = updates.criterion_type.value
        if updates.weight is not None:
            row.weight = updates.weight
        if updates.order is not None:
            row.order = updates.order

        self.db.commit()
        self.db.refresh(row)
        return self._criterion_from_db(row)

    def delete_criterion(self, workshop_id: str, criterion_id: str) -> bool:
        self._get_eval_workshop_or_404(workshop_id)
        row = (
            self.db.query(TraceCriterionDB)
            .filter(TraceCriterionDB.id == criterion_id, TraceCriterionDB.workshop_id == workshop_id)
            .first()
        )
        if not row:
            return False
        self.db.delete(row)
        self.db.commit()
        return True

    def create_evaluation(
        self,
        workshop_id: str,
        criterion_id: str,
        trace_id: str,
        judge_model: str,
        met: bool,
        rationale: str | None = None,
        raw_response: dict | None = None,
    ) -> CriterionEvaluation:
        self._get_eval_workshop_or_404(workshop_id)
        row = CriterionEvaluationDB(
            criterion_id=criterion_id,
            trace_id=trace_id,
            workshop_id=workshop_id,
            judge_model=judge_model,
            met=met,
            rationale=rationale,
            raw_response=raw_response,
        )
        self.db.add(row)
        self.db.commit()
        self.db.refresh(row)
        return self._evaluation_from_db(row)

    def list_evaluations(self, workshop_id: str, trace_id: str) -> list[CriterionEvaluation]:
        self._get_eval_workshop_or_404(workshop_id)
        rows = (
            self.db.query(CriterionEvaluationDB)
            .filter(CriterionEvaluationDB.workshop_id == workshop_id, CriterionEvaluationDB.trace_id == trace_id)
            .order_by(CriterionEvaluationDB.created_at.asc())
            .all()
        )
        return [self._evaluation_from_db(row) for row in rows]
