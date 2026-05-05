import pytest


@pytest.mark.spec("PROJECT_SETUP_SPEC")
@pytest.mark.req("`POST /project/setup` returns `project_id` and `setup_job_id`")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_project_setup_route_returns_project_and_setup_job(async_client, override_get_db, monkeypatch):
    from server.features.project_setup import router as project_setup_router
    from server.features.project_setup.schemas import ProjectSetupResponse

    class FakeProjectSetupService:
        def __init__(self, db=None):
            self.db = db

        def start_setup(self, request):
            assert request.name == "support-agent-eval"
            assert request.agent_description == "Calibrate the support agent."
            assert request.facilitator_id == "facilitator-1"
            assert request.trace_uc_table_path == "main.support.traces"
            return ProjectSetupResponse(
                project_id="project-1",
                setup_job_id="setup-job-1",
                status="pending",
                current_step="queued",
                message="Setup queued",
            )

    monkeypatch.setattr(project_setup_router, "ProjectSetupService", FakeProjectSetupService)

    response = await async_client.post(
        "/project/setup",
        json={
            "name": "support-agent-eval",
            "agent_description": "Calibrate the support agent.",
            "facilitator_id": "facilitator-1",
            "trace_uc_table_path": "main.support.traces",
        },
    )

    assert response.status_code == 201
    assert response.json() == {
        "project_id": "project-1",
        "setup_job_id": "setup-job-1",
        "status": "pending",
        "current_step": "queued",
        "message": "Setup queued",
    }


@pytest.mark.spec("PROJECT_SETUP_SPEC")
@pytest.mark.req("The workspace can query setup progress and display pending or running setup state")
@pytest.mark.unit
@pytest.mark.asyncio
async def test_setup_status_route_returns_latest_progress(async_client, override_get_db, monkeypatch):
    from server.features.project_setup import router as project_setup_router
    from server.features.project_setup.schemas import ProjectSetupProgress

    class FakeProjectSetupService:
        def __init__(self, db=None):
            self.db = db

        def get_latest_progress(self):
            return ProjectSetupProgress(
                project_id="project-1",
                setup_job_id="setup-job-1",
                status="running",
                current_step="snapshot_pending",
                message="Preparing trace snapshot",
                queue_job_id="queue-job-1",
                delegated_run_ids=[],
                details={},
            )

    monkeypatch.setattr(project_setup_router, "ProjectSetupService", FakeProjectSetupService)

    response = await async_client.get("/project/setup-status")

    assert response.status_code == 200
    body = response.json()
    assert body["project_id"] == "project-1"
    assert body["setup_job_id"] == "setup-job-1"
    assert body["status"] == "running"
    assert body["current_step"] == "snapshot_pending"
