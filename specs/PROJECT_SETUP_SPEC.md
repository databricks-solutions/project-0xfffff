# PROJECT_SETUP_SPEC

## Overview

Project setup is the V2 day-one bootstrap flow. A facilitator or developer creates the long-lived project, records the agent or system being calibrated, configures the trace source, and starts the setup pipeline that prepares downstream rubric, judge, dataset, comments, and feed work.

The setup route creates durable app state and enqueues orchestration work. It does not run expensive evaluations synchronously in the HTTP request. App-level orchestration uses the app task queue; expensive parallelizable work inside the pipeline may delegate to Databricks/Lakeflow Jobs.

## Core Concepts

### Project

The project is the V2 longitudinal anchor. In V2, one app corresponds to one project and one MLflow experiment or trace source. Long-lived setup state attaches to the project.

### Day-One Bootstrap

The first-run creation path at `/project/setup`. It gathers only the minimum information required to start: project name, agent or app description, facilitator identity, and Databricks Unity Catalog trace table path. Additional knobs should default or move to downstream configuration unless explicitly required by a later spec.

### Setup Job

The app-owned progress record for setup. It stores the queue job id, current step, status, message, timestamps, and optional JSON details such as delegated Databricks run ids.

### Setup Pipeline

The queued orchestration entrypoint. The pipeline advances setup steps in order, updates the setup job progress read model, and delegates expensive parallelizable work to provider-specific execution only when a concrete step needs it.

## Behavior

### Setup Submission

`POST /project/setup` creates or configures the project and creates a pending setup job. After the project and setup job are persisted, the app enqueues a task queue job that runs the setup pipeline.

The response returns both `project_id` and `setup_job_id` so the frontend can navigate to `/` and poll progress.

### Queue Semantics

Setup orchestration uses a durable app task queue. V2 uses Procrastinate because it is Postgres-backed and fits the Lakebase direction without Redis. Queue enqueue failure must not be presented as a ready project; the setup job should remain failed or enqueue_failed with a recoverable message.

### Progress Visibility

The workspace can query setup progress and show at least pending and running states. Later setup steps can add richer events, but the initial slice must avoid silent empty states.

### Delegated Expensive Work

Databricks/Lakeflow Jobs are not the top-level setup queue. They are delegated execution providers for expensive parallelizable work inside the pipeline, such as candidate scoring, evaluation fan-out, and batch judge runs. The setup job read model stores delegated run ids when those steps exist.

### SQLite Development Behavior

Durable queue semantics require Postgres/Lakebase. Local SQLite may use an explicitly marked development fallback for tests and local UI work, but production must not silently pretend durable queueing exists on SQLite.

## Data Model

### Project

```python
Project {
  id: str
  name: str
  description: str | None
  agent_description: str
  trace_provider: "databricks_uc"
  trace_provider_config: dict  # { "uc_table_path": str }
  facilitator_id: str
  created_at: datetime
  updated_at: datetime
}
```

### ProjectSetupJob

```python
ProjectSetupJob {
  id: str
  project_id: str
  status: "pending" | "running" | "completed" | "failed" | "cancelled"
  current_step: str
  message: str | None
  queue_job_id: str | None
  delegated_run_ids: list[str]
  details: dict
  created_at: datetime
  updated_at: datetime
}
```

## Implementation

### API Surface

- `POST /project/setup` starts day-one bootstrap.
- `GET /project/setup-status` returns latest setup progress for the current project.
- `GET /project/setup-jobs/{job_id}` returns a specific setup job.

### Ownership Boundaries

The setup feature owns its own router, schemas, service, repository, pipeline, and queue task modules. It should not append behavior to broad modules such as `server/routers/workshops.py` or `server/services/database_service.py`.

### Frontend

`/project/setup` is the setup entry route for projects that do not have completed setup state. The UI should implement the V2 day-one bootstrap design handoff in `docs/v2_design/workshop-create.jsx` and collect only the fields owned by this spec: project name, agent/app description, facilitator identity, and Databricks Unity Catalog trace table path.

#### Entry and Routing

- The application bootstrap gate checks setup state before rendering the facilitator root workspace.
- If there is no configured project or setup has not been submitted, the gate routes the user to `/project/setup`.
- If the latest setup job is pending, running, failed, or enqueue_failed, the gate renders the facilitator root workspace with setup progress state instead of treating the project as ready.
- Direct navigation to `/project/setup` remains valid for retrying setup after recoverable failures.

#### Submission and Navigation

- Disable the primary CTA while validation fails or submission is in flight.
- On successful `POST /project/setup`, store the returned `project_id` and `setup_job_id` in the frontend state used by the bootstrap gate, then navigate to the facilitator root workspace.
- On API validation errors, keep the user on `/project/setup` and show field-level errors when possible plus a form-level message for non-field failures.
- On enqueue failure returned by the API, do not navigate to ready workspace state; show the recoverable failure message and offer retry.

#### Setup Progress

- The facilitator root workspace should show setup progress whenever the latest setup job is pending, running, failed, or enqueue_failed.
- Pending/running states should include the current step, status message, and a small ordered step list so the workspace is not an empty shell.
- Failed/enqueue_failed states should use recoverable copy and a retry action when the backend exposes one; until retry exists, link back to `/project/setup` with the previous values prefilled where possible.
- Completed state may dismiss the setup card and reveal normal workspace content.

#### Component Boundaries

- Keep setup UI code in a feature-owned route/module such as `client/src/features/project-setup` or the closest existing feature structure.
- Prefer small local components for `SetupForm`, `SetupProgressCard`, and `SetupStepList` instead of adding setup-specific behavior to broad workspace components.
- Use the repository's existing API client, form, routing, and notification patterns before introducing new state or UI libraries.
- Use the shared atoms defined for setup in `UI_COMPONENTS_SPEC` rather than copying the design-canvas prototype components directly.

#### UI Wiring Architecture

The setup UI should wire through a thin feature boundary: route components own presentation and client-side validation, a setup API hook owns request/response mapping, and the backend setup API remains the source of truth for project and setup job state.

```mermaid
flowchart LR
    AppBootstrap["App bootstrap gate"] --> StatusHook["setup status hook"]
    StatusHook --> LatestStatus["GET /project/setup-status"]
    LatestStatus --> NoProject{"project setup complete?"}
    NoProject -->|no project or not submitted| SetupRoute["/project/setup route"]
    NoProject -->|pending/running/failed| RootWorkspace["facilitator root workspace"]
    NoProject -->|completed| ReadyWorkspace["ready workspace content"]
    SetupRoute --> SetupForm["SetupForm<br/>required fields + validation"]
    SetupForm --> SetupApiHook["useProjectSetupApi<br/>request mapping + loading/error state"]
    SetupApiHook --> PostSetup["POST /project/setup"]
    PostSetup --> SetupService["Project setup service"]
    SetupService --> ProjectRepo["Project + ProjectSetupJob repositories"]
    SetupService --> Queue["App task queue<br/>setup pipeline job"]
    PostSetup --> SetupApiHook
    SetupApiHook --> NavigateRoot["navigate to facilitator root workspace"]
    NavigateRoot --> RootWorkspace
    RootWorkspace --> SetupProgressCard["SetupProgressCard"]
    SetupProgressCard --> JobStatusHook["setup job polling hook"]
    JobStatusHook --> JobStatus["GET /project/setup-jobs/{job_id}"]
    JobStatus --> SetupProgressCard
```

- `SetupProgressCard` reads persisted setup job state only; it must not infer readiness from local navigation state.
- The API hook should normalize backend validation, enqueue failure, and setup job status responses into UI-friendly states without hiding the original recoverable message.
- The bootstrap gate decides whether to show setup, setup progress, or ready workspace content from `GET /project/setup-status`, not from the existence of a recently submitted form.

## Success Criteria

### Setup Bootstrap

- [ ] Submitting `/project/setup` enqueues a setup pipeline worker job
- [ ] `POST /project/setup` returns `project_id` and `setup_job_id`
- [ ] Setup persists the project name, agent/app description, facilitator id, and Databricks UC trace table path
- [ ] `/project/setup` renders a setup form backed by shared form, input, button, card, alert, and badge atoms
- [ ] Project name, agent/app description, facilitator identity, and Databricks UC trace table path are required before submission
- [ ] Required setup fields show client-side validation before submission
- [ ] Successful setup submission navigates to the facilitator root workspace with setup job progress available
- [ ] UI implementation follows the wiring architecture diagram and keeps setup entry, submission, and progress concerns separate

### Progress Visibility

- [ ] The facilitator root workspace can query setup progress and display pending or running setup state
- [ ] Setup enqueue failures are visible as recoverable failed state rather than a ready project
- [ ] Pending/running setup states render a facilitator root workspace progress card with current step and message
- [ ] Failed or enqueue_failed setup states keep the user out of the ready workspace path and present recoverable copy

### Queue and Delegation

- [ ] Setup orchestration uses the app task queue, not Databricks Jobs, for ordered setup pipeline execution
- [ ] Expensive parallelizable setup steps may record delegated Databricks/Lakeflow run ids without becoming the top-level setup queue

## Implementation Log

| Date | Plan | Status | Summary |
|------|------|--------|---------|
| 2026-05-05 | [V2 Setup Slice Start](../.cursor/plans/v2-setup-start_883e6994.plan.md) | in-progress | Day-one project setup bootstrap with Procrastinate-backed setup orchestration and Databricks/Lakeflow delegation boundaries |

## Future Work

- Trace snapshot pinning and audit listing
- Provisional rubric drafting and facilitator review gate
- Baseline MLflow judge registration
- Candidate scoring through Databricks/Lakeflow delegated work
- Active dataset sampling by expected information gain
- Judge comment materialization and feed ready state
