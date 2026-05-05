from __future__ import annotations

from typing import Any

from sqlalchemy.orm import Session

from server.features.project_setup.queue import SetupQueue
from server.features.project_setup.repository import ProjectSetupRepository
from server.features.project_setup.schemas import ProjectSetupProgress, ProjectSetupRequest, ProjectSetupResponse


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
        return self._progress_from_job(job)

    def get_progress(self, setup_job_id: str) -> ProjectSetupProgress | None:
        job = self.repository.get_setup_job(setup_job_id)
        if job is None:
            return None
        return self._progress_from_job(job)

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

    @staticmethod
    def _get(obj: Any, field: str) -> Any:
        if isinstance(obj, dict):
            return obj.get(field)
        return getattr(obj, field)
