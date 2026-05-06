from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from server.features.project_setup.pipeline import SetupPipeline
from server.features.project_setup.queue import SetupQueue
from server.features.project_setup.repository import ProjectSetupRepository
from server.features.project_setup.schemas import ProjectSetupProgress, ProjectSetupRequest, ProjectSetupResponse, ProjectSetupState


class ProjectSetupService:
    def __init__(self, db: Session | None = None, *, repository: Any | None = None, queue: Any | None = None):
        if repository is None and db is None:
            raise ValueError("ProjectSetupService requires either db or repository")
        self.repository = repository or ProjectSetupRepository(db)  # type: ignore[arg-type]
        self.queue = queue or SetupQueue()

    def start_setup(self, request: ProjectSetupRequest) -> ProjectSetupResponse:
        project = self.repository.create_project(request)
        project_id = self._get(project, "id")
        setup_job = self.repository.create_setup_job(project_id)
        setup_job_id = self._get(setup_job, "id")
        queue_job_id = self.queue.enqueue_setup_pipeline(project_id=project_id, setup_job_id=setup_job_id)
        setup_job = self.repository.attach_queue_job(setup_job_id, queue_job_id)
        setup_job = self._complete_dev_fallback_if_needed(setup_job)

        return ProjectSetupResponse(
            project_id=project_id,
            setup_job_id=setup_job_id,
            status=self._get(setup_job, "status"),
            current_step=self._get(setup_job, "current_step"),
            message=self._get(setup_job, "message"),
        )

    def get_latest_progress(self) -> ProjectSetupProgress | None:
        job = self.repository.get_latest_setup_job()
        if job is None:
            return None
        job = self._complete_dev_fallback_if_needed(job)
        return self._progress_from_job(job)

    def get_state(self) -> ProjectSetupState | None:
        project = self.repository.get_latest_project()
        if project is None:
            return None
        job = self.repository.get_latest_setup_job_for_project(self._get(project, "id"))
        if job is not None:
            job = self._complete_dev_fallback_if_needed(job)
        return self._state_from_project(project, job)

    def update_state(self, request: ProjectSetupRequest) -> ProjectSetupState:
        project = self.repository.get_latest_project()
        if project is None:
            raise ValueError("Project not found")
        project = self.repository.update_project(self._get(project, "id"), request)
        job = self.repository.get_latest_setup_job_for_project(self._get(project, "id"))
        return self._state_from_project(project, job)

    def get_progress(self, setup_job_id: str) -> ProjectSetupProgress | None:
        job = self.repository.get_setup_job(setup_job_id)
        if job is None:
            return None
        job = self._complete_dev_fallback_if_needed(job)
        return self._progress_from_job(job)

    def _complete_dev_fallback_if_needed(self, job: Any) -> Any:
        queue_job_id = self._get(job, "queue_job_id")
        status = self._get(job, "status")
        if not (isinstance(queue_job_id, str) and queue_job_id.startswith("dev-unqueued:")):
            return job
        if status not in {"pending", "running"}:
            return job

        setup_job_id = self._get(job, "id")
        project_id = self._get(job, "project_id")
        try:
            SetupPipeline(repository=self.repository).run(project_id=project_id, setup_job_id=setup_job_id)
        except Exception as exc:
            return self.repository.update_setup_job(
                setup_job_id,
                status="failed",
                current_step="dev_fallback_failed",
                message=f"Development setup fallback failed: {exc}",
                details={"project_id": project_id},
            )
        return self.repository.get_setup_job(setup_job_id) or job

    def _progress_from_job(self, job: Any) -> ProjectSetupProgress:
        return ProjectSetupProgress(
            project_id=self._get(job, "project_id"),
            setup_job_id=self._get(job, "id"),
            status=self._get(job, "status"),
            current_step=self._get(job, "current_step"),
            message=self._get(job, "message"),
            queue_job_id=self._get(job, "queue_job_id"),
            delegated_run_ids=self._get(job, "delegated_run_ids") or [],
            details=self._get(job, "details") or {},
        )

    def _state_from_project(self, project: Any, job: Any | None) -> ProjectSetupState:
        trace_config = self._get(project, "trace_provider_config") or {}
        return ProjectSetupState(
            project_id=self._get(project, "id"),
            name=self._get(project, "name") or "",
            description=self._get(project, "description"),
            agent_description=self._get(project, "agent_description") or "",
            facilitator_id=self._get(project, "facilitator_id") or "",
            trace_uc_table_path=trace_config.get("uc_table_path", ""),
            setup_job_id=self._get(job, "id") if job is not None else None,
            setup_status=self._get(job, "status") if job is not None else None,
        )

    @staticmethod
    def _get(obj: Any, field: str) -> Any:
        if isinstance(obj, dict):
            return obj.get(field)
        return getattr(obj, field)
