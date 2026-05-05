# PROJECT_SETUP_SPEC

## Overview

Project setup is the V2 day-one bootstrap flow. A facilitator or developer creates the long-lived project, records the agent or system being calibrated, configures the trace source, and starts the setup pipeline that prepares downstream rubric, judge, dataset, comments, and feed work.

The setup route creates durable app state and enqueues orchestration work. It does not run expensive evaluations synchronously in the HTTP request. App-level orchestration uses the app task queue; expensive parallelizable work inside the pipeline may delegate to Databricks/Lakeflow Jobs.

## Core Concepts

### Project

The project is the V2 longitudinal anchor. In V2, one app corresponds to one project and one MLflow experiment or trace source. Long-lived setup state attaches to the project.

The app must treat project identity as app-level state, not as a user-selected workshop. Deployments should load the single project for the app after resolving the current user through the active identity provider. If no project exists, the app routes to day-one setup. If more than one project exists for the app, that is an invariant violation that should be surfaced as a recoverable administrative error rather than silently choosing a project.

### Day-One Bootstrap

The first-run creation path at `/project/setup`. It gathers only the minimum information required to start: project name, agent or app description, facilitator identity, and Databricks Unity Catalog trace table path. Additional knobs should default or move to downstream configuration unless explicitly required by a later spec.

The facilitator identity comes from the authenticated app user resolved during app initialization. Project setup must not submit a hardcoded facilitator id.

### Setup Job

The app-owned progress record for setup. It stores the queue job id, current step, status, message, timestamps, and optional JSON details such as delegated Databricks run ids.

### Setup Pipeline

The queued orchestration entrypoint. The pipeline advances setup steps in order, updates the setup job progress read model, and delegates expensive parallelizable work to provider-specific execution only when a concrete step needs it.

## Behavior

### App Loading

App loading is project-first after identity resolution:

1. Resolve the current app user from the active identity provider.
2. Load the app's project record.
3. If no project exists, navigate to `/project/setup`.
4. If exactly one project exists, load the project workspace without presenting a project/workshop picker.
5. If multiple projects exist, show an invariant error with a recoverable admin path.

No project/workshop picker or app-owned password form appears before project resolution.

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

`/project/setup` should use the day-one bootstrap design direction: conversational brief, live project spec preview, and trace-pool-first foundation builder cues. After submission, the user lands on `/` where a setup progress card reflects pending/running state.

## Success Criteria

### Setup Bootstrap

- [ ] Submitting `/project/setup` enqueues a setup pipeline worker job
- [ ] `POST /project/setup` returns `project_id` and `setup_job_id`
- [ ] Setup persists the project name, agent/app description, facilitator id, and Databricks UC trace table path
- [ ] Setup uses the authenticated app user as `facilitator_id`; no hardcoded facilitator id is submitted

### App Loading

- [ ] Production app load resolves a single app project without a workshop/project picker
- [ ] If no project exists, app load routes to `/project/setup`
- [ ] If multiple projects exist for one app, app load surfaces an invariant error instead of choosing silently
- [ ] No project/workshop picker or app-owned password form is shown before project resolution

### Progress Visibility

- [ ] The workspace can query setup progress and display pending or running setup state
- [ ] Setup enqueue failures are visible as recoverable failed state rather than a ready project

### Queue and Delegation

- [ ] Setup orchestration uses the app task queue, not Databricks Jobs, for ordered setup pipeline execution
- [ ] Expensive parallelizable setup steps may record delegated Databricks/Lakeflow run ids without becoming the top-level setup queue

## Implementation Log

| Date | Plan | Status | Summary |
|------|------|--------|---------|
| 2026-05-05 | [V2 Setup Slice Start](../.cursor/plans/v2-setup-start_883e6994.plan.md) | in-progress | Day-one project setup bootstrap with Procrastinate-backed setup orchestration and Databricks/Lakeflow delegation boundaries |
| 2026-05-05 | (spec PR) | proposed | Define one-app/one-project loading and authenticated facilitator ownership before implementation |

## Future Work

- Trace snapshot pinning and audit listing
- Provisional rubric drafting and facilitator review gate
- Baseline MLflow judge registration
- Candidate scoring through Databricks/Lakeflow delegated work
- Active dataset sampling by expected information gain
- Judge comment materialization and feed ready state
