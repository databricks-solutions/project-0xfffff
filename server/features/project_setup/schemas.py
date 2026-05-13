from typing import Any, Literal

from pydantic import BaseModel, Field

SetupStatus = Literal["pending", "running", "completed", "failed", "enqueue_failed", "cancelled"]


class ProjectSetupRequest(BaseModel):
    name: str = Field(min_length=1)
    agent_description: str = Field(min_length=1)
    facilitator_id: str = Field(min_length=1)
    trace_uc_table_path: str = Field(min_length=1)
    description: str | None = None

    @property
    def trace_provider(self) -> str:
        return "databricks_uc"

    @property
    def trace_provider_config(self) -> dict[str, str]:
        return {"uc_table_path": self.trace_uc_table_path}


class ProjectSetupState(BaseModel):
    project_id: str | None = None
    name: str = ""
    description: str | None = None
    agent_description: str = ""
    facilitator_id: str = ""
    trace_uc_table_path: str = ""
    setup_job_id: str | None = None
    setup_status: SetupStatus | None = None


class ProjectSetupResponse(BaseModel):
    project_id: str
    setup_job_id: str
    status: SetupStatus
    current_step: str
    message: str | None = None


class ProjectSetupProgress(BaseModel):
    project_id: str
    setup_job_id: str
    status: SetupStatus
    current_step: str
    message: str | None = None
    queue_job_id: str | None = None
    delegated_run_ids: list[str] = Field(default_factory=list)
    details: dict[str, Any] = Field(default_factory=dict)
