import pytest


@pytest.mark.spec("PROJECT_SETUP_SPEC")
@pytest.mark.req("Submitting `/project/setup` enqueues a setup pipeline worker job")
def test_project_setup_service_persists_job_and_enqueues_pipeline():
    from server.features.project_setup.schemas import ProjectSetupRequest
    from server.features.project_setup.service import ProjectSetupService

    class FakeRepository:
        def __init__(self):
            self.project = None
            self.job = None
            self.queue_job_id = None

        def create_project(self, request):
            self.project = {
                "id": "project-1",
                "name": request.name,
                "agent_description": request.agent_description,
                "facilitator_id": request.facilitator_id,
                "trace_provider": request.trace_provider,
                "trace_provider_config": request.trace_provider_config,
            }
            return self.project

        def create_setup_job(self, project_id):
            self.job = {
                "id": "setup-job-1",
                "project_id": project_id,
                "status": "pending",
                "current_step": "queued",
            }
            return self.job

        def attach_queue_job(self, setup_job_id, queue_job_id):
            self.queue_job_id = queue_job_id
            self.job["queue_job_id"] = queue_job_id
            return self.job

    class FakeQueue:
        def __init__(self):
            self.calls = []

        def enqueue_setup_pipeline(self, *, project_id, setup_job_id):
            self.calls.append((project_id, setup_job_id))
            return "queue-job-1"

    repository = FakeRepository()
    queue = FakeQueue()
    service = ProjectSetupService(repository=repository, queue=queue)

    response = service.start_setup(
        ProjectSetupRequest(
            name="support-agent-eval",
            agent_description="Calibrate the support agent.",
            facilitator_id="facilitator-1",
            trace_uc_table_path="main.support.traces",
        )
    )

    assert response.project_id == "project-1"
    assert response.setup_job_id == "setup-job-1"
    assert response.status == "pending"
    assert queue.calls == [("project-1", "setup-job-1")]
    assert repository.queue_job_id == "queue-job-1"


@pytest.mark.spec("PROJECT_SETUP_SPEC")
@pytest.mark.req("The workspace can query setup progress and display pending or running setup state")
def test_project_setup_service_returns_latest_progress():
    from server.features.project_setup.service import ProjectSetupService

    class FakeRepository:
        def get_latest_setup_job(self):
            return {
                "id": "setup-job-1",
                "project_id": "project-1",
                "status": "running",
                "current_step": "snapshot_pending",
                "message": "Preparing trace snapshot",
                "queue_job_id": "queue-job-1",
                "delegated_run_ids": [],
                "details": {},
            }

    service = ProjectSetupService(repository=FakeRepository(), queue=None)

    progress = service.get_latest_progress()

    assert progress.setup_job_id == "setup-job-1"
    assert progress.project_id == "project-1"
    assert progress.status == "running"
    assert progress.current_step == "snapshot_pending"
    assert progress.message == "Preparing trace snapshot"
