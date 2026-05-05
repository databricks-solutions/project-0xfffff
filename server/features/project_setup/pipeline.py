from __future__ import annotations

from sqlalchemy.orm import Session

from server.features.project_setup.repository import ProjectSetupRepository


class SetupPipeline:
    def __init__(self, db: Session):
        self.repository = ProjectSetupRepository(db)

    def run(self, *, project_id: str, setup_job_id: str) -> None:
        self.repository.update_setup_job(
            setup_job_id,
            status="running",
            current_step="bootstrap_started",
            message="Project setup bootstrap started",
            details={"project_id": project_id},
        )
