"""Workshop API endpoints."""

import json
import logging
import os
import threading
import time
import uuid
from dataclasses import dataclass, field
from typing import Any, Optional

from fastapi import APIRouter, Depends, File, Form, HTTPException, UploadFile, status
from pydantic import BaseModel
from sqlalchemy.orm import Session

# ============================================================================
# File-based job store for alignment/evaluation jobs (works with multi-worker)
# ============================================================================

JOB_DIR = "/tmp/workshop_jobs"
os.makedirs(JOB_DIR, exist_ok=True)


@dataclass
class AlignmentJob:
    """Represents an alignment job with its status and logs."""

    job_id: str
    workshop_id: str
    status: str = "pending"  # pending, running, completed, failed
    logs: list[str] = field(default_factory=list)
    result: dict[str, Any] | None = None
    error: str | None = None
    created_at: float = field(default_factory=time.time)
    updated_at: float = field(default_factory=time.time)

    @property
    def _meta_path(self) -> str:
        return os.path.join(JOB_DIR, f"{self.job_id}.json")

    @property
    def _log_path(self) -> str:
        return os.path.join(JOB_DIR, f"{self.job_id}.logs")

    def save(self):
        """Save job metadata to disk."""
        data = {
            "job_id": self.job_id,
            "workshop_id": self.workshop_id,
            "status": self.status,
            "result": self.result,
            "error": self.error,
            "created_at": self.created_at,
            "updated_at": self.updated_at,
        }
        # Write atomically
        temp_path = self._meta_path + ".tmp"
        with open(temp_path, "w") as f:
            json.dump(data, f)
        os.rename(temp_path, self._meta_path)

    @classmethod
    def load(cls, job_id: str) -> Optional["AlignmentJob"]:
        """Load job from disk."""
        path = os.path.join(JOB_DIR, f"{job_id}.json")
        if not os.path.exists(path):
            return None

        try:
            with open(path) as f:
                data = json.load(f)

            job = cls(
                job_id=data["job_id"],
                workshop_id=data["workshop_id"],
                status=data["status"],
                result=data.get("result"),
                error=data.get("error"),
                created_at=data.get("created_at", time.time()),
                updated_at=data.get("updated_at", time.time()),
            )

            # Load logs from separate file
            log_path = job._log_path
            if os.path.exists(log_path):
                with open(log_path) as f:
                    # Logs are newline-separated JSON strings to handle multiline messages safely
                    job.logs = []
                    for line in f:
                        try:
                            if line.strip():
                                job.logs.append(json.loads(line))
                        except Exception:
                            pass
            return job
        except Exception as e:
            logging.error(f"Failed to load job {job_id}: {e}")
            return None

    def add_log(self, message: str):
        """Add a log message and update timestamp."""
        self.logs.append(message)
        self.updated_at = time.time()
        # Append to log file immediately
        with open(self._log_path, "a") as f:
            f.write(json.dumps(message) + "\n")
        # Update metadata periodically or on status change
        # For simplicity, we just update memory here and let caller call save() for status changes

    def set_status(self, status: str):
        """Update job status and save."""
        self.status = status
        self.updated_at = time.time()
        self.save()


# Helper to get job (replaces _alignment_jobs dict)
def get_job(job_id: str) -> AlignmentJob | None:
    return AlignmentJob.load(job_id)


# Helper to create job
def create_job(job_id: str, workshop_id: str) -> AlignmentJob:
    job = AlignmentJob(job_id=job_id, workshop_id=workshop_id)
    job.save()
    # Ensure empty log file exists
    open(job._log_path, "a").close()
    return job


import random

from sqlalchemy.exc import OperationalError

from server.database import WorkshopDB, get_db
from server.models import (
    AnalyzeDiscoveryRequest,
    Annotation,
    AnnotationCreate,
    DiscoveryFinding,
    DiscoveryFindingCreate,
    DiscoveryFindingWithUser,
    IRRResult,
    JudgeEvaluation,
    JudgeEvaluationDirectRequest,
    JudgeEvaluationRequest,
    JudgeEvaluationResult,
    JudgeExportConfig,
    JudgePerformanceMetrics,
    JudgePrompt,
    JudgePromptCreate,
    JudgeType,
    MLflowIntakeConfig,
    MLflowIntakeConfigCreate,
    MLflowIntakeStatus,
    MLflowTraceInfo,
    ParticipantNote,
    ParticipantNoteCreate,
    Rubric,
    RubricCreate,
    RubricGenerationRequest,
    RubricSuggestion,
    Trace,
    TraceUpload,
    Workshop,
    WorkshopCreate,
    WorkshopPhase,
)
from server.services.database_service import DatabaseService
from server.services.irr_service import calculate_irr_for_workshop


def _retry_db_operations(operations_fn, db_session, max_retries=5, base_delay=0.5):
    """Execute database operations with retry logic for SQLite locking.

    Args:
        operations_fn: A callable that performs the database operations
        db_session: The SQLAlchemy session to rollback on failures
        max_retries: Maximum number of retry attempts
        base_delay: Base delay in seconds for exponential backoff

    Returns:
        The result of operations_fn if successful

    Raises:
        HTTPException: If all retries are exhausted
    """
    for attempt in range(max_retries):
        try:
            return operations_fn()
        except OperationalError as e:
            if "locked" in str(e).lower() and attempt < max_retries - 1:
                delay = base_delay * (2**attempt) + random.uniform(0, 0.5)
                logging.getLogger(__name__).warning(
                    f"Database locked, retry {attempt + 1}/{max_retries} in {delay:.2f}s"
                )
                db_session.rollback()
                time.sleep(delay)
            else:
                logging.getLogger(__name__).error(f"Database error after {attempt + 1} attempts: {e}")
                raise HTTPException(status_code=503, detail="Database temporarily unavailable. Please try again.") from e
    return None


# Request models for alignment
class AlignmentRequest(BaseModel):
    """Request model for running judge alignment."""

    judge_name: str
    judge_prompt: str
    evaluation_model_name: str  # Model for evaluate() job
    alignment_model_name: str | None = None  # Model for SIMBA optimizer (judge_model_uri), required for alignment
    prompt_id: str | None = None  # Existing prompt ID to update (instead of creating a new one)
    judge_type: str | None = None  # Explicit judge type: 'likert', 'binary', 'freeform'


class SimpleEvaluationRequest(BaseModel):
    """Request model for simple model serving evaluation (no MLflow)."""

    judge_prompt: str
    endpoint_name: str  # Databricks model serving endpoint name
    judge_name: str | None = "workshop_judge"  # Name for MLflow feedback entries
    prompt_id: str | None = None  # Existing prompt ID to update
    judge_type: str | None = None  # Explicit judge type: 'likert', 'binary', 'freeform'


router = APIRouter()
logger = logging.getLogger(__name__)


@router.get("/")
async def list_workshops(
    facilitator_id: str | None = None, user_id: str | None = None, db: Session = Depends(get_db)
) -> list[Workshop]:
    """List all workshops, optionally filtered by facilitator or user.

    Args:
        facilitator_id: If provided, only return workshops created by this facilitator
        user_id: If provided, return all workshops the user has access to (as facilitator or participant)
        db: Database session

    Returns:
        List of workshops sorted by creation date (newest first)
    """
    db_service = DatabaseService(db)

    if user_id:
        # Return all workshops the user has access to
        return db_service.get_workshops_for_user(user_id)
    # Return all workshops (optionally filtered by facilitator)
    return db_service.list_workshops(facilitator_id)


@router.post("/", status_code=status.HTTP_201_CREATED)
async def create_workshop(workshop_data: WorkshopCreate, db: Session = Depends(get_db)) -> Workshop:
    """Create a new workshop."""
    db_service = DatabaseService(db)
    return db_service.create_workshop(workshop_data)


@router.get("/{workshop_id}")
async def get_workshop(workshop_id: str, db: Session = Depends(get_db)) -> Workshop:
    """Get workshop details."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")
    return workshop


@router.put("/{workshop_id}/judge-name")
async def update_judge_name(workshop_id: str, judge_name: str, db: Session = Depends(get_db)):
    """Update the judge name for the workshop. Should be set before annotation phase."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Update the judge name in the database
    db_service.update_workshop_judge_name(workshop_id, judge_name)
    return {"message": "Judge name updated successfully", "judge_name": judge_name}


# JSONPath Settings Models
class JsonPathSettingsUpdate(BaseModel):
    """Request model for updating JSONPath settings."""

    input_jsonpath: str | None = None
    output_jsonpath: str | None = None


class JsonPathPreviewRequest(BaseModel):
    """Request model for previewing JSONPath extraction."""

    input_jsonpath: str | None = None
    output_jsonpath: str | None = None


@router.put("/{workshop_id}/jsonpath-settings")
async def update_jsonpath_settings(
    workshop_id: str, settings: JsonPathSettingsUpdate, db: Session = Depends(get_db)
) -> Workshop:
    """Update JSONPath settings for trace display customization.

    These settings allow facilitators to configure JSONPath queries that
    extract specific values from trace inputs and outputs for cleaner display
    in the TraceViewer.
    """
    from server.utils.jsonpath_utils import validate_jsonpath

    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Validate JSONPath expressions if provided
    if settings.input_jsonpath:
        is_valid, error_msg = validate_jsonpath(settings.input_jsonpath)
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid input JSONPath: {error_msg}")

    if settings.output_jsonpath:
        is_valid, error_msg = validate_jsonpath(settings.output_jsonpath)
        if not is_valid:
            raise HTTPException(status_code=400, detail=f"Invalid output JSONPath: {error_msg}")

    # Update settings
    updated_workshop = db_service.update_workshop_jsonpath_settings(
        workshop_id,
        input_jsonpath=settings.input_jsonpath,
        output_jsonpath=settings.output_jsonpath,
    )

    if not updated_workshop:
        raise HTTPException(status_code=500, detail="Failed to update JSONPath settings")

    return updated_workshop


@router.post("/{workshop_id}/preview-jsonpath")
async def preview_jsonpath(
    workshop_id: str, preview_request: JsonPathPreviewRequest, db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Preview JSONPath extraction against the first trace in the workshop.

    This allows facilitators to test their JSONPath queries before saving
    to verify they extract the expected content.
    """
    from server.utils.jsonpath_utils import apply_jsonpath

    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Get the first trace from the workshop
    traces = db_service.get_traces(workshop_id)
    if not traces:
        return {"error": "No traces available for preview"}

    first_trace = traces[0]

    # Apply JSONPath to input
    input_result = None
    input_success = False
    if preview_request.input_jsonpath:
        input_result, input_success = apply_jsonpath(first_trace.input, preview_request.input_jsonpath)

    # Apply JSONPath to output
    output_result = None
    output_success = False
    if preview_request.output_jsonpath:
        output_result, output_success = apply_jsonpath(first_trace.output, preview_request.output_jsonpath)

    return {
        "trace_id": first_trace.id,
        "input_result": input_result if input_success else first_trace.input,
        "input_success": input_success,
        "output_result": output_result if output_success else first_trace.output,
        "output_success": output_success,
    }


@router.post("/{workshop_id}/resync-annotations")
async def resync_annotations(workshop_id: str, db: Session = Depends(get_db)):
    """Re-sync all annotations to MLflow with the current workshop judge_name.

    This is useful when the judge_name changes after annotations were created.
    Creates new MLflow feedback entries with the correct judge_name.
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    result = db_service.resync_annotations_to_mlflow(workshop_id)
    return result


@router.post("/{workshop_id}/traces")
async def upload_traces(workshop_id: str, traces: list[TraceUpload], db: Session = Depends(get_db)) -> list[Trace]:
    """Upload traces to a workshop."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    return db_service.add_traces(workshop_id, traces)


@router.get("/{workshop_id}/traces")
async def get_traces(workshop_id: str, user_id: str | None = None, db: Session = Depends(get_db)) -> list[Trace]:
    """Get traces for a workshop in user-specific order.

    Args:
        workshop_id: The workshop ID
        user_id: The user ID (REQUIRED for personalized trace ordering)
        db: Database session

    Returns:
        List of traces in user-specific order

    Raises:
        HTTPException: If workshop not found or user_id not provided
    """
    if not user_id:
        raise HTTPException(status_code=400, detail="user_id is required for fetching traces")

    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # If we're in discovery phase and have active discovery traces, return only those
    if workshop.current_phase == "discovery" and workshop.active_discovery_trace_ids:
        return db_service.get_active_discovery_traces(workshop_id, user_id)
    # If we're in annotation phase and have active annotation traces, return only those
    if workshop.current_phase == "annotation" and workshop.active_annotation_trace_ids:
        return db_service.get_active_annotation_traces(workshop_id, user_id)
    # Otherwise return all traces (for facilitators managing the workshop)
    # For facilitators viewing all traces, we don't need user-specific ordering
    return db_service.get_traces(workshop_id)


@router.get("/{workshop_id}/all-traces")
async def get_all_traces(workshop_id: str, db: Session = Depends(get_db)) -> list[Trace]:
    """Get ALL traces for a workshop, unfiltered by phase."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Always return all traces, regardless of phase
    return db_service.get_traces(workshop_id)


@router.get("/{workshop_id}/original-traces")
async def get_original_traces(workshop_id: str, db: Session = Depends(get_db)) -> list[Trace]:
    """Get only the original intake traces for a workshop (no duplicates).

    This endpoint is used for judge tuning where we only want to evaluate
    the original traces, not multiple instances from different annotators.
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Get only the original traces from the database
    return db_service.get_traces(workshop_id)


@router.post("/{workshop_id}/findings")
async def submit_finding(
    workshop_id: str, finding: DiscoveryFindingCreate, db: Session = Depends(get_db)
) -> DiscoveryFinding:
    """Submit a discovery finding."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    try:
        return db_service.add_finding(workshop_id, finding)
    except Exception as e:
        logger.error(f"Failed to save finding: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save finding: {e!s}") from e


@router.get("/{workshop_id}/findings")
async def get_findings(
    workshop_id: str, user_id: str | None = None, db: Session = Depends(get_db)
) -> list[DiscoveryFinding]:
    """Get discovery findings for a workshop, optionally filtered by user."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    return db_service.get_findings(workshop_id, user_id)


@router.get("/{workshop_id}/findings-with-users", response_model=list[DiscoveryFindingWithUser])
async def get_findings_with_user_details(
    workshop_id: str, user_id: str | None = None, db: Session = Depends(get_db)
) -> list[DiscoveryFindingWithUser]:
    """Get discovery findings with user details for facilitator view."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    return db_service.get_findings_with_user_details(workshop_id, user_id)


# ============================================================================
# Participant Notes endpoints
# ============================================================================


@router.put("/{workshop_id}/toggle-participant-notes")
async def toggle_participant_notes(workshop_id: str, db: Session = Depends(get_db)) -> Workshop:
    """Toggle the show_participant_notes flag on a workshop.

    When enabled, participants see a notepad in the discovery view.
    """
    db_service = DatabaseService(db)
    workshop_db = db.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()
    if not workshop_db:
        raise HTTPException(status_code=404, detail="Workshop not found")

    current_value = getattr(workshop_db, "show_participant_notes", False) or False
    workshop_db.show_participant_notes = not current_value
    db.commit()
    db.refresh(workshop_db)

    return db_service._workshop_from_db(workshop_db)


@router.post("/{workshop_id}/participant-notes")
async def create_participant_note(
    workshop_id: str, note_data: ParticipantNoteCreate, db: Session = Depends(get_db)
) -> ParticipantNote:
    """Create or update a participant note."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    try:
        return db_service.add_participant_note(workshop_id, note_data)
    except Exception as e:
        logger.error(f"Failed to save participant note: {type(e).__name__}: {e}")
        raise HTTPException(status_code=500, detail=f"Failed to save participant note: {e!s}") from e


@router.get("/{workshop_id}/participant-notes")
async def get_participant_notes(
    workshop_id: str, user_id: str | None = None, phase: str | None = None, db: Session = Depends(get_db)
) -> list[ParticipantNote]:
    """Get participant notes for a workshop, optionally filtered by user and/or phase."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    return db_service.get_participant_notes(workshop_id, user_id, phase)


@router.delete("/{workshop_id}/participant-notes/{note_id}")
async def delete_participant_note(workshop_id: str, note_id: str, db: Session = Depends(get_db)):
    """Delete a participant note."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    deleted = db_service.delete_participant_note(note_id)
    if not deleted:
        raise HTTPException(status_code=404, detail="Note not found")
    return {"status": "deleted"}


@router.post("/{workshop_id}/rubric")
async def create_rubric(workshop_id: str, rubric_data: RubricCreate, db: Session = Depends(get_db)) -> Rubric:
    """Create or update rubric for a workshop.

    After creating/updating, triggers an MLflow re-sync in the background.
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    rubric = db_service.create_rubric(workshop_id, rubric_data)

    # Re-sync annotations to MLflow in background (non-blocking)
    def background_resync():
        try:
            from server.database import SessionLocal

            with SessionLocal() as bg_db:
                bg_service = DatabaseService(bg_db)
                resync_result = bg_service.resync_annotations_to_mlflow(workshop_id)
                logger.info(f"MLflow re-sync after rubric create: {resync_result}")
        except Exception as e:
            logger.warning(f"MLflow re-sync failed after rubric create: {e}")

    threading.Thread(target=background_resync, daemon=True).start()

    return rubric


@router.put("/{workshop_id}/rubric")
async def update_rubric(workshop_id: str, rubric_data: RubricCreate, db: Session = Depends(get_db)) -> Rubric:
    """Update rubric for a workshop.

    After updating, triggers an MLflow re-sync in the background.
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    rubric = db_service.create_rubric(workshop_id, rubric_data)

    # Re-sync annotations to MLflow in background (non-blocking)
    def background_resync():
        try:
            from server.database import SessionLocal

            with SessionLocal() as bg_db:
                bg_service = DatabaseService(bg_db)
                resync_result = bg_service.resync_annotations_to_mlflow(workshop_id)
                logger.info(f"MLflow re-sync after rubric update: {resync_result}")
        except Exception as e:
            logger.warning(f"MLflow re-sync failed after rubric update: {e}")

    threading.Thread(target=background_resync, daemon=True).start()

    return rubric


@router.get("/{workshop_id}/rubric")
async def get_rubric(workshop_id: str, db: Session = Depends(get_db)) -> Rubric:
    """Get rubric for a workshop."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    rubric = db_service.get_rubric(workshop_id)
    if not rubric:
        raise HTTPException(status_code=404, detail="Rubric not found")

    return rubric


@router.put("/{workshop_id}/rubric/questions/{question_id}")
async def update_rubric_question(
    workshop_id: str, question_id: str, question_data: dict, db: Session = Depends(get_db)
) -> Rubric:
    """Update a specific question in the rubric.

    When the title changes, this triggers an MLflow re-sync to update judge names.
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    title = question_data.get("title")
    description = question_data.get("description")
    judge_type = question_data.get("judge_type")  # Optional: "likert", "binary", "freeform"

    if not title or not description:
        raise HTTPException(status_code=400, detail="Title and description are required")

    rubric = db_service.update_rubric_question(workshop_id, question_id, title, description, judge_type)
    if not rubric:
        raise HTTPException(status_code=404, detail="Question not found or rubric not found")

    # Re-sync annotations to MLflow with updated judge names
    # This ensures the judge names reflect the new rubric question titles
    try:
        resync_result = db_service.resync_annotations_to_mlflow(workshop_id)
        logger.info(f"MLflow re-sync after rubric update: {resync_result}")
    except Exception as e:
        # Don't fail the rubric update if MLflow sync fails
        logger.warning(f"MLflow re-sync failed after rubric update: {e}")

    return rubric


@router.delete("/{workshop_id}/rubric/questions/{question_id}")
async def delete_rubric_question(workshop_id: str, question_id: str, db: Session = Depends(get_db)):
    """Delete a specific question from the rubric.

    After deletion, triggers an MLflow re-sync to update remaining judge names.
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    rubric = db_service.delete_rubric_question(workshop_id, question_id)

    if rubric is None:
        # Question was deleted and no questions remain
        return {"message": "Question deleted. No questions remain in rubric."}

    # Re-sync annotations to MLflow with remaining judge names
    # This ensures MLflow reflects the current rubric structure
    try:
        resync_result = db_service.resync_annotations_to_mlflow(workshop_id)
        logger.info(f"MLflow re-sync after rubric delete: {resync_result}")
    except Exception as e:
        # Don't fail the rubric delete if MLflow sync fails
        logger.warning(f"MLflow re-sync failed after rubric delete: {e}")

    return rubric


@router.post("/{workshop_id}/annotations")
async def submit_annotation(
    workshop_id: str, annotation: AnnotationCreate, db: Session = Depends(get_db)
) -> Annotation:
    """Submit an annotation for a trace."""
    logger.info(
        f"📝 Received annotation submission: trace_id={annotation.trace_id}, user_id={annotation.user_id}, rating={annotation.rating}, ratings={annotation.ratings}"
    )
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    try:
        result = db_service.add_annotation(workshop_id, annotation)
        logger.info(f"✅ Annotation saved to DB: id={result.id}, ratings={result.ratings}")
        return result
    except Exception as e:
        logger.error(f"❌ Failed to save annotation: {type(e).__name__}: {e}")
        logger.error(f"   Annotation data: trace_id={annotation.trace_id}, user_id={annotation.user_id}")
        # Re-raise as HTTP 500 so the client knows something went wrong
        raise HTTPException(status_code=500, detail=f"Failed to save annotation: {e!s}") from e


@router.get("/{workshop_id}/annotations")
async def get_annotations(
    workshop_id: str, user_id: str | None = None, db: Session = Depends(get_db)
) -> list[Annotation]:
    """Get annotations for a workshop, optionally filtered by user."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    annotations = db_service.get_annotations(workshop_id, user_id)
    logger.info(f"📖 Retrieved {len(annotations)} annotations for workshop={workshop_id}, user={user_id}")
    if annotations:
        logger.info(
            f"📖 Sample annotation: id={annotations[0].id}, ratings={annotations[0].ratings}, legacy_rating={annotations[0].rating}"
        )
    return annotations


@router.get("/{workshop_id}/annotations-with-users")
async def get_annotations_with_user_details(
    workshop_id: str, user_id: str | None = None, db: Session = Depends(get_db)
) -> list[dict[str, Any]]:
    """Get annotations with user details for facilitator view."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    return db_service.get_annotations_with_user_details(workshop_id, user_id)


@router.get("/{workshop_id}/irr")
async def get_irr(workshop_id: str, db: Session = Depends(get_db)) -> IRRResult:
    """Calculate Inter-Rater Reliability for a workshop.

    Only considers ratings for questions that currently exist in the rubric.
    Old ratings for deleted questions are ignored (but preserved in DB).
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    annotations = db_service.get_annotations(workshop_id)

    # Get current rubric to filter ratings to only current questions
    rubric = db_service.get_rubric(workshop_id)
    if rubric:
        # Get the valid question IDs from the current rubric
        valid_question_ids = _get_valid_rubric_question_ids(rubric)

        # Filter annotation ratings to only include current rubric questions
        annotations = _filter_annotations_to_current_rubric(annotations, valid_question_ids)

    return calculate_irr_for_workshop(workshop_id, annotations, db)


def _get_valid_rubric_question_ids(rubric) -> set:
    """Extract all valid question IDs from the current rubric.

    Returns both backend format (q_1, q_2) and frontend format (rubric_id_0, rubric_id_1).
    """
    valid_ids = set()

    QUESTION_DELIMITER = "|||QUESTION_SEPARATOR|||"
    question_parts = rubric.question.split(QUESTION_DELIMITER) if rubric.question else []

    for index in range(len(question_parts)):
        if question_parts[index].strip():
            # Backend format: q_1, q_2, etc. (1-based)
            valid_ids.add(f"q_{index + 1}")
            # Frontend format: {rubric_id}_{index} (0-based)
            valid_ids.add(f"{rubric.id}_{index}")

    return valid_ids


def _filter_annotations_to_current_rubric(annotations, valid_question_ids: set):
    """Filter annotation ratings to only include ratings for current rubric questions.

    This ensures that old ratings for deleted questions are not included in IRR calculations.
    The original annotation objects are not modified - new Annotation objects are created.
    """
    from server.models import Annotation

    filtered_annotations = []
    for annotation in annotations:
        if not annotation.ratings:
            # No ratings dict, keep as-is (uses legacy 'rating' field)
            filtered_annotations.append(annotation)
            continue

        # Filter ratings to only include current rubric questions
        filtered_ratings = {key: value for key, value in annotation.ratings.items() if key in valid_question_ids}

        # Create a new Annotation with filtered ratings (don't modify original)
        filtered_annotation = Annotation(
            id=annotation.id,
            workshop_id=annotation.workshop_id,
            trace_id=annotation.trace_id,
            user_id=annotation.user_id,
            rating=annotation.rating,
            ratings=filtered_ratings if filtered_ratings else None,
            comment=annotation.comment,
            mlflow_trace_id=annotation.mlflow_trace_id,
            created_at=annotation.created_at,
        )
        filtered_annotations.append(filtered_annotation)

    return filtered_annotations


@router.delete("/{workshop_id}/findings")
async def clear_findings(workshop_id: str, db: Session = Depends(get_db)):
    """Clear all findings for a workshop (for testing)."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    db_service.clear_findings(workshop_id)
    return {"message": "Findings cleared successfully"}


@router.delete("/{workshop_id}/annotations")
async def clear_annotations(workshop_id: str, db: Session = Depends(get_db)):
    """Clear all annotations for a workshop (for testing)."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    db_service.clear_annotations(workshop_id)
    return {"message": "Annotations cleared successfully"}


@router.delete("/{workshop_id}/rubric")
async def clear_rubric(workshop_id: str, db: Session = Depends(get_db)):
    """Clear the rubric for a workshop (for testing)."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    db_service.clear_rubric(workshop_id)
    return {"message": "Rubric cleared successfully"}


@router.post("/{workshop_id}/begin-discovery")
async def begin_discovery_phase(
    workshop_id: str, trace_limit: int | None = None, randomize: bool = False, db: Session = Depends(get_db)
):
    """Begin the discovery phase and distribute traces to participants.

    Args:
        workshop_id: The workshop ID
        trace_limit: Optional limit on number of traces to use (default: all)
        randomize: Whether to randomize trace order per user (default: False - same order for all)
        db: Database session
    """

    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Update workshop phase to discovery and mark discovery as started
    db_service.update_workshop_phase(workshop_id, WorkshopPhase.DISCOVERY)
    db_service.update_phase_started(workshop_id, discovery_started=True)

    # Store the randomization setting
    db_service.update_discovery_randomize_setting(workshop_id, randomize)

    # Get all traces
    traces = db_service.get_traces(workshop_id)
    total_traces = len(traces)

    # Validate that traces are available before starting discovery
    if total_traces == 0:
        raise HTTPException(
            status_code=400,
            detail="Cannot start discovery: No traces available. Please complete MLflow ingestion in the Intake phase first.",
        )

    print(
        f"🔍 DEBUG begin_discovery: workshop_id={workshop_id}, trace_limit={trace_limit}, randomize={randomize}, total_traces={total_traces}"
    )
    print(f"🔍 DEBUG trace_ids: {[t.id for t in traces]}")

    # Apply trace limit - take first N traces in chronological order
    if trace_limit and trace_limit > 0 and trace_limit < total_traces:
        print(f"🎯 DEBUG: Taking first {trace_limit} traces from {total_traces}")
        # Take the first N traces in chronological order
        selected_traces = traces[: min(trace_limit, total_traces)]
        trace_ids_to_use = [trace.id for trace in selected_traces]
        traces_used = len(selected_traces)
        print(f"🎯 DEBUG: Selected traces: {trace_ids_to_use}")
    else:
        print(f"🎯 DEBUG: Using all traces (limit={trace_limit}, total={total_traces})")
        # Use all traces
        trace_ids_to_use = [trace.id for trace in traces]
        traces_used = total_traces

    # Store the active discovery trace IDs in the workshop
    db_service.update_active_discovery_traces(workshop_id, trace_ids_to_use)

    randomize_msg = "randomized per user" if randomize else "in chronological order"
    return {
        "message": f"Discovery phase started with {traces_used} traces from {total_traces} total ({randomize_msg})",
        "phase": "discovery",
        "total_traces": total_traces,
        "traces_used": traces_used,
        "trace_limit": trace_limit,
        "randomize": randomize,
    }


@router.post("/{workshop_id}/add-traces")
async def add_traces(workshop_id: str, request: dict, db: Session = Depends(get_db)):
    """Add additional traces to the current active phase (discovery or annotation).

    When adding traces to annotation phase, automatically triggers LLM evaluation
    for the newly added traces in the background.
    """
    import threading

    additional_count = request.get("additional_count", 0)
    if not additional_count or additional_count <= 0:
        raise HTTPException(status_code=400, detail="additional_count must be a positive integer")

    # Get explicit phase parameter from request (fallback to current_phase for backwards compatibility)
    target_phase = request.get("phase")

    db_service = DatabaseService(db)

    # Retrieve the stored evaluation model from initial auto-evaluation (don't use a hardcoded default)
    evaluation_model_name = db_service.get_auto_evaluation_model(workshop_id) or "databricks-claude-opus-4-5"
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Use explicit phase if provided, otherwise fall back to current workshop phase
    if target_phase:
        phase_name = target_phase
    else:
        phase_name = workshop.current_phase

    if phase_name == "discovery":
        # Add to discovery phase
        active_trace_ids = list(workshop.active_discovery_trace_ids or [])
        update_function = db_service.update_active_discovery_traces
    elif phase_name == "annotation":
        # Add to annotation phase
        active_trace_ids = list(workshop.active_annotation_trace_ids or [])
        update_function = db_service.update_active_annotation_traces
    else:
        # Invalid phase
        raise HTTPException(
            status_code=400, detail=f'Cannot add traces to phase: {phase_name}. Must be "discovery" or "annotation".'
        )

    # Get all traces and find available ones
    all_traces = db_service.get_traces(workshop_id)
    active_trace_ids_set = set(active_trace_ids)  # Use a set for fast lookup
    available_traces = [trace for trace in all_traces if trace.id not in active_trace_ids_set]

    if not available_traces:
        raise HTTPException(status_code=400, detail="No additional traces available to add")

    # Sample additional traces
    traces_to_add = min(additional_count, len(available_traces))

    if traces_to_add == 0:
        return {
            "message": "No traces were added - all available traces are already active",
            "traces_added": 0,
            "total_active_traces": len(active_trace_ids),
            "available_traces_remaining": 0,
            "phase": phase_name,
        }

    # Take the first N available traces in order
    # Note: User-specific randomization is handled automatically when traces are fetched
    # Each user will see new traces added to their randomized order
    additional_traces = available_traces[:traces_to_add]
    additional_trace_ids = [trace.id for trace in additional_traces]

    # Update the active traces with the additional ones (preserving order)
    new_active_trace_ids = active_trace_ids + additional_trace_ids
    update_function(workshop_id, new_active_trace_ids)

    # Build appropriate message
    if traces_to_add < additional_count:
        message = f"Added {traces_to_add} traces to {phase_name} phase (only {traces_to_add} were available, requested {additional_count})"
    else:
        message = f"Added {traces_to_add} additional traces to {phase_name} phase"

    # === AUTO-EVALUATION for annotation phase ===
    auto_eval_job_id = None
    auto_eval_started = False

    logger.info("Add traces - phase: %s, checking for auto-evaluation", phase_name)

    if phase_name == "annotation":
        # Tag the newly added traces with 'eval' label for auto-evaluation
        tag_result = db_service.tag_traces_for_evaluation(workshop_id, additional_trace_ids, tag_type="eval")
        logger.info("Add traces - tagged %d new traces for auto-evaluation: %s", len(additional_trace_ids), tag_result)

        # Get MLflow config for auto-evaluation
        mlflow_config = db_service.get_mlflow_config(workshop_id)
        logger.info("Add traces - MLflow config available: %s", mlflow_config is not None)

        if mlflow_config:
            # Only run auto-evaluation if it was previously enabled (i.e., a prompt was stored)
            derived_prompt = db_service.get_auto_evaluation_prompt(workshop_id)
            logger.info(
                "Add traces - stored prompt available: %s (length: %s)",
                derived_prompt is not None,
                len(derived_prompt) if derived_prompt else 0,
            )
            if not derived_prompt:
                logger.info("No auto-evaluation prompt stored - skipping auto-evaluation for added traces")

            if derived_prompt:
                # Get Databricks token
                from server.services.token_storage_service import token_storage

                databricks_token = token_storage.get_token(workshop_id)
                if not databricks_token:
                    databricks_token = db_service.get_databricks_token(workshop_id)
                    if databricks_token:
                        token_storage.store_token(workshop_id, databricks_token)

                logger.info("Add traces - Databricks token available: %s", databricks_token is not None)
                if databricks_token:
                    mlflow_config.databricks_token = databricks_token

                    # Create auto-evaluation job for the new traces
                    auto_eval_job_id = str(uuid.uuid4())
                    logger.info("Add traces - Creating auto-evaluation job: %s", auto_eval_job_id)
                    job = create_job(auto_eval_job_id, workshop_id)
                    job.set_status("running")
                    job.add_log(f"Auto-evaluation started for {traces_to_add} newly added traces")

                    # Update job ID in workshop
                    db_service.update_auto_evaluation_job(workshop_id, auto_eval_job_id, derived_prompt)

                    # Get judge type from rubric - parse questions to get per-question judge type
                    rubric = db_service.get_rubric(workshop_id)
                    judge_type = "likert"  # default
                    if rubric and rubric.question:
                        parsed_questions = db_service._parse_rubric_questions(rubric.question)
                        if parsed_questions:
                            judge_type = parsed_questions[0].get("judge_type", "likert")

                    # Run evaluation in background thread
                    def run_auto_evaluation_for_new_traces():
                        try:
                            from server.database import SessionLocal
                            from server.services.alignment_service import AlignmentService

                            thread_db = SessionLocal()
                            try:
                                thread_db_service = DatabaseService(thread_db)
                                alignment_service = AlignmentService(thread_db_service)

                                job.add_log("Initializing auto-evaluation service for new traces...")
                                job.add_log(f"Evaluating {traces_to_add} newly added traces")

                                # Run evaluation - evaluates all active annotation traces
                                # (includes previously evaluated + new ones)
                                result = None
                                for msg in alignment_service.run_evaluation_with_answer_sheet(
                                    workshop_id=workshop_id,
                                    judge_name=workshop.judge_name or "workshop_judge",
                                    judge_prompt=derived_prompt,
                                    evaluation_model_name=evaluation_model_name,
                                    mlflow_config=mlflow_config,
                                    judge_type=judge_type,
                                    require_human_ratings=False,  # Auto-eval mode
                                ):
                                    if isinstance(msg, dict):
                                        result = msg
                                        job.result = result
                                        job.save()
                                    elif isinstance(msg, str):
                                        job.add_log(msg)

                                if result and result.get("success"):
                                    try:
                                        from server.models import JudgeEvaluation, JudgePromptCreate

                                        # Use existing prompt if available
                                        # Note: get_judge_prompts returns prompts ordered by version DESC, so [0] is the latest
                                        existing_prompts = thread_db_service.get_judge_prompts(workshop_id)
                                        if existing_prompts:
                                            new_prompt = existing_prompts[0]  # [0] is latest (version DESC order)
                                            job.add_log(
                                                f"Using existing prompt v{new_prompt.version} for evaluation results"
                                            )
                                        else:
                                            new_prompt_data = JudgePromptCreate(
                                                prompt_text=derived_prompt,
                                                few_shot_examples=[],
                                                model_name=evaluation_model_name,
                                                model_parameters={},
                                            )
                                            new_prompt = thread_db_service.create_judge_prompt(
                                                workshop_id, new_prompt_data
                                            )
                                            job.add_log(f"Created initial prompt v{new_prompt.version}")

                                        if "evaluations" in result:
                                            evals_to_store = []
                                            for eval_data in result["evaluations"]:
                                                try:
                                                    pred = eval_data.get("predicted_rating")
                                                    pred_val = round(float(pred)) if pred is not None else 0
                                                    trace_id_for_db = (
                                                        eval_data.get("workshop_uuid") or eval_data["trace_id"]
                                                    )
                                                    evals_to_store.append(
                                                        JudgeEvaluation(
                                                            id=str(uuid.uuid4()),
                                                            workshop_id=workshop_id,
                                                            prompt_id=new_prompt.id,
                                                            trace_id=trace_id_for_db,
                                                            predicted_rating=pred_val,
                                                            human_rating=int(eval_data["human_rating"])
                                                            if eval_data.get("human_rating") is not None
                                                            else 0,
                                                            confidence=eval_data.get("confidence"),
                                                            reasoning=eval_data.get("reasoning"),
                                                        )
                                                    )
                                                except Exception as inner_err:
                                                    logger.error(f"Error parsing evaluation: {inner_err}")

                                            if evals_to_store:
                                                thread_db_service.store_judge_evaluations(evals_to_store)
                                                job.add_log(f"Stored {len(evals_to_store)} evaluation results")

                                        job.set_status("completed")
                                        job.add_log("Auto-evaluation for new traces completed")
                                    except Exception as save_err:
                                        job.add_log(f"Warning: Could not save results: {save_err}")
                                        job.set_status("completed")
                                else:
                                    job.set_status("failed")
                                    job.add_log(
                                        f"Auto-evaluation failed: {result.get('error', 'Unknown error') if result else 'No result'}"
                                    )
                            finally:
                                thread_db.close()
                        except Exception as e:
                            logger.exception("Auto-evaluation error for new traces: %s", e)
                            job.set_status("failed")
                            job.add_log(f"Error: {e!s}")

                    # Start background thread
                    eval_thread = threading.Thread(target=run_auto_evaluation_for_new_traces, daemon=True)
                    eval_thread.start()
                    auto_eval_started = True
                    logger.info(
                        "Started auto-evaluation job %s for %d new traces in workshop %s",
                        auto_eval_job_id,
                        traces_to_add,
                        workshop_id,
                    )

    return {
        "message": message,
        "traces_added": traces_to_add,
        "total_active_traces": len(new_active_trace_ids),
        "available_traces_remaining": len(available_traces) - traces_to_add,
        "phase": phase_name,
        "auto_evaluation_started": auto_eval_started,
        "auto_evaluation_job_id": auto_eval_job_id,
    }


# Keep the old endpoints for backward compatibility
@router.post("/{workshop_id}/add-discovery-traces")
async def add_discovery_traces(workshop_id: str, request: dict, db: Session = Depends(get_db)):
    """Add additional traces to the active discovery phase (legacy endpoint)."""
    # Redirect to the unified endpoint
    return await add_traces(workshop_id, request, db)


@router.post("/{workshop_id}/add-annotation-traces")
async def add_annotation_traces(workshop_id: str, request: dict, db: Session = Depends(get_db)):
    """Add additional traces to the annotation phase (legacy endpoint)."""
    # Redirect to the unified endpoint
    return await add_traces(workshop_id, request, db)


@router.post("/{workshop_id}/reorder-annotation-traces")
async def reorder_annotation_traces(workshop_id: str, db: Session = Depends(get_db)):
    """Reorder annotation traces so completed ones come first, then in-progress ones."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    if not workshop.active_annotation_trace_ids:
        return {"message": "No active annotation traces to reorder", "reordered_count": 0}

    # Get all annotations for this workshop
    annotations = db_service.get_annotations(workshop_id)

    # Count annotations per trace
    from collections import defaultdict

    trace_annotation_counts = defaultdict(int)
    trace_reviewer_counts = defaultdict(set)

    for annotation in annotations:
        trace_annotation_counts[annotation.trace_id] += 1
        trace_reviewer_counts[annotation.trace_id].add(annotation.user_id)

    # Sort traces by completion status (more reviews first)
    trace_ids = list(workshop.active_annotation_trace_ids)
    sorted_trace_ids = sorted(
        trace_ids,
        key=lambda tid: (
            -len(trace_reviewer_counts[tid]),  # More reviewers first
            -trace_annotation_counts[tid],  # More annotations first
        ),
    )

    # Update the workshop with the reordered traces
    db_service.update_active_annotation_traces(workshop_id, sorted_trace_ids)

    return {
        "message": f"Reordered {len(sorted_trace_ids)} annotation traces by completion status",
        "reordered_count": len(sorted_trace_ids),
        "order": sorted_trace_ids,
    }


@router.post("/{workshop_id}/begin-annotation")
async def begin_annotation_phase(workshop_id: str, request: dict | None = None, db: Session = Depends(get_db)):
    """Begin the annotation phase with a subset of traces.

    Args:
        workshop_id: The workshop ID
        request: JSON body with optional fields:
            - trace_limit: Number of traces to use (default: 10, -1 for all)
            - randomize: Whether to randomize trace order per user (default: False)
            - evaluation_model_name: Model to use for auto-evaluation (null to disable)

    When randomize=False (default): All SMEs see traces in the same chronological order.
    When randomize=True: All SMEs see the same set of traces but in different random orders.

    This also triggers automatic LLM evaluation in the background using a judge prompt
    derived from the rubric. Results are available immediately in the Results UI.
    """
    if request is None:
        request = {}
    import threading

    logger.info("begin_annotation_phase called with request: %s", request)

    # Get the optional trace limit from request (default to 10)
    trace_limit = request.get("trace_limit", 10)
    # Get the optional randomize flag (default to False - same order for all users)
    randomize = request.get("randomize", False)
    # Get the optional evaluation model name (None = skip auto-evaluation)
    evaluation_model_name = request.get("evaluation_model_name")
    # Default to a model if enabled but not specified
    if evaluation_model_name is None:
        # Auto-evaluation disabled by frontend
        auto_evaluate_enabled = False
    else:
        auto_evaluate_enabled = True
        if not evaluation_model_name:  # Empty string
            evaluation_model_name = "databricks-claude-opus-4-5"

    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Check if rubric exists before starting annotation
    rubric = db_service.get_rubric(workshop_id)
    if not rubric:
        raise HTTPException(
            status_code=400,
            detail="Cannot start annotation phase without a rubric. Please create a rubric first.",
        )

    # Get all traces and select a subset for annotation
    traces = db_service.get_traces(workshop_id)
    if not traces:
        raise HTTPException(status_code=400, detail="No traces available for annotation")

    total_traces = len(traces)

    # Determine how many traces to use
    if trace_limit == -1 or trace_limit >= total_traces:
        # Use all traces in chronological order
        trace_ids_to_use = [trace.id for trace in traces]
        traces_used = total_traces
    else:
        # Take first N traces (chronological order, not random sampling)
        traces_used = min(trace_limit, total_traces)
        trace_ids_to_use = [trace.id for trace in traces[:traces_used]]

    # Store the active annotation trace IDs and update workshop phase
    # Use retry logic for SQLite concurrency (handles "database is locked" errors)
    def _do_phase_updates():
        db_service.update_active_annotation_traces(workshop_id, trace_ids_to_use)
        db_service.update_annotation_randomize_setting(workshop_id, randomize)
        db_service.update_workshop_phase(workshop_id, WorkshopPhase.ANNOTATION)
        db_service.update_phase_started(workshop_id, annotation_started=True)

    _retry_db_operations(_do_phase_updates, db)

    # === TAG TRACES FOR EVALUATION ===
    # Tag traces in MLflow (non-critical - don't let this crash the endpoint)
    tag_result = None
    if auto_evaluate_enabled:
        logger.info("Auto-eval tagging: %d traces to tag for workshop %s", len(trace_ids_to_use), workshop_id)
        try:
            tag_result = db_service.tag_traces_for_evaluation(workshop_id, trace_ids_to_use, tag_type='eval')
            logger.info("Auto-eval tagging result: tagged=%d, failed=%s",
                        tag_result.get('tagged', 0), tag_result.get('failed', []))
        except Exception as tag_err:
            logger.warning("Auto-eval tagging FAILED for workshop %s: %s", workshop_id, tag_err, exc_info=True)

    # === AUTO-EVALUATION: Derive judge prompt and start background evaluation ===
    auto_eval_job_id = None
    auto_eval_started = False

    # Only run auto-evaluation if enabled by frontend
    logger.info("Auto-evaluation enabled: %s, model: %s", auto_evaluate_enabled, evaluation_model_name)
    if not auto_evaluate_enabled:
        logger.info("Auto-evaluation disabled by user for workshop %s", workshop_id)

    # Get MLflow config for auto-evaluation
    mlflow_config = db_service.get_mlflow_config(workshop_id)
    logger.info("MLflow config available: %s", mlflow_config is not None)

    if auto_evaluate_enabled and mlflow_config:
        # Derive judge prompt from rubric
        derived_prompt = db_service.derive_judge_prompt_from_rubric(workshop_id)
        logger.info("Derived prompt length: %s", len(derived_prompt) if derived_prompt else 0)

        if derived_prompt:
            # Get Databricks token
            from server.services.token_storage_service import token_storage

            databricks_token = token_storage.get_token(workshop_id)
            if not databricks_token:
                databricks_token = db_service.get_databricks_token(workshop_id)
                if databricks_token:
                    token_storage.store_token(workshop_id, databricks_token)

            logger.info("Databricks token available: %s", databricks_token is not None)
            if databricks_token:
                mlflow_config.databricks_token = databricks_token

                # Create auto-evaluation job
                auto_eval_job_id = str(uuid.uuid4())
                logger.info("Creating auto-evaluation job: %s", auto_eval_job_id)
                job = create_job(auto_eval_job_id, workshop_id)
                job.set_status("running")
                job.add_log("Auto-evaluation started on annotation begin")

                # Store job ID, derived prompt, and model in workshop (non-critical)
                try:
                    db_service.update_auto_evaluation_job(
                        workshop_id, auto_eval_job_id, derived_prompt, evaluation_model_name
                    )
                except Exception as job_update_err:
                    logger.warning(f"Failed to update auto-evaluation job (non-critical): {job_update_err}")

                # Get all rubric questions for multi-judge evaluation
                rubric_questions = db_service.get_rubric_questions_for_evaluation(workshop_id)
                num_judges = len(rubric_questions) if rubric_questions else 1
                job.add_log(f"Found {num_judges} rubric question(s) for evaluation")

                # Run evaluation in background thread - evaluate EACH rubric question separately
                def run_auto_evaluation_background():
                    try:
                        from server.database import SessionLocal
                        from server.services.alignment_service import AlignmentService

                        thread_db = SessionLocal()
                        try:
                            thread_db_service = DatabaseService(thread_db)
                            alignment_service = AlignmentService(thread_db_service)

                            job.add_log("Initializing auto-evaluation service...")
                            job.add_log(f"Initial tagging result: {tag_result}")
                            job.add_log(f"Trace IDs to evaluate: {trace_ids_to_use}")

                            # Wait for MLflow tag indexing (eventual consistency)
                            # Tags were just set via mlflow.set_trace_tag but search_traces
                            # may not find them immediately due to index lag
                            import os as _os
                            import time as _time

                            try:
                                import mlflow as _mlflow

                                _os.environ["DATABRICKS_HOST"] = mlflow_config.databricks_host.rstrip("/")
                                has_oauth = bool(
                                    _os.environ.get("DATABRICKS_CLIENT_ID")
                                    and _os.environ.get("DATABRICKS_CLIENT_SECRET")
                                )
                                if not has_oauth:
                                    _os.environ["DATABRICKS_TOKEN"] = mlflow_config.databricks_token
                                _mlflow.set_tracking_uri("databricks")

                                filter_str = f"tags.label = 'eval' AND tags.workshop_id = '{workshop_id}'"
                                job.add_log(f"Polling MLflow for tagged traces: {filter_str}")
                                job.add_log(f"Experiment ID: {mlflow_config.experiment_id}")
                                tag_verified = False
                                for wait_attempt in range(5):  # Up to 10 seconds (5 x 2s)
                                    _time.sleep(2)
                                    try:
                                        test_df = _mlflow.search_traces(
                                            experiment_ids=[mlflow_config.experiment_id],
                                            filter_string=filter_str,
                                            return_type="pandas",
                                        )
                                        found_count = len(test_df) if test_df is not None and not test_df.empty else 0
                                        job.add_log(f"Tag poll attempt {wait_attempt + 1}/5: found {found_count} traces")
                                        if found_count > 0:
                                            job.add_log(f"MLflow tags verified after {(wait_attempt + 1) * 2}s ({found_count} traces)")
                                            tag_verified = True
                                            break
                                    except Exception as search_err:
                                        job.add_log(f"Tag poll attempt {wait_attempt + 1}/5 error: {search_err}")
                                        logger.debug("Tag verification attempt %d failed: %s", wait_attempt + 1, search_err)
                                if not tag_verified:
                                    job.add_log("WARNING: MLflow tags not found after 10s, re-tagging traces...")
                                    try:
                                        retag_result = thread_db_service.tag_traces_for_evaluation(
                                            workshop_id, trace_ids_to_use, tag_type='eval'
                                        )
                                        job.add_log(f"Re-tagged {retag_result.get('tagged', 0)} traces (failed: {retag_result.get('failed', [])})")
                                        _time.sleep(2)
                                    except Exception as retag_err:
                                        job.add_log(f"WARNING: Re-tagging failed: {retag_err}")
                            except Exception as tag_wait_err:
                                job.add_log(f"WARNING: Tag verification setup failed: {tag_wait_err}")

                            # Get rubric questions again in thread context
                            questions_to_eval = thread_db_service.get_rubric_questions_for_evaluation(workshop_id)
                            if not questions_to_eval:
                                # Fallback: use derived prompt with single judge
                                questions_to_eval = [
                                    {
                                        "judge_name": workshop.judge_name or "workshop_judge",
                                        "judge_prompt": derived_prompt,
                                        "judge_type": "likert",
                                        "title": "Response Quality",
                                    }
                                ]

                            all_results = []
                            total_evaluated = 0

                            # Evaluate each rubric question with its own judge
                            for i, question in enumerate(questions_to_eval):
                                judge_name = question["judge_name"]
                                judge_prompt = question["judge_prompt"]
                                judge_type = question["judge_type"]
                                title = question["title"]

                                job.add_log(f"\n=== Evaluating criterion {i + 1}/{len(questions_to_eval)}: {title} ===")
                                job.add_log(f"Judge: {judge_name} (type: {judge_type})")

                                result = None
                                for message in alignment_service.run_evaluation_with_answer_sheet(
                                    workshop_id=workshop_id,
                                    judge_name=judge_name,
                                    judge_prompt=judge_prompt,
                                    evaluation_model_name=evaluation_model_name,
                                    mlflow_config=mlflow_config,
                                    judge_type=judge_type,
                                    require_human_ratings=False,  # Auto-eval mode
                                ):
                                    if isinstance(message, dict):
                                        result = message
                                        all_results.append({"judge_name": judge_name, "title": title, "result": result})
                                        if result.get("success"):
                                            eval_count = result.get("trace_count", 0)
                                            total_evaluated += eval_count
                                            job.add_log(f"✓ {judge_name}: Evaluated {eval_count} traces")
                                        else:
                                            job.add_log(f"✗ {judge_name}: {result.get('error', 'Unknown error')}")
                                    elif isinstance(message, str):
                                        job.add_log(message)

                            # Summarize results
                            successful = [r for r in all_results if r["result"].get("success")]
                            failed = [r for r in all_results if not r["result"].get("success")]

                            # Save evaluations to database
                            save_succeeded = False
                            if successful:
                                try:
                                    from server.models import JudgeEvaluation, JudgePromptCreate

                                    # Create or get judge prompt for storing evaluations
                                    prompts = thread_db_service.get_judge_prompts(workshop_id)
                                    if prompts:
                                        prompt_id_to_use = prompts[0].id  # Use latest prompt
                                    else:
                                        # Create a new prompt
                                        new_prompt_data = JudgePromptCreate(
                                            prompt_text=derived_prompt,
                                            few_shot_examples=[],
                                            model_name=evaluation_model_name,
                                            model_parameters={"mode": "auto_evaluation"},
                                        )
                                        new_prompt = thread_db_service.create_judge_prompt(workshop_id, new_prompt_data)
                                        prompt_id_to_use = new_prompt.id
                                        job.add_log(f"Created prompt v{new_prompt.version} for storing evaluations")

                                    # Collect all evaluations from successful results
                                    all_evaluations = []
                                    for judge_result in successful:
                                        result = judge_result["result"]
                                        judge_name_tag = judge_result.get("judge_name", "")
                                        if "evaluations" in result:
                                            for eval_data in result["evaluations"]:
                                                try:
                                                    pred = eval_data.get("predicted_rating")
                                                    pred_val = round(float(pred)) if pred is not None else 0
                                                    # Use workshop_uuid (DB UUID) if available, otherwise trace_id
                                                    trace_id_for_db = eval_data.get("workshop_uuid") or eval_data.get(
                                                        "trace_id"
                                                    )
                                                    all_evaluations.append(
                                                        JudgeEvaluation(
                                                            id=str(uuid.uuid4()),
                                                            workshop_id=workshop_id,
                                                            prompt_id=prompt_id_to_use,
                                                            trace_id=trace_id_for_db,
                                                            predicted_rating=pred_val,
                                                            human_rating=int(eval_data.get("human_rating"))
                                                            if eval_data.get("human_rating") is not None
                                                            else None,
                                                            confidence=eval_data.get("confidence"),
                                                            reasoning=eval_data.get("reasoning"),
                                                            predicted_feedback=judge_name_tag,  # Store judge/question name for per-question filtering
                                                        )
                                                    )
                                                except Exception as inner_err:
                                                    logger.error(f"Error parsing evaluation: {inner_err}")

                                    if all_evaluations:
                                        # Retry save up to 3 times to handle transient DB errors
                                        import time as _time

                                        for save_attempt in range(3):
                                            try:
                                                thread_db_service.store_judge_evaluations(all_evaluations)
                                                job.add_log(f"✓ Saved {len(all_evaluations)} evaluations to database")
                                                save_succeeded = True
                                                break
                                            except Exception as retry_err:
                                                if save_attempt < 2:
                                                    job.add_log(
                                                        f"⚠ Save attempt {save_attempt + 1} failed, retrying in 1s..."
                                                    )
                                                    _time.sleep(1)
                                                else:
                                                    raise retry_err
                                    else:
                                        job.add_log("⚠ No evaluations to save")
                                except Exception as save_err:
                                    job.add_log(f"⚠ Warning: Could not save evaluations: {save_err}")
                                    logger.exception("Failed to save auto-evaluation results")

                            job.result = {
                                "success": len(failed) == 0 and save_succeeded,
                                "total_judges": len(questions_to_eval),
                                "successful_judges": len(successful),
                                "failed_judges": len(failed),
                                "total_evaluated": total_evaluated,
                                "results_by_judge": all_results,
                            }
                            job.save()

                            if len(failed) == 0 and save_succeeded:
                                job.set_status("completed")
                                job.add_log(f"\n✓ All {len(questions_to_eval)} judges completed successfully!")
                                job.add_log(f"Total evaluations: {total_evaluated}")
                            elif len(successful) > 0 and save_succeeded:
                                job.set_status("completed")  # Partial success
                                job.add_log(f"\n⚠ {len(successful)}/{len(questions_to_eval)} judges succeeded")
                            elif len(successful) > 0 and not save_succeeded:
                                job.set_status("failed")
                                job.add_log(
                                    "\n✗ Evaluation succeeded but database save failed. Click 'Run Align()' to retry."
                                )
                            else:
                                job.set_status("failed")
                                job.add_log("\n✗ All judges failed")

                        finally:
                            thread_db.close()
                    except Exception as e:
                        logger.exception("Auto-evaluation error: %s", e)
                        job.set_status("failed")
                        job.add_log(f"Error: {e!s}")

                # Start background thread
                eval_thread = threading.Thread(target=run_auto_evaluation_background, daemon=True)
                eval_thread.start()
                auto_eval_started = True
                logger.info("Started auto-evaluation job %s for workshop %s", auto_eval_job_id, workshop_id)
            else:
                logger.warning("No Databricks token available for auto-evaluation")
        else:
            logger.warning("Could not derive judge prompt from rubric")
    elif not auto_evaluate_enabled:
        logger.info("Auto-evaluation skipped - disabled by user")
    else:
        logger.warning("No MLflow config available for auto-evaluation")

    randomize_msg = "randomized per SME" if randomize else "in chronological order"
    return {
        "message": f"Annotation phase started with {traces_used} traces from {total_traces} total ({randomize_msg})",
        "phase": "annotation",
        "total_traces": total_traces,
        "traces_used": traces_used,
        "trace_limit": trace_limit,
        "randomize": randomize,
        "auto_evaluation_started": auto_eval_started,
        "auto_evaluation_job_id": auto_eval_job_id,
    }


@router.delete("/{workshop_id}/traces")
async def delete_all_traces(workshop_id: str, db: Session = Depends(get_db)):
    """Delete all traces for a workshop and reset to intake phase (facilitator only).

    This allows starting over with new trace data.
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Delete all traces (this also resets workshop phase to INTAKE)
    deleted_count = db_service.delete_all_traces(workshop_id)

    return {
        "message": f"Deleted {deleted_count} traces and reset workshop to intake phase",
        "deleted_count": deleted_count,
        "workshop_id": workshop_id,
        "current_phase": "intake",
    }


@router.post("/{workshop_id}/reset-discovery")
async def reset_discovery(workshop_id: str, db: Session = Depends(get_db)):
    """Reset a workshop back to before discovery phase started (facilitator only).

    This allows changing the discovery configuration (e.g., number of traces).

    IMPORTANT: This clears ALL participant discovery progress:
    - All discovery findings/responses submitted by participants
    - All user trace orders (personalized trace lists)
    - All user discovery completions

    Traces are kept, but participants will start fresh from the beginning.
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Reset workshop to pre-discovery state (clears all participant progress)
    updated_workshop = db_service.reset_workshop_to_discovery(workshop_id)

    if not updated_workshop:
        raise HTTPException(status_code=500, detail="Failed to reset workshop")

    traces = db_service.get_traces(workshop_id)

    return {
        "message": "Discovery reset. All participant progress cleared. You can now select a different trace configuration.",
        "workshop_id": workshop_id,
        "current_phase": updated_workshop.current_phase,
        "discovery_started": updated_workshop.discovery_started,
        "traces_available": len(traces),
    }


@router.post("/{workshop_id}/reset-annotation")
async def reset_annotation(workshop_id: str, db: Session = Depends(get_db)):
    """Reset a workshop back to before annotation phase started (facilitator only).

    This allows changing the annotation configuration (e.g., trace selection, randomization).

    IMPORTANT: This clears ALL SME annotation progress:
    - All annotations submitted by SMEs

    Traces are kept, but SMEs will start fresh from the beginning.
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Reset workshop to pre-annotation state (clears all SME progress)
    updated_workshop = db_service.reset_workshop_to_annotation(workshop_id)

    if not updated_workshop:
        raise HTTPException(status_code=500, detail="Failed to reset workshop")

    traces = db_service.get_traces(workshop_id)

    return {
        "message": "Annotation reset. All SME progress cleared. You can now select a different trace configuration.",
        "workshop_id": workshop_id,
        "current_phase": updated_workshop.current_phase,
        "annotation_started": updated_workshop.annotation_started,
        "traces_available": len(traces),
    }


@router.post("/{workshop_id}/advance-to-discovery")
async def advance_to_discovery(workshop_id: str, db: Session = Depends(get_db)):
    """Advance workshop from INTAKE to DISCOVERY phase (facilitator only)."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Validation: Check prerequisites
    if workshop.current_phase != WorkshopPhase.INTAKE:
        raise HTTPException(status_code=400, detail=f"Cannot advance to discovery from {workshop.current_phase} phase")

    # Check if traces exist
    traces = db_service.get_traces(workshop_id)
    if len(traces) == 0:
        raise HTTPException(status_code=400, detail="Cannot start discovery phase: No traces uploaded to workshop")

    # Update workshop phase
    db_service.update_workshop_phase(workshop_id, WorkshopPhase.DISCOVERY)

    return {
        "message": "Workshop advanced to discovery phase",
        "phase": "discovery",
        "workshop_id": workshop_id,
        "traces_available": len(traces),
    }


@router.post("/{workshop_id}/advance-to-rubric")
async def advance_to_rubric(workshop_id: str, db: Session = Depends(get_db)):
    """Advance workshop from DISCOVERY to RUBRIC phase (facilitator only)."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Validation: Check prerequisites
    if workshop.current_phase != WorkshopPhase.DISCOVERY:
        raise HTTPException(status_code=400, detail=f"Cannot advance to rubric from {workshop.current_phase} phase")

    # Check if any findings exist (facilitator decides if sufficient)
    findings = db_service.get_findings(workshop_id)
    if len(findings) == 0:
        raise HTTPException(
            status_code=400, detail="Cannot advance to rubric phase: No discovery findings submitted yet"
        )

    # Update workshop phase
    db_service.update_workshop_phase(workshop_id, WorkshopPhase.RUBRIC)

    return {
        "message": "Workshop advanced to rubric phase",
        "phase": "rubric",
        "workshop_id": workshop_id,
        "findings_collected": len(findings),
    }


@router.post("/{workshop_id}/advance-to-annotation")
async def advance_to_annotation(workshop_id: str, db: Session = Depends(get_db)):
    """Advance workshop from RUBRIC to ANNOTATION phase (facilitator only)."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Validation: Check prerequisites
    if workshop.current_phase != WorkshopPhase.RUBRIC:
        raise HTTPException(status_code=400, detail=f"Cannot advance to annotation from {workshop.current_phase} phase")

    # Check if rubric exists
    rubric = db_service.get_rubric(workshop_id)
    if not rubric:
        raise HTTPException(status_code=400, detail="Cannot start annotation phase: Rubric must be created first")

    # Update workshop phase
    db_service.update_workshop_phase(workshop_id, WorkshopPhase.ANNOTATION)

    return {
        "message": "Workshop advanced to annotation phase",
        "phase": "annotation",
        "workshop_id": workshop_id,
        "rubric_question": rubric.question,
    }


@router.post("/{workshop_id}/advance-to-results")
async def advance_to_results(workshop_id: str, db: Session = Depends(get_db)):
    """Advance workshop from ANNOTATION to RESULTS phase (facilitator only)."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Validation: Check prerequisites
    if workshop.current_phase != WorkshopPhase.ANNOTATION:
        raise HTTPException(status_code=400, detail=f"Cannot advance to results from {workshop.current_phase} phase")

    # Check if annotations exist
    annotations = db_service.get_annotations(workshop_id)
    if len(annotations) == 0:
        raise HTTPException(status_code=400, detail="Cannot advance to results phase: No annotations submitted yet")

    # Update workshop phase
    db_service.update_workshop_phase(workshop_id, WorkshopPhase.RESULTS)

    return {
        "message": "Workshop advanced to results phase",
        "phase": "results",
        "workshop_id": workshop_id,
        "annotations_collected": len(annotations),
    }


# Keep the generic endpoint for backward compatibility but add validation
@router.post("/{workshop_id}/advance-phase")
async def advance_workshop_phase(workshop_id: str, target_phase: WorkshopPhase, db: Session = Depends(get_db)):
    """Generic phase advancement - use specific endpoints instead (facilitator only)."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Route to specific validation endpoint
    if target_phase == WorkshopPhase.DISCOVERY:
        return await advance_to_discovery(workshop_id, db)
    if target_phase == WorkshopPhase.RUBRIC:
        return await advance_to_rubric(workshop_id, db)
    if target_phase == WorkshopPhase.ANNOTATION:
        return await advance_to_annotation(workshop_id, db)
    if target_phase == WorkshopPhase.RESULTS:
        return await advance_to_results(workshop_id, db)
    if target_phase == WorkshopPhase.JUDGE_TUNING:
        return await advance_to_judge_tuning(workshop_id, db)
    # Allow direct setting for INTAKE (reset functionality)
    db_service.update_workshop_phase(workshop_id, target_phase)
    return {
        "message": f"Workshop set to {target_phase} phase",
        "phase": target_phase,
        "workshop_id": workshop_id,
    }


@router.get("/{workshop_id}/participants")
async def get_workshop_participants(workshop_id: str, db: Session = Depends(get_db)):
    """Get all participants for a workshop."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    participants = db_service.get_workshop_participants(workshop_id)
    return participants


@router.post("/{workshop_id}/generate-discovery-data")
async def generate_discovery_test_data(workshop_id: str, db: Session = Depends(get_db)):
    """Generate realistic discovery findings for testing."""
    import uuid

    # Temporarily allow in all environments for testing
    # if os.getenv("ENVIRONMENT") != "development":
    #     raise HTTPException(status_code=404, detail="Not found")

    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    try:
        from server.database import DiscoveryFindingDB, TraceDB

        # Get all traces for this workshop
        traces = db.query(TraceDB).filter(TraceDB.workshop_id == workshop_id).all()
        if not traces:
            raise HTTPException(status_code=400, detail="No traces found in workshop")

        # Clear existing findings first
        db.query(DiscoveryFindingDB).filter(DiscoveryFindingDB.workshop_id == workshop_id).delete()

        # Create demo users (SMEs and participants)
        demo_users = [
            {"user_id": "expert_1", "name": "Expert 1"},
            {"user_id": "expert_2", "name": "Expert 2"},
            {"user_id": "expert_3", "name": "Expert 3"},
            {"user_id": "participant_1", "name": "Participant 1"},
            {"user_id": "participant_2", "name": "Participant 2"},
        ]

        findings_created = 0
        for user in demo_users:
            for trace in traces:
                # Generate realistic findings based on trace content
                finding_text = f"Quality Assessment: This response demonstrates {'good' if 'helpful' in trace.output.lower() else 'poor'} customer service quality.\n\nImprovement Analysis: {'The response is clear and helpful' if 'helpful' in trace.output.lower() else 'The response could be more specific and actionable'}."

                finding = DiscoveryFindingDB(
                    id=str(uuid.uuid4()),
                    workshop_id=workshop_id,
                    trace_id=trace.id,
                    user_id=user["user_id"],
                    insight=finding_text,
                    created_at=workshop.created_at,
                )
                db.add(finding)
                findings_created += 1

        db.commit()

        return {
            "message": f"Generated {findings_created} realistic discovery findings",
            "findings_created": findings_created,
            "users": len(demo_users),
            "traces_analyzed": len(traces),
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to generate discovery data: {e!s}") from e


@router.post("/{workshop_id}/generate-rubric-data")
async def generate_rubric_test_data(workshop_id: str, db: Session = Depends(get_db)):
    """Generate realistic rubric for testing."""
    import os
    import uuid

    # Only allow in development environment
    if os.getenv("ENVIRONMENT") != "development":
        raise HTTPException(status_code=404, detail="Not found")

    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    try:
        # Clear existing rubric first
        from server.database import RubricDB

        db.query(RubricDB).filter(RubricDB.workshop_id == workshop_id).delete()

        # Create a realistic rubric question
        rubric_question = "Response Quality: How well does this response address the customer's concern with appropriate tone and actionable information?"
        rubric = RubricDB(
            id=str(uuid.uuid4()),
            workshop_id=workshop_id,
            question=rubric_question,
            created_by="test_facilitator",
            created_at=workshop.created_at,
        )
        db.add(rubric)
        db.commit()

        return {
            "message": "Generated realistic rubric for testing",
            "rubric_question": rubric_question,
            "created_by": "test_facilitator",
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to generate rubric data: {e!s}") from e


@router.post("/{workshop_id}/generate-rubric-suggestions")
async def generate_rubric_suggestions(
    workshop_id: str, request: RubricGenerationRequest, db: Session = Depends(get_db)
) -> list[RubricSuggestion]:
    """Generate rubric suggestions using AI analysis of discovery feedback.

    This endpoint uses a Databricks model serving endpoint to analyze
    discovery findings and participant notes, then generates suggested
    rubric criteria for the facilitator to review.

    Args:
        workshop_id: Workshop ID to generate suggestions for
        request: Generation parameters (endpoint_name, temperature, include_notes)
        db: Database session

    Returns:
        List of rubric suggestions with title, description, judge type, etc.

    Raises:
        HTTPException 404: Workshop not found
        HTTPException 400: No discovery feedback available
        HTTPException 500: Generation or parsing failed
    """
    logger = logging.getLogger(__name__)
    logger.info(f"Generating rubric suggestions for workshop {workshop_id}")

    # Get workshop and validate
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Note: No phase restriction - facilitators can generate rubric suggestions
    # at any time to refine or add evaluation criteria

    try:
        # Initialize services
        from server.services.databricks_service import DatabricksService
        from server.services.rubric_generation_service import RubricGenerationService

        databricks_service = DatabricksService(workshop_id=workshop_id, db_service=db_service)
        generation_service = RubricGenerationService(db_service, databricks_service)

        # Generate suggestions
        suggestions = await generation_service.generate_rubric_suggestions(
            workshop_id=workshop_id,
            endpoint_name=request.endpoint_name,
            temperature=request.temperature,
            include_notes=request.include_notes,
        )

        logger.info(f"Generated {len(suggestions)} rubric suggestions for workshop {workshop_id}")
        return suggestions

    except ValueError as e:
        # User-facing error (e.g., no discovery data)
        logger.warning(f"Cannot generate suggestions: {e}")
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        # Unexpected error
        logger.error(f"Error generating rubric suggestions: {e}", exc_info=True)
        raise HTTPException(status_code=500, detail=f"Failed to generate suggestions: {e!s}") from e


@router.post("/{workshop_id}/generate-annotation-data")
async def generate_annotation_test_data(workshop_id: str, db: Session = Depends(get_db)):
    """Generate realistic annotations for testing."""
    import os
    import random
    import uuid

    # Only allow in development environment
    if os.getenv("ENVIRONMENT") != "development":
        raise HTTPException(status_code=404, detail="Not found")

    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Check if rubric exists
    rubric = db_service.get_rubric(workshop_id)
    if not rubric:
        raise HTTPException(
            status_code=400,
            detail="Cannot generate annotations without a rubric. Please generate rubric data first.",
        )

    try:
        from server.database import AnnotationDB, TraceDB

        # Get all traces for this workshop
        traces = db.query(TraceDB).filter(TraceDB.workshop_id == workshop_id).all()
        if not traces:
            raise HTTPException(status_code=400, detail="No traces found in workshop")

        # Clear existing annotations first
        db.query(AnnotationDB).filter(AnnotationDB.workshop_id == workshop_id).delete()

        # Create demo annotators (SMEs and participants)
        demo_annotators = [
            {"user_id": "expert_1", "name": "Expert 1"},
            {"user_id": "expert_2", "name": "Expert 2"},
            {"user_id": "expert_3", "name": "Expert 3"},
            {"user_id": "participant_1", "name": "Participant 1"},
            {"user_id": "participant_2", "name": "Participant 2"},
        ]

        # Generate realistic annotations that mostly agree (for positive Krippendorff's Alpha)
        annotations_created = 0
        trace_count = len(traces)

        for idx, trace in enumerate(traces):
            # 80% high agreement, 15% moderate agreement, 5% disagreement
            if idx < int(trace_count * 0.8):  # High agreement traces
                # Pick a consensus rating with more realistic distribution
                # Use full scale to avoid Krippendorff's Alpha issues
                consensus_rating = random.choice([1, 2, 2, 3, 3, 3, 4, 4, 4, 4, 5, 5])

                for annotator in demo_annotators:
                    if annotator["user_id"].startswith("expert_"):
                        # Experts very close to consensus
                        rating = consensus_rating + random.choice([0, 0, 0, 0, 1, -1])
                    else:
                        # Participants slightly more variation but still close
                        rating = consensus_rating + random.choice([0, 0, 0, 1, -1])

                    rating = max(1, min(5, rating))

                    annotation = AnnotationDB(
                        id=str(uuid.uuid4()),
                        workshop_id=workshop_id,
                        trace_id=trace.id,
                        user_id=annotator["user_id"],
                        rating=rating,
                        comment=f"Rating: {rating}/5",
                        created_at=workshop.created_at,
                    )
                    db.add(annotation)
                    annotations_created += 1

            elif idx < int(trace_count * 0.95):  # Moderate agreement traces
                # Wider spread but still reasonable
                base_rating = random.choice([2, 3, 3, 3, 4])

                for annotator in demo_annotators:
                    rating = base_rating + random.choice([-1, -1, 0, 0, 1, 1])
                    rating = max(1, min(5, rating))

                    annotation = AnnotationDB(
                        id=str(uuid.uuid4()),
                        workshop_id=workshop_id,
                        trace_id=trace.id,
                        user_id=annotator["user_id"],
                        rating=rating,
                        comment=f"Rating: {rating}/5",
                        created_at=workshop.created_at,
                    )
                    db.add(annotation)
                    annotations_created += 1

            else:  # 5% disagreement traces (for discussion examples)
                # Each annotator has their own opinion
                for annotator in demo_annotators:
                    rating = random.choice([1, 2, 3, 4, 5])  # Full range for discussion

                    annotation = AnnotationDB(
                        id=str(uuid.uuid4()),
                        workshop_id=workshop_id,
                        trace_id=trace.id,
                        user_id=annotator["user_id"],
                        rating=rating,
                        comment=f"Rating: {rating}/5",
                        created_at=workshop.created_at,
                    )
                    db.add(annotation)
                    annotations_created += 1

        db.commit()

        return {
            "message": f"Generated {annotations_created} realistic annotations with varied agreement levels",
            "annotations_created": annotations_created,
            "annotators": len(demo_annotators),
            "traces_annotated": len(traces),
        }

    except Exception as e:
        db.rollback()
        raise HTTPException(status_code=500, detail=f"Failed to generate annotation data: {e!s}") from e


@router.post("/{workshop_id}/generate-test-data")
async def generate_test_data(workshop_id: str, db: Session = Depends(get_db)):
    """Generate all test data (rubric + annotations) for development."""
    import os

    # Only allow in development environment
    if os.getenv("ENVIRONMENT") != "development":
        raise HTTPException(status_code=404, detail="Not found")

    try:
        # Generate rubric first
        await generate_rubric_test_data(workshop_id, db)

        # Then generate annotations
        result = await generate_annotation_test_data(workshop_id, db)

        return {
            "message": "Generated complete test dataset",
            "rubric": "Response Quality rubric created",
            "annotations": result["message"],
            "annotations_created": result["annotations_created"],
        }

    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to generate test data: {e!s}") from e


@router.post("/{workshop_id}/advance-to-judge-tuning")
async def advance_to_judge_tuning(workshop_id: str, db: Session = Depends(get_db)):
    """Advance workshop from ANNOTATION or RESULTS to JUDGE_TUNING phase (facilitator only)."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Validation: Check prerequisites - allow advancement from annotation and results phases
    # Also allow if already in judge_tuning phase (idempotent operation)
    if workshop.current_phase not in [
        WorkshopPhase.ANNOTATION,
        WorkshopPhase.RESULTS,
        WorkshopPhase.JUDGE_TUNING,
    ]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot advance to judge tuning from {workshop.current_phase} phase. Must be in annotation or results phase.",
        )

    # If already in judge_tuning phase, just return success
    if workshop.current_phase == WorkshopPhase.JUDGE_TUNING:
        return {
            "message": "Workshop is already in judge tuning phase",
            "phase": "judge_tuning",
            "workshop_id": workshop_id,
            "already_in_phase": True,
        }

    # Get annotations count for validation
    annotations = db_service.get_annotations(workshop_id)

    # Advance to judge tuning phase
    db_service.update_workshop_phase(workshop_id, WorkshopPhase.JUDGE_TUNING)

    return {
        "message": "Workshop advanced to judge tuning phase",
        "phase": "judge_tuning",
        "workshop_id": workshop_id,
        "annotations_available": len(annotations),
    }


@router.post("/{workshop_id}/advance-to-unity-volume")
async def advance_to_unity_volume(workshop_id: str, db: Session = Depends(get_db)):
    """Advance workshop from JUDGE_TUNING to UNITY_VOLUME phase (facilitator only)."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Validation: Check prerequisites - allow advancement from judge_tuning phase
    # Also allow if already in unity_volume phase (idempotent operation)
    if workshop.current_phase not in [WorkshopPhase.JUDGE_TUNING, WorkshopPhase.UNITY_VOLUME]:
        raise HTTPException(
            status_code=400,
            detail=f"Cannot advance to Unity Volume from {workshop.current_phase} phase. Must be in judge tuning phase.",
        )

    # If already in unity_volume phase, just return success
    if workshop.current_phase == WorkshopPhase.UNITY_VOLUME:
        return {
            "message": "Workshop is already in Unity Volume phase",
            "phase": "unity_volume",
            "workshop_id": workshop_id,
            "already_in_phase": True,
        }

    # Advance to Unity Volume phase
    db_service.update_workshop_phase(workshop_id, WorkshopPhase.UNITY_VOLUME)

    return {
        "message": "Workshop advanced to Unity Volume phase",
        "phase": "unity_volume",
        "workshop_id": workshop_id,
    }


@router.post("/{workshop_id}/upload-to-volume")
async def upload_workshop_to_volume(workshop_id: str, upload_request: dict, db: Session = Depends(get_db)):
    """Upload workshop SQLite database to Unity Catalog volume using provided credentials."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    try:
        # Parse request parameters
        volume_path = upload_request.get("volume_path", "")
        file_name = upload_request.get("file_name", f"workshop_{workshop_id}.db")
        databricks_host = upload_request.get("databricks_host", "")
        databricks_token = upload_request.get("databricks_token", "")

        if not all([volume_path, databricks_host, databricks_token]):
            raise HTTPException(
                status_code=400, detail="Missing required fields: volume_path, databricks_host, and databricks_token"
            )

        # Parse volume path components
        parts = volume_path.strip().split(".")
        if len(parts) != 3:
            raise HTTPException(status_code=400, detail="Volume path must be in format: catalog.schema.volume_name")

        catalog, schema, volume = parts

        # Get the SQLite database file path
        db_file_path = "workshop.db"  # This should be the current workshop database

        if not os.path.exists(db_file_path):
            raise HTTPException(status_code=404, detail=f"SQLite database file not found: {db_file_path}")

        # Upload to Unity Catalog volume using REST API
        import requests

        # Read file into bytes
        with open(db_file_path, "rb") as f:
            file_bytes = f.read()

        # Construct volume file path
        volume_file_path = f"/Volumes/{catalog}/{schema}/{volume}/{file_name}"

        # Upload file using REST API
        upload_url = f"{databricks_host.rstrip('/')}/api/2.0/fs/files{volume_file_path}"

        headers = {"Authorization": f"Bearer {databricks_token}", "Content-Type": "application/octet-stream"}

        response = requests.put(upload_url, data=file_bytes, headers=headers, params={"overwrite": "true"})

        if response.status_code != 204:
            raise Exception(f"Upload failed with status {response.status_code}: {response.text}")

        return {
            "message": "Workshop database uploaded successfully to Unity Catalog volume",
            "volume_path": volume_path,
            "file_path": volume_file_path,
            "file_name": file_name,
            "file_size": len(file_bytes),
            "catalog": catalog,
            "schema": schema,
            "volume": volume,
        }

    except Exception as e:
        print(f"Error uploading to volume: {e!s}")
        raise HTTPException(status_code=500, detail=f"Failed to upload to volume: {e!s}") from e


@router.get("/{workshop_id}/download-database")
async def download_workshop_database(workshop_id: str, db: Session = Depends(get_db)):
    """Download the workshop SQLite database file."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Get the SQLite database file path
    db_file_path = "workshop.db"

    if not os.path.exists(db_file_path):
        raise HTTPException(status_code=404, detail=f"SQLite database file not found: {db_file_path}")

    try:
        # Read the database file
        with open(db_file_path, "rb") as f:
            file_content = f.read()

        # Return the file as a response
        from fastapi.responses import Response

        return Response(
            content=file_content,
            media_type="application/octet-stream",
            headers={
                "Content-Disposition": f'attachment; filename="workshop_{workshop_id}_{workshop.name.replace(" ", "_")}.db"'
            },
        )

    except Exception as e:
        print(f"Error downloading database: {e!s}")
        raise HTTPException(status_code=500, detail=f"Failed to download database: {e!s}") from e


# Phase Completion Management Endpoints
@router.post("/{workshop_id}/complete-phase/{phase}")
async def complete_phase(workshop_id: str, phase: str, db: Session = Depends(get_db)):
    """Mark a phase as completed (facilitator only)."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Get current completed phases
    completed = workshop.completed_phases or []

    # Add phase if not already completed
    if phase not in completed:
        completed.append(phase)

        # Update in database
        db_workshop = db.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()
        db_workshop.completed_phases = completed
        db.commit()

    return {
        "message": f"Phase {phase} marked as completed",
        "completed_phases": completed,
        "workshop_id": workshop_id,
    }


@router.post("/{workshop_id}/resume-phase/{phase}")
async def resume_phase(workshop_id: str, phase: str, db: Session = Depends(get_db)):
    """Resume a completed phase (facilitator only)."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Get current completed phases
    completed = workshop.completed_phases or []

    # Remove phase from completed list
    if phase in completed:
        completed.remove(phase)

        # Update current phase to the resumed one
        db_workshop = db.query(WorkshopDB).filter(WorkshopDB.id == workshop_id).first()
        db_workshop.completed_phases = completed
        db_workshop.current_phase = phase
        db.commit()

    return {
        "message": f"Phase {phase} resumed",
        "current_phase": phase,
        "completed_phases": completed,
        "workshop_id": workshop_id,
    }


# Judge Tuning Endpoints
@router.post("/{workshop_id}/judge-prompts")
async def create_judge_prompt(
    workshop_id: str, prompt_data: JudgePromptCreate, db: Session = Depends(get_db)
) -> JudgePrompt:
    """Create a new judge prompt."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    try:
        return db_service.create_judge_prompt(workshop_id, prompt_data)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to create judge prompt: {e!s}") from e


@router.get("/{workshop_id}/judge-prompts")
async def get_judge_prompts(workshop_id: str, db: Session = Depends(get_db)) -> list[JudgePrompt]:
    """Get all judge prompts for a workshop."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    return db_service.get_judge_prompts(workshop_id)


@router.put("/{workshop_id}/judge-prompts/{prompt_id}/metrics")
async def update_judge_prompt_metrics(
    workshop_id: str, prompt_id: str, metrics_data: dict, db: Session = Depends(get_db)
):
    """Update performance metrics for a judge prompt."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Check if prompt exists
    prompt = db_service.get_judge_prompt(workshop_id, prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Prompt not found")

    try:
        db_service.update_judge_prompt_metrics(prompt_id, metrics_data)
        return {"message": "Metrics updated successfully", "prompt_id": prompt_id}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to update metrics: {e!s}") from e


@router.post("/{workshop_id}/evaluate-judge")
async def evaluate_judge_prompt(
    workshop_id: str, evaluation_request: JudgeEvaluationRequest, db: Session = Depends(get_db)
) -> JudgePerformanceMetrics:
    """Evaluate a judge prompt against human annotations."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    try:
        from server.services.judge_service import JudgeService

        judge_service = JudgeService(db_service)

        return judge_service.evaluate_prompt(workshop_id, evaluation_request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to evaluate judge: {e!s}") from e


@router.post("/{workshop_id}/evaluate-judge-direct")
async def evaluate_judge_prompt_direct(
    workshop_id: str, evaluation_request: JudgeEvaluationDirectRequest, db: Session = Depends(get_db)
) -> JudgeEvaluationResult:
    """Evaluate a judge prompt directly without saving it to history."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    try:
        from server.services.judge_service import JudgeService

        judge_service = JudgeService(db_service)

        return judge_service.evaluate_prompt_direct(workshop_id, evaluation_request)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to evaluate judge: {e!s}") from e


@router.get("/{workshop_id}/judge-evaluations/{prompt_id}")
async def get_judge_evaluations(
    workshop_id: str, prompt_id: str, db: Session = Depends(get_db)
) -> list[JudgeEvaluation]:
    """Get evaluation results for a specific judge prompt."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    return db_service.get_judge_evaluations(workshop_id, prompt_id)


@router.post("/{workshop_id}/judge-evaluations/{prompt_id}")
async def save_judge_evaluations(
    workshop_id: str,
    prompt_id: str,
    evaluations: list[JudgeEvaluation],
    db: Session = Depends(get_db),
):
    """Save evaluation results for a specific judge prompt."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Verify prompt exists
    prompt = db_service.get_judge_prompt(workshop_id, prompt_id)
    if not prompt:
        raise HTTPException(status_code=404, detail="Judge prompt not found")

    # Update prompt_id for all evaluations to ensure they're linked correctly
    for evaluation in evaluations:
        evaluation.prompt_id = prompt_id
        evaluation.workshop_id = workshop_id

    try:
        db_service.store_judge_evaluations(evaluations)
        return {"message": f"Saved {len(evaluations)} evaluations for prompt {prompt_id}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to save evaluations: {e!s}") from e


@router.post("/{workshop_id}/export-judge")
async def export_judge(
    workshop_id: str, export_config: JudgeExportConfig, db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Export a judge configuration."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    try:
        from server.services.judge_service import JudgeService

        judge_service = JudgeService(db_service)

        return judge_service.export_judge(workshop_id, export_config)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to export judge: {e!s}") from e


@router.post("/{workshop_id}/mlflow-config")
async def configure_mlflow_intake(
    workshop_id: str, config: MLflowIntakeConfigCreate, db: Session = Depends(get_db)
) -> MLflowIntakeConfig:
    """Configure MLflow intake for a workshop (token stored in memory, not database)."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    try:
        # Store token in memory
        from server.services.token_storage_service import token_storage

        if config.databricks_token:
            token_storage.store_token(workshop_id, config.databricks_token)
            db_service.set_databricks_token(workshop_id, config.databricks_token)

        # Create config without token (token will be retrieved from memory during ingestion)
        config_without_token = MLflowIntakeConfig(
            databricks_host=config.databricks_host,
            databricks_token="",  # Don't store token in database
            experiment_id=config.experiment_id,
            max_traces=config.max_traces,
            filter_string=config.filter_string,
        )

        return db_service.create_mlflow_config(workshop_id, config_without_token)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to configure MLflow intake: {e!s}") from e


@router.get("/{workshop_id}/mlflow-config")
async def get_mlflow_config(workshop_id: str, db: Session = Depends(get_db)) -> MLflowIntakeConfig | None:
    """Get MLflow intake configuration for a workshop."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    return db_service.get_mlflow_config(workshop_id)


@router.get("/{workshop_id}/mlflow-status")
async def get_mlflow_intake_status(workshop_id: str, db: Session = Depends(get_db)) -> MLflowIntakeStatus:
    """Get MLflow intake status for a workshop."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    return db_service.get_mlflow_intake_status(workshop_id)


@router.post("/{workshop_id}/mlflow-test-connection")
async def test_mlflow_connection(
    workshop_id: str, config: MLflowIntakeConfigCreate, db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Test MLflow connection and return experiment info."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    try:
        from server.services.mlflow_intake_service import MLflowIntakeService

        mlflow_service = MLflowIntakeService(db_service)

        mlflow_config = MLflowIntakeConfig(
            databricks_host=config.databricks_host,
            databricks_token=config.databricks_token,
            experiment_id=config.experiment_id,
            max_traces=config.max_traces,
            filter_string=config.filter_string,
        )

        return mlflow_service.test_connection(mlflow_config)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to test MLflow connection: {e!s}") from e


@router.post("/{workshop_id}/mlflow-ingest")
async def ingest_mlflow_traces(workshop_id: str, ingest_request: dict, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Ingest traces from MLflow into the workshop."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Get MLflow configuration (without token)
    config = db_service.get_mlflow_config(workshop_id)
    if not config:
        raise HTTPException(
            status_code=400,
            detail="MLflow configuration not found. Please configure MLflow intake first.",
        )

    # Get token from memory storage
    from server.services.token_storage_service import token_storage

    databricks_token = token_storage.get_token(workshop_id)
    if not databricks_token:
        databricks_token = db_service.get_databricks_token(workshop_id)
        if databricks_token:
            token_storage.store_token(workshop_id, databricks_token)
    if not databricks_token:
        raise HTTPException(
            status_code=400,
            detail="Databricks token not found. Please configure MLflow intake with your token.",
        )

    # Create config with token for ingestion
    config_with_token = MLflowIntakeConfig(
        databricks_host=config.databricks_host,
        databricks_token=databricks_token,
        experiment_id=config.experiment_id,
        max_traces=config.max_traces,
        filter_string=config.filter_string,
    )

    try:
        from server.services.mlflow_intake_service import MLflowIntakeService

        mlflow_service = MLflowIntakeService(db_service)

        # Ingest traces
        trace_count = mlflow_service.ingest_traces(workshop_id, config_with_token)

        # Update ingestion status
        db_service.update_mlflow_ingestion_status(workshop_id, trace_count)

        return {
            "message": f"Successfully ingested {trace_count} traces from MLflow",
            "trace_count": trace_count,
            "workshop_id": workshop_id,
        }
    except Exception as e:
        # Update ingestion status with error
        db_service.update_mlflow_ingestion_status(workshop_id, 0, str(e))
        raise HTTPException(status_code=500, detail=f"Failed to ingest traces: {e!s}") from e


@router.get("/{workshop_id}/mlflow-traces")
async def get_mlflow_traces(
    workshop_id: str, config: MLflowIntakeConfigCreate, db: Session = Depends(get_db)
) -> list[MLflowTraceInfo]:
    """Get available traces from MLflow (without ingesting)."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    try:
        from server.services.mlflow_intake_service import MLflowIntakeService

        mlflow_service = MLflowIntakeService(db_service)

        mlflow_config = MLflowIntakeConfig(
            databricks_host=config.databricks_host,
            databricks_token=config.databricks_token,
            experiment_id=config.experiment_id,
            max_traces=config.max_traces,
            filter_string=config.filter_string,
        )

        return mlflow_service.search_traces(mlflow_config)
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to get MLflow traces: {e!s}") from e


@router.post("/{workshop_id}/csv-upload")
async def upload_csv_traces(
    workshop_id: str, file: UploadFile = File(...), db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Upload traces from a MLflow trace export CSV file.

    Expected CSV format (MLflow export):
    - Required columns: request_preview, response_preview
    - Optional columns: trace_id, execution_duration_ms, state, request, response,
      spans, tags, trace_metadata, trace_location, assessments, etc.

    Example from MLflow export:
    trace_id,request_preview,response_preview,execution_duration_ms,state,...
    "tr-abc123","What is Python?","Python is a programming language",150,"OK",...
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Validate file type
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV file")

    try:
        import csv
        import io
        import json

        # Read file content
        content = await file.read()
        decoded_content = content.decode("utf-8")

        # Parse CSV
        csv_reader = csv.DictReader(io.StringIO(decoded_content))

        # Validate required columns for MLflow export format
        if (
            not csv_reader.fieldnames
            or "request_preview" not in csv_reader.fieldnames
            or "response_preview" not in csv_reader.fieldnames
        ):
            raise HTTPException(
                status_code=400,
                detail='CSV must contain "request_preview" and "response_preview" columns (MLflow export format). Found columns: '
                + ", ".join(csv_reader.fieldnames or []),
            )

        # Convert CSV rows to TraceUpload objects
        trace_uploads = []
        row_number = 1
        for row in csv_reader:
            row_number += 1

            # Skip empty rows
            if not row.get("request_preview") or not row.get("response_preview"):
                continue

            # Get and clean request/response text
            def clean_csv_text(text):
                if not text:
                    return ""
                text = text.strip()
                # Remove surrounding quotes
                while text.startswith('"') and text.endswith('"') and len(text) > 1:
                    text = text[1:-1].strip()
                text = text.strip('"').strip("'")
                text = text.replace('""', '"')
                if "\\n" in text:
                    text = text.replace("\\n", "\n")
                return text

            # Build rich context from MLflow metadata
            context = {"source": "mlflow_csv_upload", "filename": file.filename, "csv_row_number": row_number}

            # Add all available MLflow metadata to context
            mlflow_fields = {
                "execution_duration_ms": row.get("execution_duration_ms"),
                "state": row.get("state"),
                "request_time": row.get("request_time"),
                "client_request_id": row.get("client_request_id"),
            }

            # Add non-empty fields to context
            for key, value in mlflow_fields.items():
                if value:
                    context[key] = value

            # Parse JSON fields if present
            json_fields = ["request", "response", "spans", "tags", "trace_metadata", "trace_location", "assessments"]
            for field in json_fields:
                if row.get(field):
                    try:
                        context[field] = json.loads(row[field])
                    except json.JSONDecodeError:
                        logger.warning(f"Row {row_number}: Invalid JSON in {field} column, storing as string")
                        context[field] = row[field]

            # Extract MLflow trace ID if available
            mlflow_trace_id = row.get("trace_id")

            # Build trace metadata
            trace_metadata = {"source": "mlflow_csv_upload", "filename": file.filename, "csv_row_number": row_number}

            if row.get("trace_metadata"):
                try:
                    parsed_metadata = json.loads(row["trace_metadata"])
                    if isinstance(parsed_metadata, dict):
                        trace_metadata.update(parsed_metadata)
                except json.JSONDecodeError:
                    pass

            trace_upload = TraceUpload(
                input=row["request_preview"].strip(),
                output=row["response_preview"].strip(),
                context=context,
                trace_metadata=trace_metadata,
                mlflow_trace_id=mlflow_trace_id,
            )
            trace_uploads.append(trace_upload)

        if not trace_uploads:
            raise HTTPException(status_code=400, detail="No valid traces found in CSV file")

        # Add traces to workshop
        added_traces = db_service.add_traces(workshop_id, trace_uploads)

        # Update intake status (similar to MLflow ingestion)
        db_service.update_mlflow_ingestion_status(workshop_id, len(added_traces))

        return {
            "message": f"Successfully uploaded {len(added_traces)} traces from MLflow CSV export",
            "trace_count": len(added_traces),
            "workshop_id": workshop_id,
            "filename": file.filename,
        }

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to process CSV file: {e!s}")
        raise HTTPException(status_code=500, detail=f"Failed to process CSV file: {e!s}") from e


@router.post("/{workshop_id}/csv-upload-to-mlflow")
async def upload_csv_and_log_to_mlflow(
    workshop_id: str,
    file: UploadFile = File(...),
    databricks_host: str = Form(None),
    databricks_token: str = Form(None),
    experiment_id: str = Form(None),
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Upload CSV with request/response data and log each row as an MLflow trace.

    This enables customers who don't have existing MLflow traces to participate
    in the Judge Builder workshop by uploading conversational data as CSV.

    Expected CSV format:
    - Required columns: request_preview, response_preview
    - Optional columns: any additional metadata

    The endpoint will:
    1. Parse the CSV file
    2. For each row, create an MLflow trace with the request/response
    3. Store the traces locally with their MLflow trace IDs

    Environment variables used if parameters not provided:
    - DATABRICKS_HOST
    - DATABRICKS_TOKEN
    - MLFLOW_EXPERIMENT_ID
    """
    import csv
    import io
    import os

    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Validate file type
    if not file.filename.endswith(".csv"):
        raise HTTPException(status_code=400, detail="File must be a CSV file")

    # Get MLflow configuration from parameters or environment variables
    host = databricks_host or os.environ.get("DATABRICKS_HOST")
    token = databricks_token or os.environ.get("DATABRICKS_TOKEN")
    exp_id = experiment_id or os.environ.get("MLFLOW_EXPERIMENT_ID")

    if not host or not token or not exp_id:
        raise HTTPException(
            status_code=400,
            detail="MLflow configuration required. Provide databricks_host, databricks_token, and experiment_id as parameters or set DATABRICKS_HOST, DATABRICKS_TOKEN, and MLFLOW_EXPERIMENT_ID environment variables.",
        )

    # Ensure host has proper format
    if not host.startswith("https://"):
        host = f"https://{host}"
    host = host.rstrip("/")

    try:
        import mlflow

        # Configure MLflow
        os.environ["DATABRICKS_HOST"] = host
        os.environ["DATABRICKS_TOKEN"] = token
        mlflow.set_tracking_uri("databricks")
        mlflow.set_experiment(experiment_id=exp_id)

        # Read file content
        content = await file.read()
        decoded_content = content.decode("utf-8")

        # Parse CSV
        csv_reader = csv.DictReader(io.StringIO(decoded_content))

        # Validate required columns
        if (
            not csv_reader.fieldnames
            or "request_preview" not in csv_reader.fieldnames
            or "response_preview" not in csv_reader.fieldnames
        ):
            raise HTTPException(
                status_code=400,
                detail='CSV must contain "request_preview" and "response_preview" columns. Found columns: '
                + ", ".join(csv_reader.fieldnames or []),
            )

        # Process each row and create MLflow traces
        row_number = 0
        created_traces = 0
        errors = []

        # Helper to clean CSV text
        def clean_text(text):
            if not text:
                return ""
            text = text.strip()
            while text.startswith('"') and text.endswith('"') and len(text) > 1:
                text = text[1:-1].strip()
            text = text.strip('"').strip("'")
            text = text.replace('""', '"')
            if "\\n" in text:
                text = text.replace("\\n", "\n")
            return text

        for row in csv_reader:
            row_number += 1

            # Skip empty rows
            request_text = clean_text(row.get("request_preview", ""))
            response_text = clean_text(row.get("response_preview", ""))

            if not request_text or not response_text:
                continue

            try:
                # Create MLflow trace using start_span context manager
                with mlflow.start_span(name=f"csv_import_row_{row_number}") as span:
                    span.set_inputs(request_text)
                    span.set_outputs(response_text)

                created_traces += 1
                logger.info(f"Created MLflow trace for row {row_number}")

            except Exception as trace_error:
                errors.append(f"Row {row_number}: {trace_error!s}")
                logger.warning(f"Failed to create MLflow trace for row {row_number}: {trace_error!s}")
                continue

        if created_traces == 0:
            error_msg = "No valid MLflow traces could be created from CSV file"
            if errors:
                error_msg += f". Errors: {'; '.join(errors[:5])}"
            raise HTTPException(status_code=400, detail=error_msg)

        # NOTE: This endpoint ONLY creates MLflow traces - it does NOT import into Discovery.
        # To import the MLflow traces into Discovery, use the "Import from MLflow" feature
        # or choose "Import directly into Discovery" when uploading CSV.

        result = {
            "message": f"Successfully created {created_traces} MLflow traces",
            "mlflow_traces_created": created_traces,
            "workshop_id": workshop_id,
            "filename": file.filename,
            "experiment_id": exp_id,
            "mlflow_host": host,
        }

        if errors:
            result["warnings"] = errors[:10]  # Include first 10 errors as warnings

        return result

    except HTTPException:
        raise
    except Exception as e:
        logger.error(f"Failed to process CSV and create MLflow traces: {e!s}")
        raise HTTPException(status_code=500, detail=f"Failed to process CSV file: {e!s}") from e


# User Discovery Completion endpoints
@router.post("/{workshop_id}/users/{user_id}/complete-discovery")
async def mark_user_discovery_complete(workshop_id: str, user_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Mark a user as having completed discovery for a workshop."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Check if user exists in workshop
    user = db_service.get_user(user_id)
    if not user or user.workshop_id != workshop_id:
        raise HTTPException(status_code=404, detail="User not found in workshop")

    # Mark user as complete
    db_service.mark_user_discovery_complete(workshop_id, user_id)

    return {
        "message": f"User {user_id} marked as discovery complete",
        "workshop_id": workshop_id,
        "user_id": user_id,
    }


@router.get("/{workshop_id}/discovery-completion-status")
async def get_discovery_completion_status(workshop_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Get discovery completion status for all users in a workshop."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    return db_service.get_discovery_completion_status(workshop_id)


@router.get("/{workshop_id}/users/{user_id}/discovery-complete")
async def is_user_discovery_complete(workshop_id: str, user_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Check if a user has completed discovery for a workshop."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Check if user exists in workshop
    user = db_service.get_user(user_id)
    if not user or user.workshop_id != workshop_id:
        raise HTTPException(status_code=404, detail="User not found in workshop")

    is_complete = db_service.is_user_discovery_complete(workshop_id, user_id)

    return {
        "workshop_id": workshop_id,
        "user_id": user_id,
        "user_name": user.name,
        "user_email": user.email,
        "discovery_complete": is_complete,
    }


# =========================================================================
# Discovery Analysis endpoints (Step 2)
# =========================================================================


@router.post("/{workshop_id}/analyze-discovery")
async def analyze_discovery(
    workshop_id: str,
    request: AnalyzeDiscoveryRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Trigger AI analysis of discovery feedback.

    Aggregates feedback by trace, detects disagreements deterministically,
    and calls an LLM to distill findings.
    """
    from server.services.databricks_service import DatabricksService
    from server.services.discovery_analysis_service import DiscoveryAnalysisService

    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    try:
        databricks_service = DatabricksService(
            workshop_id=workshop_id,
            db_service=db_service,
        )
    except ValueError as e:
        raise HTTPException(
            status_code=400,
            detail=f"Databricks configuration required: {e!s}",
        ) from e

    analysis_service = DiscoveryAnalysisService(db_service, databricks_service)

    try:
        result = analysis_service.run_analysis(
            workshop_id=workshop_id,
            template=request.template,
            model=request.model,
        )
    except ValueError as e:
        raise HTTPException(status_code=400, detail=str(e)) from e
    except Exception as e:
        logger.error(f"Discovery analysis failed: {e}")
        raise HTTPException(status_code=500, detail=f"Analysis failed: {e!s}") from e

    return result


@router.get("/{workshop_id}/discovery-analysis")
async def list_discovery_analyses(
    workshop_id: str,
    template: str | None = None,
    db: Session = Depends(get_db),
) -> list[dict[str, Any]]:
    """List discovery analyses for a workshop (newest first)."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    records = db_service.get_discovery_analyses(workshop_id, template=template)
    return [
        {
            "id": r.id,
            "workshop_id": r.workshop_id,
            "template_used": r.template_used,
            "analysis_data": r.analysis_data,
            "findings": r.findings,
            "disagreements": r.disagreements,
            "participant_count": r.participant_count,
            "model_used": r.model_used,
            "created_at": r.created_at.isoformat() if r.created_at else None,
            "updated_at": r.updated_at.isoformat() if r.updated_at else None,
        }
        for r in records
    ]


@router.get("/{workshop_id}/discovery-analysis/{analysis_id}")
async def get_discovery_analysis(
    workshop_id: str,
    analysis_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Get a single discovery analysis by ID."""
    db_service = DatabaseService(db)
    record = db_service.get_discovery_analysis(analysis_id)
    if not record or record.workshop_id != workshop_id:
        raise HTTPException(status_code=404, detail="Analysis not found")

    return {
        "id": record.id,
        "workshop_id": record.workshop_id,
        "template_used": record.template_used,
        "analysis_data": record.analysis_data,
        "findings": record.findings,
        "disagreements": record.disagreements,
        "participant_count": record.participant_count,
        "model_used": record.model_used,
        "created_at": record.created_at.isoformat() if record.created_at else None,
        "updated_at": record.updated_at.isoformat() if record.updated_at else None,
    }


@router.post("/{workshop_id}/migrate-annotations")
async def migrate_annotations_to_multi_metric(workshop_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """
    Migrate old annotations (with single 'rating' field) to new format (with 'ratings' dict).
    This populates the 'ratings' dictionary by copying the legacy 'rating' value to all rubric questions.
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Get rubric to know the question IDs
    rubric = db_service.get_rubric(workshop_id)
    if not rubric:
        raise HTTPException(status_code=404, detail="Rubric not found for workshop")

    # Parse rubric questions to get question IDs (using the new delimiter)
    QUESTION_DELIMITER = "|||QUESTION_SEPARATOR|||"
    question_parts = rubric.question.split(QUESTION_DELIMITER)
    question_ids = [f"{rubric.id}_{index}" for index in range(len(question_parts))]

    # Get all annotations for this workshop
    annotations = db_service.get_annotations(workshop_id)

    migrated_count = 0
    already_migrated_count = 0

    for annotation in annotations:
        # Check if already has ratings dict populated
        if annotation.ratings and len(annotation.ratings) > 0:
            already_migrated_count += 1
            continue

        # Migrate: Copy legacy rating to all question IDs
        if annotation.rating is not None:
            new_ratings = {}
            for question_id in question_ids:
                new_ratings[question_id] = annotation.rating

            # Update the annotation in the database
            db_service.db.query(db_service.db_models.Annotation).filter(
                db_service.db_models.Annotation.id == annotation.id
            ).update({"ratings": new_ratings})
            migrated_count += 1

    # Commit all changes
    db_service.db.commit()

    return {
        "workshop_id": workshop_id,
        "total_annotations": len(annotations),
        "migrated": migrated_count,
        "already_migrated": already_migrated_count,
        "question_ids": question_ids,
        "message": f"Successfully migrated {migrated_count} annotations to multi-metric format",
    }


# ============================================================================
# Trace Alignment Endpoints
# ============================================================================


@router.patch("/{workshop_id}/traces/{trace_id}/alignment")
async def update_trace_alignment_inclusion(
    workshop_id: str, trace_id: str, include_in_alignment: bool, db: Session = Depends(get_db)
) -> Trace:
    """Update whether a trace should be included in judge alignment.

    This allows facilitators to exclude traces with SME disagreement from the alignment process.
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    trace = db_service.update_trace_alignment_inclusion(trace_id, include_in_alignment)
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")

    return trace


@router.get("/{workshop_id}/traces-for-alignment")
async def get_traces_for_alignment(workshop_id: str, db: Session = Depends(get_db)) -> list[Trace]:
    """Get all traces that are marked for inclusion in judge alignment.

    Returns only traces where include_in_alignment is True.
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    return db_service.get_traces_for_alignment(workshop_id)


@router.post("/{workshop_id}/traces/{trace_id}/aggregate-feedback")
async def aggregate_trace_feedback(workshop_id: str, trace_id: str, db: Session = Depends(get_db)) -> Trace:
    """Aggregate all SME feedback for a trace and store it on the trace.

    This concatenates all non-empty comments from annotations on this trace
    into a single sme_feedback field for use in alignment.
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Aggregate feedback from all annotations
    aggregated_feedback = db_service.aggregate_sme_feedback_for_trace(workshop_id, trace_id)

    # Update the trace with aggregated feedback
    trace = db_service.update_trace_sme_feedback(trace_id, aggregated_feedback)
    if not trace:
        raise HTTPException(status_code=404, detail="Trace not found")

    return trace


@router.post("/{workshop_id}/aggregate-all-feedback")
async def aggregate_all_trace_feedback(workshop_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Aggregate SME feedback for all annotated traces in the workshop.

    This is a batch operation that processes all traces and updates their sme_feedback fields.
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Get all traces
    traces = db_service.get_traces(workshop_id)

    updated_count = 0
    for trace in traces:
        aggregated_feedback = db_service.aggregate_sme_feedback_for_trace(workshop_id, trace.id)
        if aggregated_feedback:
            db_service.update_trace_sme_feedback(trace.id, aggregated_feedback)
            updated_count += 1

    return {
        "workshop_id": workshop_id,
        "total_traces": len(traces),
        "traces_with_feedback": updated_count,
        "message": f"Successfully aggregated feedback for {updated_count} traces",
    }


# ============================================================================
# Polling-based alignment endpoints
# ============================================================================


@router.post("/{workshop_id}/start-alignment")
async def start_alignment_job(
    workshop_id: str,
    request: AlignmentRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Start an alignment job in the background and return a job ID for polling.

    This is more reliable than SSE streaming as it avoids proxy buffering issues.
    Use GET /alignment-job/{job_id} to poll for status and logs.
    """
    logger.info("=== START ALIGNMENT JOB ===")
    logger.info("workshop_id=%s, judge_name=%s", workshop_id, request.judge_name)

    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Get MLflow config
    mlflow_config = db_service.get_mlflow_config(workshop_id)
    if not mlflow_config:
        raise HTTPException(status_code=400, detail="MLflow configuration not found")

    # Get Databricks token
    from server.services.token_storage_service import token_storage

    databricks_token = token_storage.get_token(workshop_id)
    if not databricks_token:
        databricks_token = db_service.get_databricks_token(workshop_id)
        if databricks_token:
            token_storage.store_token(workshop_id, databricks_token)
    if not databricks_token:
        raise HTTPException(status_code=400, detail="Databricks token not found")

    mlflow_config.databricks_token = databricks_token

    # Create job first so we can log to it
    job_id = str(uuid.uuid4())
    job = create_job(job_id, workshop_id)
    job.set_status("running")
    job.add_log("Alignment job started")

    # IMPORTANT: Re-sync annotations to MLflow before alignment
    # This ensures MLflow has the correct Feedback entries with the judge name
    job.add_log(f"Re-syncing annotations to MLflow for judge '{request.judge_name}'...")
    logger.info("Re-syncing annotations to MLflow before alignment...")
    try:
        resync_result = db_service.resync_annotations_to_mlflow(workshop_id)
        logger.info(f"MLflow re-sync before alignment: {resync_result}")
        job.add_log(
            f"MLflow re-sync result: synced={resync_result.get('synced', 0)}, total={resync_result.get('total', 0)}"
        )
        job.add_log(f"Judge names from rubric: {resync_result.get('judge_names', [])}")
        if resync_result.get("errors"):
            job.add_log(f"Sync errors: {resync_result.get('errors')}")
    except Exception as e:
        logger.warning(f"MLflow re-sync failed before alignment: {e}")
        job.add_log(f"WARNING: MLflow re-sync failed: {e}")
        # Don't fail - alignment might still work if feedback already exists

    # Run alignment in background thread
    def run_alignment_background():
        try:
            # Create a new database session for the background thread
            from server.database import SessionLocal
            from server.services.alignment_service import AlignmentService

            thread_db = SessionLocal()
            try:
                thread_db_service = DatabaseService(thread_db)
                alignment_service = AlignmentService(thread_db_service)

                job.add_log("Initializing alignment service...")

                # Run alignment - the generator yields log messages
                result = None
                for message in alignment_service.run_alignment(
                    workshop_id=workshop_id,
                    judge_name=request.judge_name,
                    judge_prompt=request.judge_prompt,
                    evaluation_model_name=request.evaluation_model_name,
                    alignment_model_name=request.alignment_model_name,
                    mlflow_config=mlflow_config,
                ):
                    if isinstance(message, dict):
                        # This is the final result
                        result = message
                        job.result = result
                        job.save()
                        logger.info("Alignment completed with result")
                    elif isinstance(message, str):
                        # This is a log message
                        job.add_log(message)
                        logger.info("Alignment log: %s", message[:100] if len(message) > 100 else message)

                if result and result.get("success"):
                    # Save aligned instructions as a new judge prompt version
                    aligned_instructions = result.get("aligned_instructions")
                    if aligned_instructions:
                        try:
                            from server.models import JudgePromptCreate

                            new_prompt_data = JudgePromptCreate(
                                prompt_text=aligned_instructions,
                                few_shot_examples=[],
                                model_name=request.evaluation_model_name,
                                model_parameters={
                                    "aligned": True,
                                    "alignment_model": request.alignment_model_name,
                                    "judge_name": request.judge_name,
                                },
                            )
                            new_prompt = thread_db_service.create_judge_prompt(workshop_id, new_prompt_data)
                            result["saved_prompt_id"] = new_prompt.id
                            result["saved_prompt_version"] = new_prompt.version
                            job.add_log(f"Saved aligned instructions as Judge Prompt v{new_prompt.version}")
                            logger.info(
                                "Saved aligned instructions as prompt %s (v%d)", new_prompt.id, new_prompt.version
                            )
                        except Exception as save_err:
                            logger.warning("Failed to save aligned instructions as judge prompt: %s", save_err)
                            job.add_log(f"WARNING: Could not save aligned prompt to database: {save_err}")

                    job.result = result
                    job.save()
                    job.set_status("completed")
                    job.add_log("Alignment completed successfully")
                else:
                    job.set_status("failed")
                    job.error = result.get("error", "Unknown error") if result else "No result returned"
                    job.add_log(f"Alignment failed: {job.error}")

            finally:
                thread_db.close()

        except Exception as e:
            logger.exception("Alignment job failed: %s", e)
            job.set_status("failed")
            job.error = str(e)
            job.add_log(f"ERROR: Alignment failed with exception: {e}")
            job.save()

    # Start background thread
    thread = threading.Thread(target=run_alignment_background, daemon=True)
    thread.start()

    logger.info("Started alignment job %s", job_id)
    return {
        "job_id": job_id,
        "status": "running",
        "message": "Alignment job started. Poll /alignment-job/{job_id} for status.",
    }


@router.get("/{workshop_id}/alignment-job/{job_id}")
async def get_alignment_job_status(
    workshop_id: str,
    job_id: str,
    since_log_index: int = 0,
) -> dict[str, Any]:
    """Get the status and logs of an alignment job.

    Use `since_log_index` to get only new logs since the last poll.
    This allows efficient incremental updates without re-sending all logs.

    Returns:
      - status: pending, running, completed, or failed
      - logs: list of log messages (or new logs if since_log_index provided)
      - log_count: total number of logs
      - result: alignment result (if completed)
      - error: error message (if failed)
    """
    job = get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Alignment job not found")

    if job.workshop_id != workshop_id:
        raise HTTPException(status_code=403, detail="Job does not belong to this workshop")

    # Return only new logs since the given index
    new_logs = job.logs[since_log_index:] if since_log_index > 0 else job.logs

    response = {
        "job_id": job_id,
        "status": job.status,
        "logs": new_logs,
        "log_count": len(job.logs),
        "updated_at": job.updated_at,
    }

    if job.result:
        response["result"] = job.result

    if job.error:
        response["error"] = job.error

    return response


# ============================================================================
# Polling-based evaluation endpoints
# ============================================================================


@router.post("/{workshop_id}/start-evaluation")
async def start_evaluation_job(
    workshop_id: str,
    request: AlignmentRequest,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Start an evaluation job in the background and return a job ID for polling.

    This is more reliable than SSE streaming as it avoids proxy buffering issues.
    Use GET /evaluation-job/{job_id} to poll for status and logs.
    """
    logger.info("=== START EVALUATION JOB ===")
    logger.info("workshop_id=%s, judge_name=%s", workshop_id, request.judge_name)

    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Get MLflow config
    mlflow_config = db_service.get_mlflow_config(workshop_id)
    if not mlflow_config:
        raise HTTPException(status_code=400, detail="MLflow configuration not found")

    # Get Databricks token
    from server.services.token_storage_service import token_storage

    databricks_token = token_storage.get_token(workshop_id)
    if not databricks_token:
        databricks_token = db_service.get_databricks_token(workshop_id)
        if databricks_token:
            token_storage.store_token(workshop_id, databricks_token)
    if not databricks_token:
        raise HTTPException(status_code=400, detail="Databricks token not found")

    mlflow_config.databricks_token = databricks_token

    # IMPORTANT: Re-sync annotations to MLflow before evaluation
    # This ensures all annotations have the 'align' tag and feedback entries in MLflow,
    # even if the inline sync during annotation save failed due to transient errors.
    try:
        resync_result = db_service.resync_annotations_to_mlflow(workshop_id)
        logger.info(f"MLflow re-sync before evaluation: {resync_result}")
    except Exception as e:
        logger.warning(f"MLflow re-sync failed before evaluation (non-critical): {e}")

    # Create job (reusing AlignmentJob class for evaluation too)
    job_id = str(uuid.uuid4())
    job = create_job(job_id, workshop_id)
    job.set_status("running")
    job.add_log("Evaluation job started")

    # Run evaluation in background thread
    def run_evaluation_background():
        try:
            # Create a new database session for the background thread
            from server.database import SessionLocal
            from server.services.alignment_service import AlignmentService

            thread_db = SessionLocal()
            try:
                thread_db_service = DatabaseService(thread_db)
                alignment_service = AlignmentService(thread_db_service)

                job.add_log("Initializing evaluation service...")

                # Run evaluation - the generator yields log messages
                result = None
                for message in alignment_service.run_evaluation_with_answer_sheet(
                    workshop_id=workshop_id,
                    judge_name=request.judge_name,
                    judge_prompt=request.judge_prompt,
                    evaluation_model_name=request.evaluation_model_name,
                    mlflow_config=mlflow_config,
                    judge_type=request.judge_type,  # Pass explicit judge type from selected rubric question
                ):
                    if isinstance(message, dict):
                        # This is the final result
                        result = message
                        job.result = result
                        job.save()
                        logger.info("Evaluation completed with result")
                    elif isinstance(message, str):
                        # This is a log message
                        job.add_log(message)
                        logger.info("Evaluation log: %s", message[:100] if len(message) > 100 else message)

                if result and result.get("success"):
                    # Save evaluation results - use existing prompt if provided, otherwise create new
                    try:
                        import uuid

                        from server.models import JudgeEvaluation, JudgePromptCreate

                        logger.info(f"Saving evaluation results for {len(result.get('evaluations', []))} traces")

                        # Use existing prompt_id if provided, otherwise create a new prompt
                        if request.prompt_id:
                            # Use existing prompt - just update metrics and save evaluations
                            prompt_id_to_use = request.prompt_id
                            existing_prompt = thread_db_service.get_judge_prompt(workshop_id, request.prompt_id)
                            if existing_prompt:
                                result["saved_prompt_id"] = existing_prompt.id
                                result["saved_prompt_version"] = existing_prompt.version
                                logger.info(
                                    f"Using existing JudgePrompt v{existing_prompt.version} (id={existing_prompt.id})"
                                )
                            else:
                                logger.warning(f"Prompt {request.prompt_id} not found, will create new")
                                prompt_id_to_use = None
                        else:
                            prompt_id_to_use = None

                        # Create new prompt only if no existing prompt_id was provided/found
                        if not prompt_id_to_use:
                            new_prompt_data = JudgePromptCreate(
                                prompt_text=request.judge_prompt,
                                few_shot_examples=[],
                                model_name=request.evaluation_model_name,
                                model_parameters={},
                            )
                            new_prompt = thread_db_service.create_judge_prompt(workshop_id, new_prompt_data)
                            prompt_id_to_use = new_prompt.id
                            result["saved_prompt_id"] = new_prompt.id
                            result["saved_prompt_version"] = new_prompt.version
                            logger.info(f"Created JudgePrompt v{new_prompt.version} (id={new_prompt.id})")

                        # 2. Save metrics (update the prompt)
                        if "metrics" in result:
                            thread_db_service.update_judge_prompt_metrics(prompt_id_to_use, result["metrics"])

                        # 3. Save individual evaluations (store_judge_evaluations clears old ones first)
                        if "evaluations" in result:
                            evaluations_to_save = []
                            for eval_data in result["evaluations"]:
                                try:
                                    pred = eval_data.get("predicted_rating")
                                    pred_val = round(float(pred)) if pred is not None else 0

                                    # Use workshop_uuid (DB UUID) if available, otherwise fallback to trace_id (MLflow ID)
                                    # JudgeEvaluationDB requires the foreign key to the traces table (UUID)
                                    trace_id_for_db = eval_data.get("workshop_uuid") or eval_data["trace_id"]

                                    evaluations_to_save.append(
                                        JudgeEvaluation(
                                            id=str(uuid.uuid4()),
                                            workshop_id=workshop_id,
                                            prompt_id=prompt_id_to_use,
                                            trace_id=trace_id_for_db,
                                            predicted_rating=pred_val,
                                            human_rating=int(eval_data["human_rating"])
                                            if eval_data.get("human_rating") is not None
                                            else 0,
                                            confidence=eval_data.get("confidence"),
                                            reasoning=eval_data.get("reasoning"),
                                            predicted_feedback=request.judge_name,  # Store judge name for per-question filtering
                                        )
                                    )
                                except Exception as inner_err:
                                    logger.error(f"Error parsing evaluation row: {inner_err}, data={eval_data}")

                            if evaluations_to_save:
                                thread_db_service.store_judge_evaluations(evaluations_to_save)
                                job.add_log(f"Saved {len(evaluations_to_save)} trace evaluations to database")
                                logger.info(f"Successfully stored {len(evaluations_to_save)} evaluations")
                            else:
                                logger.warning("No evaluations prepared to save")

                        job.add_log(f"Saved evaluation results for Judge Prompt (id={prompt_id_to_use})")
                        logger.info("Saved evaluation results for prompt %s", prompt_id_to_use)

                    except Exception as save_err:
                        logger.exception("Failed to save evaluation results to database")
                        job.add_log(f"WARNING: Could not save evaluation results to database: {save_err}")

                    job.set_status("completed")
                    job.add_log("Evaluation completed successfully")
                else:
                    job.set_status("failed")
                    job.error = result.get("error", "Unknown error") if result else "No result returned"
                    job.add_log(f"Evaluation failed: {job.error}")

            finally:
                thread_db.close()

        except Exception as e:
            logger.exception("Evaluation job failed: %s", e)
            job.set_status("failed")
            job.error = str(e)
            job.add_log(f"ERROR: Evaluation failed with exception: {e}")
            job.save()

    # Start background thread
    thread = threading.Thread(target=run_evaluation_background, daemon=True)
    thread.start()

    logger.info("Started evaluation job %s", job_id)
    return {
        "job_id": job_id,
        "status": "running",
        "message": "Evaluation job started. Poll /evaluation-job/{job_id} for status.",
    }


@router.post("/{workshop_id}/start-simple-evaluation")
async def start_simple_evaluation(
    workshop_id: str, request: SimpleEvaluationRequest, db: Session = Depends(get_db)
) -> dict[str, Any]:
    """Start a simple evaluation job using Databricks Model Serving (no MLflow required).

    This endpoint evaluates the judge prompt by directly calling a Databricks model serving
    endpoint. This is useful when MLflow is not available or configured.
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Get MLflow config for Databricks credentials (host + token)
    mlflow_config = db_service.get_mlflow_config(workshop_id)
    if not mlflow_config:
        raise HTTPException(
            status_code=400, detail="Databricks configuration not found. Please configure in Intake phase."
        )

    # Get Databricks token
    from server.services.token_storage_service import token_storage

    databricks_token = token_storage.get_token(workshop_id)
    if not databricks_token:
        databricks_token = db_service.get_databricks_token(workshop_id)
        if databricks_token:
            token_storage.store_token(workshop_id, databricks_token)
    if not databricks_token:
        raise HTTPException(status_code=400, detail="Databricks token not found")

    # Create job for tracking
    job_id = str(uuid.uuid4())
    job = create_job(job_id, workshop_id)
    job.set_status("running")
    job.add_log("Simple evaluation job started (using Databricks Model Serving)")

    # Run evaluation in background thread
    def run_simple_evaluation_background():
        import re

        try:
            from sklearn.metrics import accuracy_score, cohen_kappa_score, confusion_matrix

            from server.database import SessionLocal
            from server.services.databricks_service import DatabricksService

            thread_db = SessionLocal()
            try:
                thread_db_service = DatabaseService(thread_db)

                # Initialize Databricks service
                job.add_log(f"Connecting to Databricks workspace: {mlflow_config.databricks_host}")
                databricks_svc = DatabricksService(workspace_url=mlflow_config.databricks_host, token=databricks_token)

                # Get rubric to determine judge type
                rubric = thread_db_service.get_rubric(workshop_id)
                is_binary_judge = False
                judge_type_str = "likert"

                if rubric:
                    # First, try to parse rubric questions to get per-question judge types
                    # This is more accurate than the rubric-level judge_type
                    if rubric.question:
                        # Access the private method through the instance
                        questions = thread_db_service._parse_rubric_questions(rubric.question)
                        job.add_log(f"📋 Parsed {len(questions)} questions from rubric")
                        if questions:
                            # Log question details for debugging
                            for i, q in enumerate(questions):
                                job.add_log(
                                    f"  Question {i + 1}: id={q.get('id')}, judge_type={q.get('judge_type')}, title={q.get('title', '')[:50]}"
                                )

                            # Check if any question is binary
                            binary_questions = [q for q in questions if q.get("judge_type") == "binary"]
                            likert_questions = [q for q in questions if q.get("judge_type") == "likert"]

                            job.add_log(
                                f"📊 Found {len(binary_questions)} binary questions and {len(likert_questions)} likert questions"
                            )

                            if binary_questions and not likert_questions:
                                # All questions are binary
                                is_binary_judge = True
                                judge_type_str = "binary"
                                job.add_log("✅ All questions are binary - using binary judge type")
                            elif likert_questions and not binary_questions:
                                # All questions are likert
                                is_binary_judge = False
                                judge_type_str = "likert"
                                job.add_log("✅ All questions are likert - using likert judge type")
                            elif binary_questions:
                                # Mixed - but if we have binary questions, prefer binary
                                # (most common case: rubric has default likert but questions are binary)
                                is_binary_judge = True
                                judge_type_str = "binary"
                                job.add_log(
                                    f"⚠️ Mixed judge types detected - using binary (found {len(binary_questions)} binary questions)"
                                )
                            else:
                                job.add_log(
                                    "⚠️ No judge_type found in questions - will fall back to rubric-level judge_type"
                                )

                    # Fallback to rubric-level judge_type if no questions parsed or all questions are likert
                    if judge_type_str == "likert" and not is_binary_judge:
                        judge_type_enum = rubric.judge_type
                        judge_type_str = (
                            judge_type_enum.value if isinstance(judge_type_enum, JudgeType) else str(judge_type_enum)
                        )
                        is_binary_judge = judge_type_enum == JudgeType.BINARY

                job.add_log(
                    f"Judge type from rubric: {judge_type_str} ({'Binary (Pass/Fail)' if is_binary_judge else 'Likert (1-5)'})"
                )
                job.add_log(
                    f"🔍 Final judge type determination: is_binary_judge={is_binary_judge}, judge_type_str='{judge_type_str}'"
                )

                # Get traces and annotations
                traces = thread_db_service.get_traces(workshop_id)
                annotations = thread_db_service.get_annotations(workshop_id)

                if not traces:
                    job.set_status("failed")
                    job.error = "No traces found"
                    job.add_log("ERROR: No traces found for evaluation")
                    job.save()
                    return

                if not annotations:
                    job.set_status("failed")
                    job.error = "No annotations found"
                    job.add_log("ERROR: No annotations found for evaluation")
                    job.save()
                    return

                job.add_log(f"Found {len(traces)} traces and {len(annotations)} annotations")

                # Group annotations by trace to get human ratings
                # Use per-question ratings if available (supports binary 0/1), fall back to legacy rating
                trace_annotations = {}
                for ann in annotations:
                    if ann.trace_id not in trace_annotations:
                        trace_annotations[ann.trace_id] = []

                    # Prefer ratings dict (contains actual 0/1 for binary, 1-5 for likert)
                    if ann.ratings and len(ann.ratings) > 0:
                        # Get all ratings from the dict (could be multiple questions)
                        for rating in ann.ratings.values():
                            trace_annotations[ann.trace_id].append(rating)
                    else:
                        # Fall back to legacy rating field
                        trace_annotations[ann.trace_id].append(ann.rating)

                # Get trace data mapping
                trace_map = {t.id: t for t in traces}

                evaluations = []
                job.add_log(f"Evaluating {len(trace_annotations)} traces using endpoint: {request.endpoint_name}")

                # Log sample ratings for debugging
                all_ratings = []
                for ratings in trace_annotations.values():
                    all_ratings.extend(ratings)
                job.add_log(f"Sample ratings: {all_ratings[:10]}{'...' if len(all_ratings) > 10 else ''}")

                # Infer judge type from actual ratings if not already determined correctly
                # If all ratings are 0 or 1, it's binary; if we see 2-5, it's likert
                if all_ratings:
                    unique_ratings = set(all_ratings)
                    has_zero = 0 in unique_ratings
                    has_two_to_five = bool(unique_ratings.intersection({2, 3, 4, 5}))

                    if has_zero and not has_two_to_five:
                        # We have 0s and no 2-5 values, so it's binary
                        if not is_binary_judge:
                            job.add_log("⚠️ Judge type inferred from ratings: binary (found 0 values, no 2-5 values)")
                            is_binary_judge = True
                            judge_type_str = "binary"
                    elif has_two_to_five:
                        # We have 2-5 values, so it's likert
                        if is_binary_judge:
                            job.add_log("⚠️ Judge type inferred from ratings: likert (found 2-5 values)")
                            is_binary_judge = False
                            judge_type_str = "likert"

                # Log trace counts for debugging
                job.add_log(f"📊 trace_annotations has {len(trace_annotations)} entries")
                job.add_log(f"📊 trace_map has {len(trace_map)} entries")

                for idx, (trace_id, ratings) in enumerate(trace_annotations.items()):
                    trace = trace_map.get(trace_id)
                    if not trace:
                        job.add_log(
                            f"⚠️ Skipping trace {trace_id[:8]}... - not found in trace_map (annotation exists but trace missing)"
                        )
                        continue

                    # Filter out None values from ratings and validate
                    valid_ratings = [r for r in ratings if r is not None]
                    if not valid_ratings:
                        job.add_log(f"⚠️ Skipping trace {trace_id[:8]}... - no valid ratings (all None)")
                        continue

                    # Get human rating based on judge type
                    if is_binary_judge:
                        # For binary, use majority vote (mode)
                        human_rating = 1 if sum(valid_ratings) > len(valid_ratings) / 2 else 0
                    else:
                        # For Likert, use rounded average
                        human_rating = round(sum(valid_ratings) / len(valid_ratings))

                    # Get trace input and output directly from the Trace model
                    trace_input = trace.input or ""
                    trace_output = trace.output or ""

                    # Log trace data status
                    has_input = bool(trace_input.strip())
                    has_output = bool(trace_output.strip())

                    # Skip only if BOTH input and output are empty
                    if not has_input and not has_output:
                        job.add_log(
                            f"⚠️ Skipping trace {trace_id[:8]}... - no input/output data found (trace idx={idx})"
                        )
                        continue

                    # Log progress for all traces (helpful for debugging the last trace issue)
                    if idx == len(trace_annotations) - 1:
                        job.add_log(f"📍 Processing LAST trace {trace_id[:8]}... (idx={idx})")

                    # Log warning if output is empty (but still evaluate)
                    if not has_output:
                        job.add_log(f"Note: Trace {trace_id[:8]}... has no output, evaluating with input only")
                        trace_output = "(No output provided)"

                    # Log first trace for debugging
                    if idx == 0:
                        job.add_log(f"Sample trace input (first 100 chars): {trace_input[:100]}...")
                        job.add_log(f"Sample trace output (first 100 chars): {trace_output[:100]}...")

                    # Replace placeholders in prompt
                    filled_prompt = request.judge_prompt.replace("{input}", trace_input).replace(
                        "{output}", trace_output
                    )

                    try:
                        # Call Databricks model serving endpoint
                        response = databricks_svc.call_serving_endpoint(
                            endpoint_name=request.endpoint_name, prompt=filled_prompt, temperature=0.0, max_tokens=500
                        )

                        # Parse the response to extract rating based on judge type
                        response_text = response.get("choices", [{}])[0].get("message", {}).get("content", "")
                        response_lower = response_text.lower()

                        predicted_rating = None

                        # Log which branch we're taking for debugging
                        if idx < 3:  # Log first 3 traces for debugging
                            job.add_log(
                                f"🔍 Parsing response for trace {trace_id[:8]}... - is_binary_judge={is_binary_judge}, response preview: {response_text[:100]}"
                            )

                        if is_binary_judge:
                            # Binary judge: look for Pass/Fail keywords FIRST (most reliable)
                            pass_keywords = [
                                "pass",
                                "yes",
                                "correct",
                                "meets",
                                "acceptable",
                                "approve",
                                "good",
                                "satisfies",
                            ]
                            fail_keywords = [
                                "fail",
                                "no",
                                "incorrect",
                                "does not meet",
                                "unacceptable",
                                "reject",
                                "bad",
                                "does not satisfy",
                            ]

                            if any(word in response_lower for word in pass_keywords):
                                predicted_rating = 1  # Pass
                                job.add_log(
                                    f"✅ Binary judge: Found PASS keyword in response for trace {trace_id[:8]}..."
                                )
                            elif any(word in response_lower for word in fail_keywords):
                                predicted_rating = 0  # Fail
                                job.add_log(
                                    f"✅ Binary judge: Found FAIL keyword in response for trace {trace_id[:8]}..."
                                )
                            else:
                                # Try to extract ONLY 0 or 1 (strict - reject anything else)
                                # Use word boundaries to avoid matching "3" in "13" or "30"
                                match = re.search(r"\b(0|1)\b", response_text)
                                if match:
                                    predicted_rating = int(match.group(1))
                                    job.add_log(
                                        f"✅ Binary judge: Extracted {predicted_rating} from response for trace {trace_id[:8]}..."
                                    )
                                else:
                                    # Check if response contains any number - if it's not 0 or 1, log warning
                                    number_match = re.search(r"\b([0-9]+)\b", response_text)
                                    if number_match:
                                        found_number = int(number_match.group(1))
                                        if found_number not in [0, 1]:
                                            job.add_log(
                                                f"⚠️ Binary judge: Response contains {found_number} (not 0 or 1) for trace {trace_id[:8]}... - ignoring. Response: {response_text[:150]}"
                                            )

                            # Default for binary - only if we couldn't parse anything
                            if predicted_rating is None:
                                job.add_log(
                                    f"⚠️ Binary judge: Could not parse binary rating from response for trace {trace_id[:8]}... - defaulting to 1 (Pass). Response: {response_text[:150]}"
                                )
                                predicted_rating = 1  # Default to pass if unclear

                            # Final validation: ensure predicted_rating is strictly 0 or 1
                            if predicted_rating not in [0, 1]:
                                job.add_log(
                                    f"❌ Binary judge: Invalid rating {predicted_rating} detected - forcing to 1. Response: {response_text[:150]}"
                                )
                                predicted_rating = 1
                        else:
                            # Likert judge: look for numeric rating 1-5
                            match = re.search(r"\b([1-5])\b", response_text)
                            if match:
                                predicted_rating = int(match.group(1))

                            # Default for Likert
                            if predicted_rating is None:
                                predicted_rating = 3  # Default to neutral if unclear

                        # Log the final predicted rating for debugging (first few traces)
                        if idx < 3:
                            job.add_log(
                                f"📊 Final predicted_rating for trace {trace_id[:8]}...: {predicted_rating} (is_binary_judge={is_binary_judge})"
                            )

                        evaluations.append(
                            {
                                "trace_id": trace_id,
                                "predicted_rating": predicted_rating,
                                "human_rating": human_rating,
                                "confidence": 0.8,
                                "reasoning": response_text[:500] if response_text else None,
                            }
                        )

                        if (idx + 1) % 5 == 0 or idx == len(trace_annotations) - 1:
                            job.add_log(f"Evaluated {idx + 1}/{len(trace_annotations)} traces")

                    except Exception as eval_err:
                        import traceback

                        error_details = traceback.format_exc()
                        job.add_log(f"Warning: Failed to evaluate trace {trace_id[:8]}...: {str(eval_err)[:100]}")
                        job.add_log(f"Error details: {error_details[-300:]}")  # Last 300 chars of traceback
                        # Use default rating on error (use human rating as fallback)
                        evaluations.append(
                            {
                                "trace_id": trace_id,
                                "predicted_rating": human_rating,
                                "human_rating": human_rating,
                                "confidence": 0.0,
                                "reasoning": f"Evaluation error: {eval_err!s}",
                            }
                        )

                # Log summary of evaluation results
                job.add_log(
                    f"📊 Evaluation loop complete: {len(evaluations)} evaluations from {len(trace_annotations)} annotated traces"
                )
                if len(evaluations) < len(trace_annotations):
                    skipped = len(trace_annotations) - len(evaluations)
                    job.add_log(f"⚠️ WARNING: {skipped} trace(s) were skipped during evaluation!")

                if not evaluations:
                    job.set_status("failed")
                    job.error = "No evaluations completed"
                    job.add_log("ERROR: No evaluations completed successfully")
                    job.save()
                    return

                # Calculate metrics
                job.add_log("Calculating evaluation metrics...")
                predicted = [e["predicted_rating"] for e in evaluations]
                human = [e["human_rating"] for e in evaluations]

                if is_binary_judge:
                    # Binary metrics: unweighted Cohen's Kappa, labels [0, 1]
                    job.add_log("Using binary metrics (Pass=1, Fail=0)")
                    try:
                        kappa = cohen_kappa_score(human, predicted)  # Unweighted for binary
                    except Exception:
                        kappa = 0.0

                    try:
                        conf_matrix = confusion_matrix(human, predicted, labels=[0, 1])
                        conf_matrix_list = conf_matrix.tolist()
                    except Exception:
                        conf_matrix_list = [[0] * 2 for _ in range(2)]
                else:
                    # Likert metrics: quadratic weighted Cohen's Kappa, labels [1, 2, 3, 4, 5]
                    job.add_log("Using Likert metrics (1-5 scale)")
                    try:
                        kappa = cohen_kappa_score(human, predicted, weights="quadratic")
                    except Exception:
                        kappa = 0.0

                    try:
                        conf_matrix = confusion_matrix(human, predicted, labels=[1, 2, 3, 4, 5])
                        conf_matrix_list = conf_matrix.tolist()
                    except Exception:
                        conf_matrix_list = [[0] * 5 for _ in range(5)]

                accuracy = accuracy_score(human, predicted)

                metrics = {
                    "correlation": float(kappa),
                    "accuracy": float(accuracy),
                    "total_evaluations": len(evaluations),
                    "confusion_matrix": conf_matrix_list,
                    "agreement_by_rating": {},
                    "is_binary": is_binary_judge,
                    "judge_type": "binary" if is_binary_judge else "likert",
                    "rating_labels": ["Fail", "Pass"] if is_binary_judge else ["1", "2", "3", "4", "5"],
                }

                job.add_log(
                    f"Evaluation complete: κ={kappa:.3f}, accuracy={accuracy:.1%}, judge_type={'binary' if is_binary_judge else 'likert'}"
                )

                # Build result
                result = {"success": True, "evaluations": evaluations, "metrics": metrics}

                # Save to database
                try:
                    import uuid as uuid_mod

                    from server.models import JudgeEvaluation, JudgePromptCreate

                    # Use existing prompt_id if provided, otherwise create new
                    if request.prompt_id:
                        prompt_id_to_use = request.prompt_id
                        existing_prompt = thread_db_service.get_judge_prompt(workshop_id, request.prompt_id)
                        if existing_prompt:
                            result["saved_prompt_id"] = existing_prompt.id
                            result["saved_prompt_version"] = existing_prompt.version
                        else:
                            prompt_id_to_use = None
                    else:
                        prompt_id_to_use = None

                    if not prompt_id_to_use:
                        new_prompt_data = JudgePromptCreate(
                            prompt_text=request.judge_prompt,
                            few_shot_examples=[],
                            model_name=f"simple:{request.endpoint_name}",
                            model_parameters={"mode": "simple_model_serving"},
                        )
                        new_prompt = thread_db_service.create_judge_prompt(workshop_id, new_prompt_data)
                        prompt_id_to_use = new_prompt.id
                        result["saved_prompt_id"] = new_prompt.id
                        result["saved_prompt_version"] = new_prompt.version

                    # Save metrics
                    thread_db_service.update_judge_prompt_metrics(prompt_id_to_use, metrics)

                    # Save evaluations
                    evaluations_to_save = [
                        JudgeEvaluation(
                            id=str(uuid_mod.uuid4()),
                            workshop_id=workshop_id,
                            prompt_id=prompt_id_to_use,
                            trace_id=e["trace_id"],
                            predicted_rating=e["predicted_rating"],
                            human_rating=e["human_rating"],
                            confidence=e.get("confidence"),
                            reasoning=e.get("reasoning"),
                        )
                        for e in evaluations
                    ]
                    thread_db_service.store_judge_evaluations(evaluations_to_save)
                    job.add_log(f"Saved {len(evaluations_to_save)} evaluations to database")

                    # Sync AI evaluations to MLflow so SIMBA can use them
                    try:
                        sync_result = thread_db_service.sync_evaluations_to_mlflow(
                            workshop_id=workshop_id,
                            judge_name=request.judge_name or "workshop_judge",
                            evaluations=evaluations,
                        )
                        job.add_log(
                            f"Synced {sync_result.get('synced', 0)} AI evaluations to MLflow for judge '{request.judge_name}'"
                        )
                    except Exception as sync_err:
                        job.add_log(f"WARNING: Could not sync to MLflow: {sync_err}")

                except Exception as save_err:
                    job.add_log(f"WARNING: Could not save to database: {save_err}")

                job.result = result
                job.set_status("completed")
                job.add_log("Simple evaluation completed successfully")
                job.save()

            finally:
                thread_db.close()

        except Exception as e:
            logger.exception("Simple evaluation job failed: %s", e)
            job.set_status("failed")
            job.error = str(e)
            job.add_log(f"ERROR: Evaluation failed: {e}")
            job.save()

    # Start background thread
    thread = threading.Thread(target=run_simple_evaluation_background, daemon=True)
    thread.start()

    logger.info("Started simple evaluation job %s", job_id)
    return {
        "job_id": job_id,
        "status": "running",
        "message": "Simple evaluation job started. Poll /evaluation-job/{job_id} for status.",
    }


@router.get("/{workshop_id}/evaluation-job/{job_id}")
async def get_evaluation_job_status(
    workshop_id: str,
    job_id: str,
    since_log_index: int = 0,
) -> dict[str, Any]:
    """Get the status and logs of an evaluation job.

    Use `since_log_index` to get only new logs since the last poll.
    This allows efficient incremental updates without re-sending all logs.

    Returns:
      - status: pending, running, completed, or failed
      - logs: list of log messages (or new logs if since_log_index provided)
      - log_count: total number of logs
      - result: evaluation result (if completed)
      - error: error message (if failed)
    """
    job = get_job(job_id)

    if not job:
        raise HTTPException(status_code=404, detail="Evaluation job not found")

    if job.workshop_id != workshop_id:
        raise HTTPException(status_code=403, detail="Job does not belong to this workshop")

    # Return only new logs since the given index
    new_logs = job.logs[since_log_index:] if since_log_index > 0 else job.logs

    response = {
        "job_id": job_id,
        "status": job.status,
        "logs": new_logs,
        "log_count": len(job.logs),
        "updated_at": job.updated_at,
    }

    if job.result:
        response["result"] = job.result

    if job.error:
        response["error"] = job.error

    return response


# ============================================================================
# Auto-evaluation endpoints (triggered on annotation start)
# ============================================================================


@router.get("/{workshop_id}/auto-evaluation-status")
async def get_auto_evaluation_status(
    workshop_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Get the status of the auto-evaluation job that runs when annotation begins.

    Returns:
        - status: pending, running, completed, failed, or not_started
        - job_id: the job ID if auto-evaluation was started
        - derived_prompt: the judge prompt derived from the rubric
        - logs: job logs (if available)
        - result: evaluation result (if completed)
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    job_id = db_service.get_auto_evaluation_job_id(workshop_id)
    derived_prompt = db_service.get_auto_evaluation_prompt(workshop_id)

    if not job_id:
        return {
            "status": "not_started",
            "job_id": None,
            "derived_prompt": derived_prompt,
            "message": "Auto-evaluation has not been started for this workshop",
        }

    job = get_job(job_id)
    if not job:
        return {
            "status": "not_found",
            "job_id": job_id,
            "derived_prompt": derived_prompt,
            "message": "Job record not found - may have expired",
        }

    response = {
        "status": job.status,
        "job_id": job_id,
        "derived_prompt": derived_prompt,
        "logs": job.logs[-20:] if job.logs else [],  # Last 20 logs
        "log_count": len(job.logs) if job.logs else 0,
        "updated_at": job.updated_at,
    }

    if job.result:
        response["result"] = job.result

    if job.error:
        response["error"] = job.error

    return response


@router.post("/{workshop_id}/refresh-judge-prompt")
async def refresh_judge_prompt(
    workshop_id: str,
    request: dict | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Regenerate the judge prompt from the rubric without running evaluation.

    Use this to update the stored prompt after rubric changes.
    The prompt is regenerated for a single criterion (not all combined).

    Args:
        request: Optional JSON body with:
            - question_index: Which rubric question to generate prompt for (default: 0)
    """
    if request is None:
        request = {}
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    question_index = request.get("question_index", 0)

    # Regenerate prompt for the specified question
    new_prompt = db_service.derive_judge_prompt_from_rubric(workshop_id, question_index)
    if not new_prompt:
        raise HTTPException(status_code=400, detail="Could not generate prompt - check rubric exists")

    # Update the stored prompt (keep existing job_id if any)
    job_id = db_service.get_auto_evaluation_job_id(workshop_id) or ""
    db_service.update_auto_evaluation_job(workshop_id, job_id, new_prompt)

    return {
        "success": True,
        "message": f"Judge prompt regenerated for criterion {question_index + 1}",
        "prompt": new_prompt,
    }


@router.get("/{workshop_id}/debug-evaluations")
async def debug_evaluations(
    workshop_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Debug endpoint to check evaluation storage.

    Shows raw data about prompts and evaluations in the database.
    """
    from server.models import JudgeEvaluationDB, JudgePromptDB

    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Get all prompts
    prompts = (
        db.query(JudgePromptDB)
        .filter(JudgePromptDB.workshop_id == workshop_id)
        .order_by(JudgePromptDB.created_at.desc())
        .all()
    )

    # Get all evaluations
    all_evals = db.query(JudgeEvaluationDB).filter(JudgeEvaluationDB.workshop_id == workshop_id).all()

    # Get traces for comparison
    traces = db_service.get_traces(workshop_id)

    return {
        "workshop_id": workshop_id,
        "prompts": [
            {
                "id": p.id,
                "version": p.version,
                "created_at": str(p.created_at),
                "model_name": p.model_name,
                "prompt_text_preview": p.prompt_text[:100] + "..."
                if p.prompt_text and len(p.prompt_text) > 100
                else p.prompt_text,
            }
            for p in prompts
        ],
        "evaluations_by_prompt": {
            p.id: [
                {
                    "trace_id": e.trace_id,
                    "predicted_rating": e.predicted_rating,
                    "human_rating": e.human_rating,
                }
                for e in all_evals
                if e.prompt_id == p.id
            ]
            for p in prompts
        },
        "total_evaluations": len(all_evals),
        "traces": [
            {
                "id": t.id,
                "mlflow_trace_id": t.mlflow_trace_id,
            }
            for t in traces[:10]  # Just first 10 for debugging
        ],
        "trace_count": len(traces),
    }


@router.post("/{workshop_id}/restart-auto-evaluation")
async def restart_auto_evaluation(
    workshop_id: str,
    request: dict | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Restart auto-evaluation by first tagging traces and then running evaluation.

    Use this when auto-evaluation failed because traces weren't tagged.
    This endpoint will:
    1. Tag all active annotation traces with 'eval' label
    2. Start auto-evaluation jobs for EACH rubric question (multiple judges)

    Args:
        request: Optional JSON body with:
            - evaluation_model_name: Model to use (if not provided, uses stored model)
    """
    if request is None:
        request = {}
    import threading

    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    if workshop.current_phase != "annotation":
        raise HTTPException(status_code=400, detail="Workshop must be in annotation phase")

    # Get active annotation trace IDs
    trace_ids = workshop.active_annotation_trace_ids or []
    if not trace_ids:
        raise HTTPException(status_code=400, detail="No traces selected for annotation")

    # Get MLflow config
    mlflow_config = db_service.get_mlflow_config(workshop_id)
    if not mlflow_config:
        raise HTTPException(status_code=400, detail="MLflow configuration not found")

    # Get Databricks token
    from server.services.token_storage_service import token_storage

    databricks_token = token_storage.get_token(workshop_id)
    if not databricks_token:
        databricks_token = db_service.get_databricks_token(workshop_id)
        if databricks_token:
            token_storage.store_token(workshop_id, databricks_token)
    if not databricks_token:
        raise HTTPException(status_code=400, detail="Databricks token not found")

    mlflow_config.databricks_token = databricks_token

    # Tag traces with 'eval' label
    tag_result = db_service.tag_traces_for_evaluation(workshop_id, trace_ids, tag_type="eval")
    logger.info("Restart auto-eval: Tagged %d traces: %s", tag_result.get("tagged", 0), tag_result)

    # Get all rubric questions for multi-judge evaluation
    rubric_questions = db_service.get_rubric_questions_for_evaluation(workshop_id)
    if not rubric_questions:
        raise HTTPException(status_code=400, detail="No rubric questions found. Create a rubric first.")

    # Get evaluation model
    evaluation_model_name = request.get("evaluation_model_name")
    if not evaluation_model_name:
        evaluation_model_name = db_service.get_auto_evaluation_model(workshop_id) or "databricks-claude-opus-4-5"

    # Create new evaluation job
    job_id = str(uuid.uuid4())
    job = create_job(job_id, workshop_id)
    job.set_status("running")
    job.add_log("Auto-evaluation restarted (multi-judge mode)")
    job.add_log(f"Tagged {tag_result.get('tagged', 0)} traces with 'eval' label")
    job.add_log(f"Found {len(rubric_questions)} rubric questions to evaluate")

    # Store combined prompt for display
    combined_prompt = db_service.derive_judge_prompt_from_rubric(workshop_id) or ""
    db_service.update_auto_evaluation_job(workshop_id, job_id, combined_prompt)

    # Run evaluation in background thread - evaluate each rubric question separately
    def run_restart_evaluation_background():
        try:
            from server.database import SessionLocal
            from server.services.alignment_service import AlignmentService

            thread_db = SessionLocal()
            try:
                thread_db_service = DatabaseService(thread_db)
                alignment_service = AlignmentService(thread_db_service)

                job.add_log("Initializing auto-evaluation service...")

                all_results = []
                total_evaluated = 0

                # Evaluate each rubric question with its own judge
                for i, question in enumerate(rubric_questions):
                    judge_name = question["judge_name"]
                    judge_prompt = question["judge_prompt"]
                    judge_type = question["judge_type"]
                    title = question["title"]

                    job.add_log(f"\n=== Evaluating criterion {i + 1}/{len(rubric_questions)}: {title} ===")
                    job.add_log(f"Judge: {judge_name} (type: {judge_type})")

                    result = None
                    for message in alignment_service.run_evaluation_with_answer_sheet(
                        workshop_id=workshop_id,
                        judge_name=judge_name,
                        judge_prompt=judge_prompt,
                        evaluation_model_name=evaluation_model_name,
                        mlflow_config=mlflow_config,
                        judge_type=judge_type,
                        require_human_ratings=False,  # Auto-eval mode
                        tag_type="eval",  # Use 'eval' tag
                    ):
                        if isinstance(message, dict):
                            result = message
                            all_results.append({"judge_name": judge_name, "title": title, "result": result})
                            if result.get("success"):
                                eval_count = result.get("trace_count", 0)
                                total_evaluated += eval_count
                                job.add_log(f"✓ {judge_name}: Evaluated {eval_count} traces")
                            else:
                                job.add_log(f"✗ {judge_name}: {result.get('error', 'Unknown error')}")
                        elif isinstance(message, str):
                            job.add_log(message)

                # Summarize results
                successful = [r for r in all_results if r["result"].get("success")]
                failed = [r for r in all_results if not r["result"].get("success")]

                # Save evaluations to database
                save_succeeded = False
                if successful:
                    try:
                        from server.models import JudgeEvaluation as JudgeEvalModel
                        from server.models import JudgePromptCreate

                        # Get or create prompt for storing evaluations
                        existing_prompts = thread_db_service.get_judge_prompts(workshop_id)
                        if existing_prompts:
                            prompt_id_to_use = existing_prompts[0].id
                        else:
                            new_prompt_data = JudgePromptCreate(
                                prompt_text=combined_prompt,
                                few_shot_examples=[],
                                model_name=evaluation_model_name,
                                model_parameters={"mode": "auto_evaluation"},
                            )
                            new_prompt = thread_db_service.create_judge_prompt(workshop_id, new_prompt_data)
                            prompt_id_to_use = new_prompt.id

                        all_evaluations = []
                        for judge_result in successful:
                            result = judge_result["result"]
                            judge_name_tag = judge_result.get("judge_name", "")
                            if "evaluations" in result:
                                for eval_data in result["evaluations"]:
                                    try:
                                        pred = eval_data.get("predicted_rating")
                                        pred_val = round(float(pred)) if pred is not None else 0
                                        trace_id_for_db = eval_data.get("workshop_uuid") or eval_data.get("trace_id")
                                        all_evaluations.append(
                                            JudgeEvalModel(
                                                id=str(uuid.uuid4()),
                                                workshop_id=workshop_id,
                                                prompt_id=prompt_id_to_use,
                                                trace_id=trace_id_for_db,
                                                predicted_rating=pred_val,
                                                human_rating=int(eval_data.get("human_rating"))
                                                if eval_data.get("human_rating") is not None
                                                else None,
                                                confidence=eval_data.get("confidence"),
                                                reasoning=eval_data.get("reasoning"),
                                                predicted_feedback=judge_name_tag,
                                            )
                                        )
                                    except Exception as inner_err:
                                        logger.error(f"Error parsing evaluation: {inner_err}")

                        if all_evaluations:
                            # Retry save up to 3 times to handle transient DB errors
                            import time as _time

                            for save_attempt in range(3):
                                try:
                                    thread_db_service.store_judge_evaluations(all_evaluations)
                                    job.add_log(f"✓ Saved {len(all_evaluations)} evaluations to database")
                                    save_succeeded = True
                                    break
                                except Exception as retry_err:
                                    if save_attempt < 2:
                                        job.add_log(f"⚠ Save attempt {save_attempt + 1} failed, retrying in 1s...")
                                        _time.sleep(1)
                                    else:
                                        raise retry_err
                        else:
                            job.add_log("⚠ No evaluations to save")
                    except Exception as save_err:
                        job.add_log(f"⚠ Warning: Could not save evaluations: {save_err}")
                        logger.exception("Failed to save restart-auto-evaluation results")

                job.result = {
                    "success": len(failed) == 0 and save_succeeded,
                    "total_judges": len(rubric_questions),
                    "successful_judges": len(successful),
                    "failed_judges": len(failed),
                    "total_evaluated": total_evaluated,
                    "results_by_judge": all_results,
                }
                job.save()

                if len(failed) == 0 and save_succeeded:
                    job.set_status("completed")
                    job.add_log(f"\n✓ All {len(rubric_questions)} judges completed successfully!")
                    job.add_log(f"Total evaluations: {total_evaluated}")
                elif len(successful) > 0 and save_succeeded:
                    job.set_status("completed")  # Partial success
                    job.add_log(f"\n⚠ {len(successful)}/{len(rubric_questions)} judges succeeded")
                    for f in failed:
                        job.add_log(f"  Failed: {f['judge_name']}")
                elif len(successful) > 0 and not save_succeeded:
                    job.set_status("failed")
                    job.add_log("\n✗ Evaluation succeeded but database save failed. Click 'Run Align()' to retry.")
                else:
                    job.set_status("failed")
                    job.add_log("\n✗ All judges failed")

            finally:
                thread_db.close()

        except Exception as e:
            logger.error("Restart auto-evaluation background error: %s", str(e), exc_info=True)
            job.set_status("failed")
            job.add_log(f"ERROR: {e!s}")
            job.error = str(e)

    # Start background thread
    thread = threading.Thread(target=run_restart_evaluation_background, daemon=True)
    thread.start()

    return {
        "success": True,
        "job_id": job_id,
        "message": f"Auto-evaluation restarted for {len(rubric_questions)} judges. Tagged {tag_result.get('tagged', 0)} traces.",
        "tag_result": tag_result,
        "judges": [q["judge_name"] for q in rubric_questions],
    }


@router.get("/{workshop_id}/auto-evaluation-results")
async def get_auto_evaluation_results(
    workshop_id: str,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Get the auto-evaluation LLM judge scores for traces.

    Returns the evaluation results from the auto-evaluation job that ran
    when annotation began. This includes LLM judge scores for each trace.
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Get the auto-evaluation job status first
    job_id = db_service.get_auto_evaluation_job_id(workshop_id)
    derived_prompt = db_service.get_auto_evaluation_prompt(workshop_id)

    job_status = "not_started"
    if job_id:
        job = get_job(job_id)
        if job:
            job_status = job.status

    # Get the latest evaluations from the database
    # These are stored when the auto-evaluation job completes
    evaluations = db_service.get_latest_evaluations(workshop_id)

    # If we have evaluations in DB but job status is unknown (e.g., after app restart
    # when /tmp job files are lost), report status as "completed" so the frontend
    # displays the results instead of showing "not_started"
    if evaluations and job_status in ("not_started", "not_found"):
        job_status = "completed"

    # Get metrics if available
    metrics = None
    if evaluations:
        # Get the prompt that was used for evaluation
        # Note: get_judge_prompts returns prompts ordered by version DESC, so [0] is the latest
        prompts = db_service.get_judge_prompts(workshop_id)
        if prompts:
            latest_prompt = prompts[0]  # [0] is latest (version DESC order)
            if latest_prompt.performance_metrics:
                metrics = latest_prompt.performance_metrics

    # Build lookups for trace ID mapping (both directions)
    traces = db_service.get_traces(workshop_id)
    # DB UUID -> MLflow trace ID
    db_to_mlflow_map = {t.id: t.mlflow_trace_id for t in traces if t.mlflow_trace_id}
    # MLflow trace ID -> DB UUID (for cases where evaluation was stored with MLflow ID)
    mlflow_to_db_map = {t.mlflow_trace_id: t.id for t in traces if t.mlflow_trace_id}

    logger.info(
        f"auto-evaluation-results: {len(evaluations) if evaluations else 0} evaluations, {len(traces)} traces, {len(db_to_mlflow_map)} with mlflow_trace_id"
    )
    if evaluations:
        sample_eval_ids = [e.trace_id[:20] + "..." for e in evaluations[:3]]
        logger.info(f"Sample evaluation trace_ids: {sample_eval_ids}")
        sample_trace_ids = [t.id[:20] + "..." for t in traces[:3]]
        logger.info(f"Sample DB trace_ids: {sample_trace_ids}")

    def resolve_trace_ids(eval_trace_id: str):
        """Resolve trace IDs to ensure both DB UUID and MLflow trace ID are available."""
        # Check if eval_trace_id is a DB UUID (exists in db_to_mlflow_map)
        if eval_trace_id in db_to_mlflow_map:
            logger.debug(
                f"resolve_trace_ids: {eval_trace_id[:8]}... is DB UUID -> mlflow={db_to_mlflow_map[eval_trace_id][:20] if db_to_mlflow_map[eval_trace_id] else None}..."
            )
            return eval_trace_id, db_to_mlflow_map[eval_trace_id]
        # Check if eval_trace_id is an MLflow trace ID (exists in mlflow_to_db_map)
        if eval_trace_id in mlflow_to_db_map:
            logger.debug(
                f"resolve_trace_ids: {eval_trace_id[:20]}... is MLflow ID -> db_uuid={mlflow_to_db_map[eval_trace_id][:8]}..."
            )
            return mlflow_to_db_map[eval_trace_id], eval_trace_id
        # Fallback: return as-is with None for the other
        logger.warning(f"resolve_trace_ids: {eval_trace_id[:20]}... not found in any map!")
        return eval_trace_id, None

    # Add diagnostic info
    prompts = db_service.get_judge_prompts(workshop_id)
    latest_prompt_info = None
    if prompts:
        latest = prompts[0]
        latest_prompt_info = {
            "id": latest.id,
            "version": latest.version,
            "has_metrics": latest.performance_metrics is not None,
        }

    return {
        "status": job_status,
        "job_id": job_id,
        "derived_prompt": derived_prompt,
        "evaluations": [
            {
                "trace_id": resolve_trace_ids(e.trace_id)[0],  # Always return DB UUID if possible
                "mlflow_trace_id": resolve_trace_ids(e.trace_id)[1],  # MLflow trace ID for matching
                "predicted_rating": e.predicted_rating,
                "human_rating": e.human_rating,
                "confidence": e.confidence,
                "reasoning": e.reasoning,
                "judge_name": e.predicted_feedback or "",  # Rubric question identifier
            }
            for e in evaluations
        ]
        if evaluations
        else [],
        "evaluation_count": len(evaluations) if evaluations else 0,
        "metrics": metrics,
        # Diagnostic info
        "diagnostics": {
            "trace_count": len(traces),
            "traces_with_mlflow_id": len(db_to_mlflow_map),
            "prompts_count": len(prompts) if prompts else 0,
            "latest_prompt": latest_prompt_info,
            "job_logs": get_job(job_id).logs if job_id and get_job(job_id) else None,
        },
    }


@router.post("/{workshop_id}/re-evaluate")
async def re_evaluate(
    workshop_id: str,
    request: dict | None = None,
    db: Session = Depends(get_db),
) -> dict[str, Any]:
    """Manually trigger re-evaluation with the derived or custom prompt.

    This is the "Re-evaluate" button functionality for when the user wants
    to run evaluation again (e.g., after modifying the prompt).

    Args:
        request: Optional JSON body with:
            - judge_prompt: Custom judge prompt (if not provided, uses derived prompt)
            - judge_name: Name of the judge to use (if not provided, uses workshop judge_name)
            - judge_type: Type of judge ('likert', 'binary', 'freeform') - defaults to 'likert'
            - evaluation_model_name: Model to use (default: uses stored model)
    """
    if request is None:
        request = {}
    import threading

    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Get prompt - use custom if provided, otherwise use derived
    judge_prompt = request.get("judge_prompt")
    if not judge_prompt:
        judge_prompt = db_service.get_auto_evaluation_prompt(workshop_id)
    if not judge_prompt:
        # Try to derive from rubric
        judge_prompt = db_service.derive_judge_prompt_from_rubric(workshop_id)
    if not judge_prompt:
        raise HTTPException(status_code=400, detail="No judge prompt available. Create a rubric first.")

    # Use the stored model from initial auto-evaluation
    evaluation_model_name = db_service.get_auto_evaluation_model(workshop_id) or "databricks-claude-opus-4-5"

    # Get MLflow config
    mlflow_config = db_service.get_mlflow_config(workshop_id)
    if not mlflow_config:
        raise HTTPException(status_code=400, detail="MLflow configuration not found")

    # Get Databricks token
    from server.services.token_storage_service import token_storage

    databricks_token = token_storage.get_token(workshop_id)
    if not databricks_token:
        databricks_token = db_service.get_databricks_token(workshop_id)
        if databricks_token:
            token_storage.store_token(workshop_id, databricks_token)
    if not databricks_token:
        raise HTTPException(status_code=400, detail="Databricks token not found")

    mlflow_config.databricks_token = databricks_token

    # Re-tag traces with 'eval' label before evaluation.
    # Annotation sync may have overwritten tags.label to 'align', so we must
    # re-apply 'eval' to ensure _search_tagged_traces finds them.
    trace_ids = workshop.active_annotation_trace_ids or []
    if not trace_ids:
        all_traces = db_service.get_traces(workshop_id)
        trace_ids = [t.id for t in all_traces if t.mlflow_trace_id]
    if trace_ids:
        tag_result = db_service.tag_traces_for_evaluation(workshop_id, trace_ids, tag_type='eval')
        logger.info("Re-evaluate: tagged %d traces with 'eval': %s", tag_result.get('tagged', 0), tag_result)

    # Get judge_name from request, or fall back to workshop judge_name
    judge_name = request.get("judge_name") or workshop.judge_name or "workshop_judge"

    # Get judge_type from request, or derive from rubric
    judge_type = request.get("judge_type")
    if not judge_type:
        # Fall back to deriving from rubric
        rubric = db_service.get_rubric(workshop_id)
        judge_type = "likert"  # default
        if rubric and rubric.question:
            # Parse rubric questions to extract judge type from first question
            parsed_questions = db_service._parse_rubric_questions(rubric.question)
            if parsed_questions:
                judge_type = parsed_questions[0].get("judge_type", "likert")

    # Create new evaluation job
    job_id = str(uuid.uuid4())
    job = create_job(job_id, workshop_id)
    job.set_status("running")
    job.add_log(f"Re-evaluation started for judge: {judge_name}")

    # Update the auto-evaluation job ID
    db_service.update_auto_evaluation_job(workshop_id, job_id, judge_prompt)

    # Run evaluation in background thread
    def run_re_evaluation_background():
        try:
            from server.database import SessionLocal
            from server.services.alignment_service import AlignmentService

            thread_db = SessionLocal()
            try:
                thread_db_service = DatabaseService(thread_db)

                # Check if workshop has MLflow traces - if not, provide helpful error
                traces = thread_db_service.get_traces(workshop_id)
                has_mlflow_traces = any(t.mlflow_trace_id for t in traces if t.mlflow_trace_id)

                if not has_mlflow_traces:
                    job.set_status("failed")
                    job.error = "No MLflow traces found. This workshop appears to use Simple Model Serving mode."
                    job.add_log("ERROR: No MLflow traces found with mlflow_trace_id.")
                    job.add_log("This workshop doesn't have MLflow integration.")
                    job.add_log("Solution: Switch to 'Simple Model Serving' mode and click 'Run Evaluation' instead.")
                    job.save()
                    return

                alignment_service = AlignmentService(thread_db_service)

                job.add_log("Initializing re-evaluation service...")

                result = None
                for message in alignment_service.run_evaluation_with_answer_sheet(
                    workshop_id=workshop_id,
                    judge_name=judge_name,
                    judge_prompt=judge_prompt,
                    evaluation_model_name=evaluation_model_name,
                    mlflow_config=mlflow_config,
                    judge_type=judge_type,
                    require_human_ratings=False,  # Don't require human ratings - just run evaluation
                    tag_type="eval",  # Use 'eval' tag for evaluation traces
                    use_registered_judge=False,  # Use the prompt directly, not the aligned judge
                ):
                    if isinstance(message, dict):
                        result = message
                        job.result = result
                        job.save()
                    elif isinstance(message, str):
                        job.add_log(message)

                if result and result.get("success"):
                    try:
                        from server.models import JudgeEvaluation, JudgePromptCreate

                        # Use existing prompt - re-evaluate doesn't create new versions
                        # Note: get_judge_prompts returns prompts ordered by version DESC, so [0] is the latest
                        existing_prompts = thread_db_service.get_judge_prompts(workshop_id)
                        if existing_prompts:
                            new_prompt = existing_prompts[0]  # [0] is latest (version DESC order)
                            job.add_log(f"Updating evaluations for prompt v{new_prompt.version}")
                        else:
                            # No prompts exist - create one
                            new_prompt_data = JudgePromptCreate(
                                prompt_text=judge_prompt,
                                few_shot_examples=[],
                                model_name=evaluation_model_name,
                                model_parameters={},
                            )
                            new_prompt = thread_db_service.create_judge_prompt(workshop_id, new_prompt_data)
                            job.add_log(f"Created prompt v{new_prompt.version}")

                        # Store evaluations - properly construct JudgeEvaluation objects
                        if "evaluations" in result:
                            evals_to_store = []
                            for eval_data in result["evaluations"]:
                                try:
                                    pred = eval_data.get("predicted_rating")
                                    pred_val = round(float(pred)) if pred is not None else 0
                                    trace_id_for_db = eval_data.get("workshop_uuid") or eval_data["trace_id"]
                                    evals_to_store.append(
                                        JudgeEvaluation(
                                            id=str(uuid.uuid4()),
                                            workshop_id=workshop_id,
                                            prompt_id=new_prompt.id,
                                            trace_id=trace_id_for_db,
                                            predicted_rating=pred_val,
                                            human_rating=int(eval_data["human_rating"])
                                            if eval_data.get("human_rating") is not None
                                            else 0,
                                            confidence=eval_data.get("confidence"),
                                            reasoning=eval_data.get("reasoning"),
                                            predicted_feedback=judge_name,  # Store judge name for per-question filtering
                                        )
                                    )
                                except Exception as inner_err:
                                    logger.error(f"Error parsing evaluation: {inner_err}")

                            if evals_to_store:
                                thread_db_service.store_judge_evaluations(evals_to_store)
                                job.add_log(f"Stored {len(evals_to_store)} evaluation results")

                        job.set_status("completed")
                        job.add_log("Re-evaluation completed successfully")
                    except Exception as save_err:
                        job.add_log(f"Warning: Could not save results: {save_err}")
                        job.set_status("completed")
                else:
                    job.set_status("failed")
                    job.add_log(
                        f"Re-evaluation failed: {result.get('error', 'Unknown error') if result else 'No result'}"
                    )
            finally:
                thread_db.close()
        except Exception as e:
            logger.exception("Re-evaluation error: %s", e)
            job.set_status("failed")
            job.add_log(f"Error: {e!s}")

    # Start background thread
    eval_thread = threading.Thread(target=run_re_evaluation_background, daemon=True)
    eval_thread.start()

    return {
        "message": "Re-evaluation started",
        "job_id": job_id,
        "status": "running",
    }


@router.get("/{workshop_id}/alignment-status")
async def get_alignment_status(workshop_id: str, db: Session = Depends(get_db)) -> dict[str, Any]:
    """Get the current alignment status for a workshop.

    Returns information about:
    - Number of traces available for alignment
    - Whether evaluation has been run
    - Whether alignment is ready to run
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Get traces for alignment
    traces_for_alignment = db_service.get_traces_for_alignment(workshop_id)

    # Get annotations to check for human feedback
    annotations = db_service.get_annotations(workshop_id)
    traces_with_annotations = {a.trace_id for a in annotations}

    # Count traces that have both alignment flag and annotations
    traces_ready = [t for t in traces_for_alignment if t.id in traces_with_annotations]

    # Check if MLflow config exists
    mlflow_config = db_service.get_mlflow_config(workshop_id)

    return {
        "workshop_id": workshop_id,
        "total_traces": len(db_service.get_traces(workshop_id)),
        "traces_for_alignment": len(traces_for_alignment),
        "traces_with_feedback": len(traces_ready),
        "mlflow_configured": mlflow_config is not None,
        "ready_for_alignment": len(traces_ready) > 0 and mlflow_config is not None,
        "message": f"{len(traces_ready)} traces ready for alignment"
        if traces_ready
        else "No traces ready for alignment",
    }


# ============================================================================
# Custom LLM Provider Endpoints
# ============================================================================

import httpx

from server.models import (
    CustomLLMProviderConfigCreate,
    CustomLLMProviderStatus,
    CustomLLMProviderTestResult,
)
from server.services.token_storage_service import token_storage


def _get_custom_llm_storage_key(workshop_id: str) -> str:
    """Get the storage key for custom LLM API keys."""
    return f"custom_llm_{workshop_id}"


def _build_chat_completions_url(base_url: str) -> str:
    """Ensure URL ends with /chat/completions for OpenAI-compatible endpoints."""
    base_url = base_url.rstrip("/")

    # If URL already ends with /chat/completions, use as-is
    if base_url.endswith("/chat/completions"):
        return base_url

    # If URL ends with /v1, append /chat/completions
    if base_url.endswith("/v1"):
        return f"{base_url}/chat/completions"

    # Otherwise, assume it's a base URL and append full path
    return f"{base_url}/v1/chat/completions"


@router.get("/{workshop_id}/custom-llm-provider")
async def get_custom_llm_provider_status(
    workshop_id: str,
    db: Session = Depends(get_db),
) -> CustomLLMProviderStatus:
    """Get the status of custom LLM provider configuration for a workshop.

    Returns configuration status including whether it's configured, enabled,
    and whether an API key is available (without exposing the actual key).
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    config = db_service.get_custom_llm_provider_config(workshop_id)

    if not config:
        return CustomLLMProviderStatus(
            workshop_id=workshop_id,
            is_configured=False,
            is_enabled=False,
            has_api_key=False,
        )

    # Check if API key exists in token storage
    storage_key = _get_custom_llm_storage_key(workshop_id)
    has_api_key = token_storage.get_token(storage_key) is not None

    return CustomLLMProviderStatus(
        workshop_id=workshop_id,
        is_configured=True,
        is_enabled=config.is_enabled,
        provider_name=config.provider_name,
        base_url=config.base_url,
        model_name=config.model_name,
        has_api_key=has_api_key,
    )


@router.post("/{workshop_id}/custom-llm-provider")
async def create_custom_llm_provider(
    workshop_id: str,
    config_data: CustomLLMProviderConfigCreate,
    db: Session = Depends(get_db),
) -> CustomLLMProviderStatus:
    """Create or update custom LLM provider configuration for a workshop.

    The API key is stored in-memory only and will expire after 24 hours.
    Configuration details (provider name, base URL, model name) are persisted.
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Store API key in memory (not in database)
    storage_key = _get_custom_llm_storage_key(workshop_id)
    token_storage.store_token(storage_key, config_data.api_key)

    # Create or update the configuration in the database
    config = db_service.create_custom_llm_provider_config(workshop_id, config_data)

    return CustomLLMProviderStatus(
        workshop_id=workshop_id,
        is_configured=True,
        is_enabled=config.is_enabled,
        provider_name=config.provider_name,
        base_url=config.base_url,
        model_name=config.model_name,
        has_api_key=True,
    )


@router.delete("/{workshop_id}/custom-llm-provider", status_code=status.HTTP_204_NO_CONTENT)
async def delete_custom_llm_provider(
    workshop_id: str,
    db: Session = Depends(get_db),
):
    """Delete custom LLM provider configuration for a workshop.

    Removes both the persisted configuration and the in-memory API key.
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Remove API key from memory
    storage_key = _get_custom_llm_storage_key(workshop_id)
    token_storage.delete_token(storage_key)

    # Delete configuration from database
    db_service.delete_custom_llm_provider_config(workshop_id)


@router.post("/{workshop_id}/custom-llm-provider/test")
async def test_custom_llm_provider(
    workshop_id: str,
    db: Session = Depends(get_db),
) -> CustomLLMProviderTestResult:
    """Test connection to the configured custom LLM provider.

    Makes a minimal API call to verify the endpoint is reachable and
    the API key is valid. Returns response time on success.
    """
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    config = db_service.get_custom_llm_provider_config(workshop_id)
    if not config:
        raise HTTPException(status_code=404, detail="Custom LLM provider not configured for this workshop")

    # Get API key from memory
    storage_key = _get_custom_llm_storage_key(workshop_id)
    api_key = token_storage.get_token(storage_key)
    if not api_key:
        raise HTTPException(status_code=400, detail="API key not found. Please reconfigure the custom LLM provider.")

    # Build the full URL
    url = _build_chat_completions_url(config.base_url)
    headers = {
        "Authorization": f"Bearer {api_key}",
        "Content-Type": "application/json",
    }
    payload = {
        "model": config.model_name,
        "messages": [{"role": "user", "content": "Hi"}],
        "max_tokens": 5,
    }

    start_time = time.time()
    try:
        async with httpx.AsyncClient(timeout=30.0) as client:
            response = await client.post(url, headers=headers, json=payload)
            response_time_ms = int((time.time() - start_time) * 1000)

            if response.status_code == 200:
                return CustomLLMProviderTestResult(
                    success=True,
                    message=f"Successfully connected to {config.provider_name}",
                    response_time_ms=response_time_ms,
                )
            if response.status_code == 401:
                return CustomLLMProviderTestResult(
                    success=False,
                    message="Authentication failed: Invalid API key",
                    error_code="AUTH_FAILED",
                )
            return CustomLLMProviderTestResult(
                success=False,
                message=f"Request failed with status {response.status_code}",
                error_code="REQUEST_FAILED",
            )
    except httpx.TimeoutException:
        return CustomLLMProviderTestResult(
            success=False,
            message="Connection timed out",
            error_code="TIMEOUT",
        )
    except Exception as e:
        return CustomLLMProviderTestResult(
            success=False,
            message=f"Connection error: {e!s}",
            error_code="CONNECTION_ERROR",
        )
