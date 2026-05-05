from __future__ import annotations

from server.database import SessionLocal
from server.features.project_setup.pipeline import SetupPipeline
from server.workers.procrastinate_app import app


@app.task(name="project_setup.run_setup_pipeline", queue="project_setup")
def run_setup_pipeline(project_id: str, setup_job_id: str) -> None:
    db = SessionLocal()
    try:
        SetupPipeline(db).run(project_id=project_id, setup_job_id=setup_job_id)
    finally:
        db.close()
