# Implementation Plan: Webhook Notifications on Workshop Phase Change

## Source

- **Brainstorm**: `.claude/skills/brainstorming-workspace/iteration-1/webhook-phase-notifications/with_skill/outputs/brainstorm-output.md`
- **Draft Spec**: `WEBHOOK_NOTIFICATIONS_SPEC` (embedded in brainstorm output, Step 6)

---

## Overview

Add webhook notification support so that when a workshop phase advances, an async HTTP POST is sent to a facilitator-configured URL. This is a backend-only feature (no frontend changes in v1). The design follows Approach A from the brainstorm: a service-layer utility called from each advance endpoint, using FastAPI `BackgroundTasks` for async dispatch.

---

## Prerequisites

- **httpx**: Already in `pyproject.toml` dependencies (`httpx>=0.25.0`). No new dependency needed.
- **Alembic**: Migration infrastructure exists at `migrations/` with `script.py.mako` template. Latest migration is `0016_add_span_attribute_filter`.

---

## Task Breakdown

### Task 1: Alembic Migration -- Add Webhook Columns to `workshops` Table

**File**: `migrations/versions/0017_add_webhook_columns.py` (new)

**What to do**:
- Create a new Alembic migration with `revision = "0017_add_webhook_columns"` and `down_revision = "0016_add_span_attribute_filter"`.
- Add two columns to the `workshops` table using `batch_alter_table` (required for SQLite compatibility -- see existing migration pattern in `0016`):
  - `webhook_url`: `sa.Column("webhook_url", sa.String(), nullable=True)`
  - `webhook_enabled`: `sa.Column("webhook_enabled", sa.Boolean(), server_default=sa.text("0"), nullable=False)`
- Downgrade drops both columns.

**Pattern to follow**: Copy the structure from `migrations/versions/0016_add_span_attribute_filter.py` -- it uses `batch_alter_table` for SQLite compatibility.

**Estimated size**: ~25 lines.

---

### Task 2: Extend SQLAlchemy Model -- `WorkshopDB`

**File**: `server/database.py` (modify)

**What to do**:
- Add two columns to the `WorkshopDB` class (around line 168, after `span_attribute_filter`):
  ```python
  webhook_url = Column(String, nullable=True)
  webhook_enabled = Column(Boolean, default=False)
  ```

**No new relationships needed**. These are scalar columns on the existing `workshops` table.

---

### Task 3: Extend Pydantic Model -- `Workshop`

**File**: `server/models.py` (modify)

**What to do**:
- Add two fields to the `Workshop` model (around line 167, after `span_attribute_filter`):
  ```python
  webhook_url: str | None = None
  webhook_enabled: bool = False
  ```
- Add new request/response models for the webhook configuration endpoints:
  ```python
  class WebhookConfigUpdate(BaseModel):
      url: str
      enabled: bool = True

  class WebhookConfigResponse(BaseModel):
      url: str | None = None
      enabled: bool = False
  ```

---

### Task 4: Update `DatabaseService.update_workshop_phase()` Return Value

**File**: `server/services/database_service.py` (modify)

**What to do**:
- In the `update_workshop_phase` method (line 324), add `webhook_url` and `webhook_enabled` to the returned `Workshop` object so callers have access to webhook config after a phase update:
  ```python
  return Workshop(
      # ... existing fields ...
      webhook_url=db_workshop.webhook_url,
      webhook_enabled=db_workshop.webhook_enabled,
  )
  ```
- Also update any other methods that construct `Workshop` objects from `WorkshopDB` (e.g., `get_workshop`, `create_workshop`) to include the new fields. Search for all occurrences of `Workshop(` in this file to find them all.

**Additionally**, add three new methods to `DatabaseService`:
  ```python
  def get_webhook_config(self, workshop_id: str) -> dict | None:
      """Get webhook config for a workshop."""

  def update_webhook_config(self, workshop_id: str, url: str, enabled: bool) -> dict:
      """Set webhook URL and enabled flag."""

  def delete_webhook_config(self, workshop_id: str) -> None:
      """Clear webhook URL and set enabled=False."""
  ```
  These follow the same pattern as other DB update methods (query, mutate, commit, refresh).

---

### Task 5: Create `WebhookService`

**File**: `server/services/webhook_service.py` (new)

**What to do**:
- Create a service class with a single public async method:

```python
"""Webhook notification service for workshop phase change events."""

import logging
from datetime import datetime, timezone

import httpx

from server.models import WorkshopPhase

logger = logging.getLogger(__name__)

WEBHOOK_TIMEOUT_SECONDS = 5


async def notify_phase_change(
    webhook_url: str,
    workshop_id: str,
    workshop_name: str,
    previous_phase: str,
    new_phase: str,
) -> None:
    """Send an async HTTP POST to the configured webhook URL.

    Fire-and-forget: logs errors but never raises.
    """
    payload = {
        "event": "phase_changed",
        "workshop_id": workshop_id,
        "workshop_name": workshop_name,
        "previous_phase": previous_phase,
        "new_phase": new_phase,
        "timestamp": datetime.now(timezone.utc).isoformat(),
    }
    try:
        async with httpx.AsyncClient(timeout=WEBHOOK_TIMEOUT_SECONDS) as client:
            response = await client.post(
                webhook_url,
                json=payload,
                headers={"Content-Type": "application/json"},
            )
            if response.is_success:
                logger.info(
                    "Webhook delivered for workshop %s: %s -> %s (status %d)",
                    workshop_id, previous_phase, new_phase, response.status_code,
                )
            else:
                logger.warning(
                    "Webhook delivery failed for workshop %s: HTTP %d %s",
                    workshop_id, response.status_code, response.text[:200],
                )
    except httpx.TimeoutException:
        logger.warning(
            "Webhook timed out after %ds for workshop %s",
            WEBHOOK_TIMEOUT_SECONDS, workshop_id,
        )
    except Exception:
        logger.warning(
            "Webhook delivery error for workshop %s", workshop_id, exc_info=True,
        )
```

**Design decisions**:
- Module-level function (not a class) keeps it simple; no state to manage.
- `httpx.AsyncClient` is created per-call. For v1 this is fine; a shared client could be optimized later.
- All exceptions are caught and logged at WARNING level. The function never raises.

---

### Task 6: Add Webhook Configuration Endpoints

**File**: `server/routers/workshops.py` (modify)

**What to do**:
- Add three new endpoints. Place them near the other workshop settings endpoints (e.g., near the `update_judge_name` endpoint around line 273):

```python
@router.put("/{workshop_id}/webhook")
async def update_webhook_config(workshop_id: str, config: WebhookConfigUpdate, db: Session = Depends(get_db)):
    """Configure webhook URL for a workshop (facilitator only)."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")

    # Validate URL format
    if not config.url.startswith(("http://", "https://")):
        raise HTTPException(status_code=400, detail="Webhook URL must start with http:// or https://")

    db_service.update_webhook_config(workshop_id, config.url, config.enabled)
    return {"url": config.url, "enabled": config.enabled}


@router.get("/{workshop_id}/webhook")
async def get_webhook_config(workshop_id: str, db: Session = Depends(get_db)):
    """Get webhook configuration for a workshop (facilitator only)."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")
    return {"url": workshop.webhook_url, "enabled": workshop.webhook_enabled}


@router.delete("/{workshop_id}/webhook")
async def delete_webhook_config(workshop_id: str, db: Session = Depends(get_db)):
    """Remove webhook configuration for a workshop (facilitator only)."""
    db_service = DatabaseService(db)
    workshop = db_service.get_workshop(workshop_id)
    if not workshop:
        raise HTTPException(status_code=404, detail="Workshop not found")
    db_service.delete_webhook_config(workshop_id)
    return {"message": "Webhook configuration removed"}
```

**Import additions** at top of file:
```python
from server.services.webhook_service import notify_phase_change
from server.models import WebhookConfigUpdate
```

---

### Task 7: Wire Webhook Dispatch into Phase Advance Endpoints

**File**: `server/routers/workshops.py` (modify)

**What to do**:

Add `BackgroundTasks` parameter and webhook dispatch to **each** advance endpoint. There are 7 call sites where `db_service.update_workshop_phase()` is called:

| # | Endpoint | Line | Transition |
|---|----------|------|------------|
| 1 | `advance_to_discovery` | 1885 | intake -> discovery |
| 2 | `advance_to_rubric` | 1918 | discovery -> rubric |
| 3 | `advance_to_annotation` | 1948 | rubric -> annotation |
| 4 | `advance_to_results` | 1976 | annotation -> results |
| 5 | `advance_to_judge_tuning` | 2388 | annotation/results -> judge_tuning |
| 6 | `advance_to_unity_volume` | 2424 | judge_tuning -> unity_volume |
| 7 | `advance_workshop_phase` (generic, line 2007) | 2007 | intake -> any (reset) |
| 8 | `begin_discovery_phase` | 1005 | intake -> discovery |
| 9 | `begin_annotation_phase` | 1451 | rubric -> annotation |

**Important**: The generic `advance_workshop_phase` (line 1988) delegates to the specific `advance_to_*` functions for known phases, so webhooks dispatched in the specific functions will fire correctly -- no double-dispatch risk for those paths. However, the fallback path at line 2007 (for INTAKE reset) also calls `update_workshop_phase` directly, so it needs its own webhook dispatch.

**Also important**: `begin_discovery_phase` and `begin_annotation_phase` are separate higher-level endpoints that also call `update_workshop_phase`. These need webhook dispatch too.

**Pattern for each endpoint**:

1. Add `background_tasks: BackgroundTasks` parameter to the endpoint signature.
2. Capture `previous_phase = workshop.current_phase` before calling `update_workshop_phase`.
3. After the `update_workshop_phase` call, add:
   ```python
   if workshop.webhook_url and workshop.webhook_enabled:
       background_tasks.add_task(
           notify_phase_change,
           webhook_url=workshop.webhook_url,
           workshop_id=workshop_id,
           workshop_name=workshop.name,
           previous_phase=previous_phase,
           new_phase=new_phase_value,
       )
   ```

**Import addition**: `from fastapi import BackgroundTasks` (likely already imported or available).

**Special handling for `begin_annotation_phase`**: This endpoint spawns a thread for `_do_phase_updates()`. The webhook should be dispatched from the main async context (before/after the thread), not inside the thread. Capture previous phase before the thread, and schedule the background task after `_do_phase_updates` completes. Alternatively, since `BackgroundTasks` fires after the response, you can schedule it in the main function body after `_do_phase_updates()`.

---

### Task 8: Unit Tests for `WebhookService`

**File**: `tests/unit/test_webhook_service.py` (new)

**Test cases**:

1. **`test_notify_phase_change_success`**: Mock `httpx.AsyncClient.post` to return 200. Verify payload structure (event, workshop_id, previous_phase, new_phase, timestamp, workshop_name). Verify the function returns None.

2. **`test_notify_phase_change_http_error`**: Mock `httpx.AsyncClient.post` to return 500. Verify function does not raise. Verify WARNING log.

3. **`test_notify_phase_change_timeout`**: Mock `httpx.AsyncClient.post` to raise `httpx.TimeoutException`. Verify function does not raise. Verify WARNING log.

4. **`test_notify_phase_change_network_error`**: Mock `httpx.AsyncClient.post` to raise `httpx.ConnectError`. Verify function does not raise. Verify WARNING log.

5. **`test_payload_contains_required_fields`**: Capture the payload passed to `httpx.AsyncClient.post`. Assert it contains all 6 required keys with correct values.

6. **`test_timestamp_is_utc_iso_format`**: Verify the timestamp field in the payload is valid ISO 8601 UTC.

**Testing approach**: Use `pytest` with `pytest-asyncio` and `unittest.mock.patch` / `respx` to mock httpx calls.

---

### Task 9: Integration Tests for Webhook Config Endpoints

**File**: `tests/unit/test_webhook_config.py` (new)

**Test cases**:

1. **`test_put_webhook_config`**: POST a workshop, PUT webhook config, verify 200 response with url and enabled.

2. **`test_get_webhook_config`**: PUT config, then GET, verify response matches.

3. **`test_get_webhook_config_not_configured`**: GET webhook on a workshop with no config -- verify url is None, enabled is False.

4. **`test_delete_webhook_config`**: PUT config, DELETE, then GET -- verify cleared.

5. **`test_put_webhook_invalid_url`**: PUT with url that doesn't start with http/https -- verify 400.

6. **`test_put_webhook_nonexistent_workshop`**: PUT to invalid workshop_id -- verify 404.

**Testing approach**: Use FastAPI `TestClient` with an in-memory SQLite database, following the pattern used by existing tests.

---

### Task 10: Integration Tests for Webhook Dispatch on Phase Advance

**File**: `tests/unit/test_webhook_dispatch.py` (new)

**Test cases**:

1. **`test_advance_to_discovery_fires_webhook`**: Configure webhook, advance intake -> discovery, verify `notify_phase_change` was called with correct args (mock the function).

2. **`test_advance_to_rubric_fires_webhook`**: Configure webhook, advance discovery -> rubric, verify webhook call.

3. **`test_advance_to_annotation_fires_webhook`**: Configure webhook, advance rubric -> annotation, verify webhook call.

4. **`test_advance_to_results_fires_webhook`**: Configure webhook, advance annotation -> results, verify webhook call.

5. **`test_advance_to_judge_tuning_fires_webhook`**: Configure webhook, advance annotation -> judge_tuning, verify webhook call.

6. **`test_advance_to_unity_volume_fires_webhook`**: Configure webhook, advance judge_tuning -> unity_volume, verify webhook call.

7. **`test_no_webhook_when_not_configured`**: Advance phase without webhook config, verify `notify_phase_change` not called.

8. **`test_no_webhook_when_disabled`**: Configure webhook with `enabled=False`, advance phase, verify not called.

9. **`test_generic_advance_endpoint_fires_single_webhook`**: Use `advance_workshop_phase` generic endpoint, verify exactly one webhook dispatch (no double-fire).

**Testing approach**: Mock `server.services.webhook_service.notify_phase_change` and inspect call args. Use `BackgroundTasks` test utilities or capture the task list.

---

## File Change Summary

| File | Action | Description |
|------|--------|-------------|
| `migrations/versions/0017_add_webhook_columns.py` | **New** | Alembic migration: add `webhook_url` and `webhook_enabled` to `workshops` |
| `server/database.py` | **Modify** | Add `webhook_url` and `webhook_enabled` columns to `WorkshopDB` |
| `server/models.py` | **Modify** | Add fields to `Workshop` model; add `WebhookConfigUpdate` and `WebhookConfigResponse` |
| `server/services/database_service.py` | **Modify** | Include webhook fields in `Workshop` construction; add `get_webhook_config`, `update_webhook_config`, `delete_webhook_config` methods |
| `server/services/webhook_service.py` | **New** | Async `notify_phase_change` function with httpx |
| `server/routers/workshops.py` | **Modify** | Add 3 config endpoints (PUT/GET/DELETE); wire `BackgroundTasks` + webhook dispatch into all 9 phase-advance call sites |
| `tests/unit/test_webhook_service.py` | **New** | Unit tests for `notify_phase_change` |
| `tests/unit/test_webhook_config.py` | **New** | Integration tests for webhook CRUD endpoints |
| `tests/unit/test_webhook_dispatch.py` | **New** | Integration tests verifying webhooks fire on each phase transition |

---

## Implementation Order

Execute tasks in this order to minimize merge conflicts and keep the codebase buildable at each step:

1. **Task 1** (Migration) -- can be created independently
2. **Task 2** (WorkshopDB columns) -- depends on understanding the migration
3. **Task 3** (Pydantic models) -- independent of DB changes
4. **Task 4** (DatabaseService) -- depends on Tasks 2 and 3
5. **Task 5** (WebhookService) -- fully independent, can be done in parallel with 1-4
6. **Task 6** (Config endpoints) -- depends on Tasks 3 and 4
7. **Task 7** (Wire dispatch) -- depends on Tasks 5 and 6
8. **Tasks 8-10** (Tests) -- depend on Tasks 5-7

Recommended parallel tracks:
- Track A: Tasks 1 -> 2 -> 4
- Track B: Tasks 3, 5 (parallel with Track A)
- Then: Tasks 6 -> 7 -> 8/9/10

---

## Risks and Mitigations

| Risk | Mitigation |
|------|------------|
| Missing a phase-advance call site | Grep for all `update_workshop_phase` calls; the search above found 9 call sites. The test suite (Task 10) covers all 6 named transitions. |
| `begin_annotation_phase` uses threading | Schedule webhook from the main async context, not inside the thread. Capture `previous_phase` before the thread starts. |
| Generic `advance_workshop_phase` double-fires | It delegates to specific functions for known phases, so webhook fires once. The fallback INTAKE path needs its own dispatch. |
| SQLite batch mode migration | Follow `batch_alter_table` pattern from existing migration 0016. |
| BackgroundTasks not executing in tests | Mock `notify_phase_change` directly rather than testing BackgroundTasks execution. |

---

## Success Criteria Traceability

Each success criterion from the draft spec maps to a specific task:

| Criterion | Task |
|-----------|------|
| PUT webhook config | Task 6, Test 9.1 |
| GET webhook config | Task 6, Test 9.2 |
| DELETE webhook config | Task 6, Test 9.4 |
| URL validation | Task 6, Test 9.5 |
| Phase change triggers POST | Task 7, Tests 10.1-10.6 |
| Payload includes all fields | Task 5, Test 8.5 |
| Async delivery | Task 7 (BackgroundTasks) |
| Failure does not roll back | Task 5, Tests 8.2-8.4 |
| Failure logged at WARNING | Task 5, Tests 8.2-8.4 |
| 5-second timeout | Task 5, Test 8.3 |
| No webhook when not configured | Task 7, Test 10.7 |
| No webhook when disabled | Task 7, Test 10.8 |
| All 6 transitions covered | Task 7, Tests 10.1-10.6 |
| Generic endpoint fires exactly once | Task 7, Test 10.9 |
