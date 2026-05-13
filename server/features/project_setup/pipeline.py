from __future__ import annotations

from sqlalchemy.orm import Session

from server.features.project_setup.repository import ProjectSetupRepository


class SetupPipeline:
    def __init__(self, db: Session | None = None, *, repository: ProjectSetupRepository | None = None):
        if repository is None and db is None:
            raise ValueError("SetupPipeline requires either db or repository")
        self.repository = repository or ProjectSetupRepository(db)  # type: ignore[arg-type]

    def run(self, *, project_id: str, setup_job_id: str) -> None:
        self.repository.update_setup_job(
            setup_job_id,
            status="running",
            current_step="bootstrap_started",
            message="Project setup bootstrap started",
            details={"project_id": project_id},
        )
        self.repository.update_setup_job(
            setup_job_id,
            status="completed",
            current_step="bootstrap_completed",
            message="Project setup bootstrap completed",
            details={"project_id": project_id},
        )
