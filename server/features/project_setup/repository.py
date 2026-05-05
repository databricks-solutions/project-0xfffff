from __future__ import annotations

import uuid
from typing import Any

from sqlalchemy.orm import Session

from server.database import ProjectDB, ProjectSetupJobDB
from server.features.project_setup.schemas import ProjectSetupRequest


class ProjectSetupRepository:
    def __init__(self, db: Session):
        self.db = db

    def create_project(self, request: ProjectSetupRequest) -> ProjectDB:
        project = ProjectDB(
            id=str(uuid.uuid4()),
            name=request.name,
            description=request.description,
            agent_description=request.agent_description,
            trace_provider=request.trace_provider,
            trace_provider_config=request.trace_provider_config,
            facilitator_id=request.facilitator_id,
        )
        self.db.add(project)
        self.db.commit()
        self.db.refresh(project)
        return project

    def create_setup_job(self, project_id: str) -> ProjectSetupJobDB:
        job = ProjectSetupJobDB(
            id=str(uuid.uuid4()),
            project_id=project_id,
            status="pending",
            current_step="queued",
            message="Setup queued",
            delegated_run_ids=[],
            details={},
        )
        self.db.add(job)
        self.db.commit()
        self.db.refresh(job)
        return job

    def attach_queue_job(self, setup_job_id: str, queue_job_id: str) -> ProjectSetupJobDB:
        job = self.get_setup_job(setup_job_id)
        if job is None:
            raise ValueError(f"Setup job not found: {setup_job_id}")
        job.queue_job_id = queue_job_id
        self.db.commit()
        self.db.refresh(job)
        return job

    def update_setup_job(
        self,
        setup_job_id: str,
        *,
        status: str | None = None,
        current_step: str | None = None,
        message: str | None = None,
        details: dict[str, Any] | None = None,
    ) -> ProjectSetupJobDB:
        job = self.get_setup_job(setup_job_id)
        if job is None:
            raise ValueError(f"Setup job not found: {setup_job_id}")
        if status is not None:
            job.status = status
        if current_step is not None:
            job.current_step = current_step
        if message is not None:
            job.message = message
        if details is not None:
            job.details = details
        self.db.commit()
        self.db.refresh(job)
        return job

    def get_setup_job(self, setup_job_id: str) -> ProjectSetupJobDB | None:
        return self.db.query(ProjectSetupJobDB).filter(ProjectSetupJobDB.id == setup_job_id).first()

    def get_latest_setup_job(self) -> ProjectSetupJobDB | None:
        return self.db.query(ProjectSetupJobDB).order_by(ProjectSetupJobDB.created_at.desc()).first()
