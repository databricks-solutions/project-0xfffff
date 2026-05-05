from __future__ import annotations

from fastapi import APIRouter, Depends, HTTPException, status
from sqlalchemy.orm import Session

from server.database import get_db
from server.features.project_setup.schemas import ProjectSetupProgress, ProjectSetupRequest, ProjectSetupResponse
from server.features.project_setup.service import ProjectSetupService

router = APIRouter()


@router.post("/setup", response_model=ProjectSetupResponse, status_code=status.HTTP_201_CREATED)
async def start_project_setup(request: ProjectSetupRequest, db: Session = Depends(get_db)) -> ProjectSetupResponse:
    return ProjectSetupService(db).start_setup(request)


@router.get("/setup-status", response_model=ProjectSetupProgress)
async def get_project_setup_status(db: Session = Depends(get_db)) -> ProjectSetupProgress:
    progress = ProjectSetupService(db).get_latest_progress()
    if progress is None:
        raise HTTPException(status_code=404, detail="Setup job not found")
    return progress


@router.get("/setup-jobs/{setup_job_id}", response_model=ProjectSetupProgress)
async def get_project_setup_job(setup_job_id: str, db: Session = Depends(get_db)) -> ProjectSetupProgress:
    progress = ProjectSetupService(db).get_progress(setup_job_id)
    if progress is None:
        raise HTTPException(status_code=404, detail="Setup job not found")
    return progress
