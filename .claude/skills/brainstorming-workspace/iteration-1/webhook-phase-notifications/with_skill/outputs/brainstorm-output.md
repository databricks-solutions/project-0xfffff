# Brainstorming: Webhook Notifications on Workshop Phase Change

## Step 1: Find the Governing Spec

Searched `/specs/README.md` keyword index for: "webhook", "notification", "phase change", "event hook".

**Result**: No spec exists for webhooks or external notifications. The keyword "phase" maps to `DISCOVERY_TRACE_ASSIGNMENT_SPEC` and "phase advancement" maps to `ROLE_PERMISSIONS_SPEC`, but neither covers webhook/notification behavior.

Related specs reviewed:
- **ROLE_PERMISSIONS_SPEC** -- defines phase advancement rules (facilitator-only, prerequisites per transition)
- **DISCOVERY_TRACE_ASSIGNMENT_SPEC** -- defines phase/round lifecycle and data model

**Assessment: No Spec Exists** for webhook notifications. This is genuinely new territory. Following the "No Spec Exists" branch of the decision tree.

---

## Step 2: Socratic Exploration

### Q1: What problem does this solve?

> When a workshop facilitator advances the phase (e.g., INTAKE -> DISCOVERY -> RUBRIC -> ANNOTATION -> RESULTS), external systems have no way to know this happened. Teams may want to trigger downstream workflows -- Slack notifications, CI pipelines, data exports, audit logging in external systems -- when the workshop reaches certain milestones.

**Self-answer**: The primary use case is integration with external systems. A facilitator advances a phase; an HTTP POST is sent to a configured URL with event details. This enables:
- Team notifications (Slack/Teams) when annotation begins
- Automated data pipelines triggered on RESULTS phase
- External audit trails

**Assumption**: The core use case is fire-and-forget outbound HTTP notifications, not a full event bus or pub/sub system.

---

### Q2: Who configures the webhooks?

Options:
- (A) Facilitator configures per-workshop via UI
- (B) System admin configures globally via environment variables or config file
- (C) Both -- global defaults with per-workshop overrides

**Self-answer**: (A) Facilitator configures per-workshop. This aligns with the existing permission model where facilitators manage workshop settings (`can_manage_workshop`). A global config adds operational complexity without clear immediate value. YAGNI -- start with per-workshop facilitator config.

---

### Q3: What existing features does this touch?

Integration surface:
- **Phase advancement endpoints** (`server/routers/workshops.py`): Six `advance-to-*` endpoints plus the generic `advance_workshop_phase` dispatcher. All call `db_service.update_workshop_phase()`.
- **DatabaseService.update_workshop_phase()** (`server/services/database_service.py`): Central place where phase changes are committed to DB.
- **Workshop model** (`server/models.py`): `WorkshopPhase` enum defines the phases.
- **Workshop settings**: Would need a new configuration surface for webhook URLs.

The cleanest integration point is either:
1. A hook in `update_workshop_phase()` (service layer), or
2. A middleware/event pattern that fires after any successful phase advance endpoint returns.

**Assumption**: Option 1 (service layer) is better -- it's the single chokepoint for all phase changes.

---

### Q4: What does success look like?

Testable criteria extracted:
- Facilitator can configure a webhook URL for a workshop
- When a phase advances successfully, an HTTP POST is sent to the configured URL
- The payload includes workshop_id, previous_phase, new_phase, and timestamp
- Webhook delivery is async (does not block the phase advancement response)
- Failed webhook delivery does not roll back the phase change
- Webhook delivery failures are logged
- Webhook can be enabled/disabled without deleting the URL
- No webhook is sent if none is configured (no errors, no side effects)

---

### Q5: What is explicitly out of scope?

- **Retry logic with exponential backoff**: YAGNI for v1. Log failures, move on.
- **Webhook signature verification (HMAC)**: Nice-to-have but not v1.
- **Event types beyond phase change**: No annotation-complete, no finding-created, etc.
- **Webhook management UI**: v1 can be API-only; UI can follow.
- **Multiple webhook URLs per workshop**: Single URL per workshop for v1.
- **Inbound webhooks / event subscriptions**: Only outbound notifications.
- **Global/system-level webhooks**: Per-workshop only.

---

## Step 3: Proposed Approaches

### Approach A: Service-Layer Hook in DatabaseService

**How it works**: Add a `webhook_url` field to the Workshop model. After `update_workshop_phase()` commits the DB change, it dispatches an async HTTP POST to the configured URL (if any).

**Pros**:
- Single integration point -- all phase changes go through `update_workshop_phase()`
- Simple to implement and test
- Minimal change surface

**Cons**:
- Mixes webhook dispatch with database service concerns
- If we add more event types later, DatabaseService becomes bloated

**Trade-off**: Clean for the current scope; may need refactoring if event types grow.

### Approach B: Event Emitter Pattern

**How it works**: Introduce a lightweight event system. `update_workshop_phase()` emits a `phase_changed` event. A separate `WebhookService` subscribes to that event and handles HTTP dispatch.

**Pros**:
- Clean separation of concerns
- Easy to add more event types later
- WebhookService is independently testable

**Cons**:
- More abstraction for a single event type (YAGNI concern)
- Adds a new architectural pattern to the codebase

**Trade-off**: Better architecture but arguably over-engineered for one event type.

### Approach C: Endpoint-Level Decorator/Middleware

**How it works**: A FastAPI dependency or decorator on each `advance-to-*` endpoint fires the webhook after a successful response.

**Pros**:
- No changes to service layer
- Explicit about which endpoints trigger webhooks

**Cons**:
- Must be applied to every advance endpoint (6+ endpoints) -- easy to miss one
- The generic `advance_workshop_phase` dispatcher calls the individual endpoints, so webhooks could fire twice if not careful
- Duplicates the "after phase change" logic across endpoints

**Trade-off**: Most fragile option. Not recommended.

---

## Step 4: Recommended Design

**Recommended: Approach A (Service-Layer Hook)** with the webhook dispatch extracted into a small utility module for testability.

Rationale: This codebase has a clear service-layer pattern (`DatabaseService`). The phase change already has a single chokepoint. Adding an event emitter for one event type is over-engineering. If/when more event types are needed, it is straightforward to refactor from "call webhook_service" to "emit event" -- but that is future work.

---

## Step 5: Design Presentation

### 5.1 Data Model

Add webhook configuration to the workshop:

```python
# In server/models.py - extend Workshop model
class WebhookConfig(BaseModel):
    url: str                    # Target URL for POST requests
    enabled: bool = True        # Toggle without deleting URL
    secret: Optional[str] = None  # Reserved for future HMAC signing

# In server/database.py - extend WorkshopDB
class WorkshopDB(Base):
    # ... existing fields ...
    webhook_url: Optional[str] = Column(String, nullable=True)
    webhook_enabled: bool = Column(Boolean, default=False)
```

Single URL per workshop. Stored on the workshop row itself -- no new tables needed.

> [Note: Would normally ask "Does this data model look right?" -- continuing with assumption that it does.]

### 5.2 Webhook Dispatch Service

New file: `server/services/webhook_service.py`

```python
# Responsibilities:
# 1. Build the webhook payload
# 2. Send async HTTP POST
# 3. Log success/failure

class WebhookService:
    async def notify_phase_change(
        self,
        workshop_id: str,
        webhook_url: str,
        previous_phase: WorkshopPhase,
        new_phase: WorkshopPhase,
    ) -> None:
        """Fire-and-forget POST to webhook URL. Never raises."""
        payload = {
            "event": "phase_changed",
            "workshop_id": workshop_id,
            "previous_phase": previous_phase,
            "new_phase": new_phase,
            "timestamp": datetime.utcnow().isoformat(),
        }
        # Use httpx.AsyncClient for async HTTP
        # Log result, never propagate exceptions
```

Key behaviors:
- Uses `httpx.AsyncClient` (already a common FastAPI companion; if not in deps, add it)
- 5-second timeout on the outbound request
- Catches all exceptions -- logs them, never raises
- Returns None always (fire-and-forget)

### 5.3 Integration Point

In `DatabaseService.update_workshop_phase()`:

```python
def update_workshop_phase(self, workshop_id, new_phase):
    # ... existing logic: update DB, commit ...

    # After successful commit, check for webhook
    if db_workshop.webhook_url and db_workshop.webhook_enabled:
        # Schedule async webhook delivery
        # (Details depend on whether this method is sync or async)
```

Since `update_workshop_phase` is currently synchronous and the router endpoints are async, the cleanest approach is to have the **router endpoints** call the webhook service after `update_workshop_phase` returns successfully:

```python
# In each advance-to-* endpoint, after successful phase update:
workshop = db_service.update_workshop_phase(workshop_id, WorkshopPhase.DISCOVERY)
if workshop and db_workshop_record.webhook_url and db_workshop_record.webhook_enabled:
    background_tasks.add_task(
        webhook_service.notify_phase_change,
        workshop_id, webhook_url, old_phase, new_phase
    )
```

Using FastAPI's `BackgroundTasks` keeps it simple -- the webhook fires after the response is sent, doesn't block the user, and doesn't require an external task queue.

> [Note: Would normally ask "Does the BackgroundTasks approach work for you, or do you need guaranteed delivery?" -- continuing with assumption that BackgroundTasks is sufficient.]

### 5.4 API Endpoints for Webhook Configuration

```
PUT  /workshops/{workshop_id}/webhook
  Body: { "url": "https://...", "enabled": true }
  Auth: facilitator only (can_manage_workshop)
  Returns: { "url": "...", "enabled": true }

GET  /workshops/{workshop_id}/webhook
  Auth: facilitator only
  Returns: { "url": "...", "enabled": true } or { "url": null, "enabled": false }

DELETE /workshops/{workshop_id}/webhook
  Auth: facilitator only
  Clears webhook_url, sets enabled=false
```

### 5.5 Webhook Payload Schema

```json
{
  "event": "phase_changed",
  "workshop_id": "uuid-string",
  "previous_phase": "discovery",
  "new_phase": "rubric",
  "timestamp": "2026-03-11T14:30:00Z",
  "workshop_name": "My Evaluation Workshop"
}
```

### 5.6 Error Handling

| Scenario | Behavior |
|----------|----------|
| Webhook URL not configured | No-op, no error |
| Webhook disabled | No-op, no error |
| HTTP timeout (>5s) | Log warning, phase change still succeeds |
| HTTP 4xx/5xx response | Log warning with status code, phase change still succeeds |
| Network error / DNS failure | Log warning, phase change still succeeds |
| Invalid URL format | Reject at configuration time (PUT endpoint validates URL) |

### 5.7 Testing Approach

- **Unit tests** (pytest): Mock `httpx.AsyncClient`, verify payload construction, verify fire-and-forget behavior, verify no exception propagation
- **Integration tests** (pytest): Use `httpx` mock or `respx` to verify full endpoint flow -- advance phase, check webhook was called with correct payload
- **Edge case tests**: No webhook configured, webhook disabled, HTTP failure, timeout
- **No E2E/Playwright tests needed**: This is backend-only for v1 (no UI)

### 5.8 Database Migration

One Alembic migration to add two columns to the `workshops` table:
- `webhook_url: String, nullable=True`
- `webhook_enabled: Boolean, default=False`

---

## Step 6: Draft Spec

Since no spec exists, here is the draft spec that would be proposed for user approval.

> [Note: Would normally STOP here and present for approval. Continuing with the assumption of approval.]

### WEBHOOK_NOTIFICATIONS_SPEC (Draft)

```markdown
# WEBHOOK_NOTIFICATIONS_SPEC

## Overview

Webhook notifications allow external systems to receive HTTP POST callbacks when
significant events occur in a workshop. The initial scope covers phase change
events only.

## Core Concepts

### Webhook
An outbound HTTP POST sent to a facilitator-configured URL when a workshop event
occurs. Webhooks are fire-and-forget: delivery failures do not affect workshop
operations.

### Event
A discrete occurrence in the workshop lifecycle that triggers a webhook. v1
supports a single event type: `phase_changed`.

## Behavior

### Configuration
- Each workshop has at most one webhook URL
- Only facilitators can configure webhooks (requires `can_manage_workshop`)
- Webhooks can be enabled/disabled independently of URL configuration
- URL is validated on save (must be a valid HTTP/HTTPS URL)

### Delivery
- Webhook fires after a successful phase transition (DB committed)
- Delivery is asynchronous (does not block the phase advance response)
- Delivery timeout: 5 seconds
- No automatic retries on failure
- All delivery failures are logged (level: WARNING)
- Phase changes are never rolled back due to webhook failures

### Payload
All webhooks send a JSON POST body:
```json
{
  "event": "phase_changed",
  "workshop_id": "string",
  "previous_phase": "string",
  "new_phase": "string",
  "timestamp": "ISO 8601 string",
  "workshop_name": "string"
}
```

Content-Type: application/json

## Data Model

### Workshop Extensions
- `webhook_url: Optional[str]` -- target URL for POST requests
- `webhook_enabled: bool` (default: false) -- toggle delivery

No new tables. Two new columns on the existing `workshops` table.

## Implementation

### Key Files (New)
| File | Responsibility |
|------|----------------|
| `server/services/webhook_service.py` | Payload construction, async HTTP dispatch, error handling |

### Key Files (Modified)
| File | Change |
|------|--------|
| `server/models.py` | Add webhook fields to Workshop model |
| `server/database.py` | Add webhook columns to WorkshopDB |
| `server/routers/workshops.py` | Add webhook config endpoints; add BackgroundTasks webhook dispatch to advance endpoints |
| `alembic/versions/xxx_add_webhook_columns.py` | Migration for new columns |

### Dependencies
- `httpx` -- async HTTP client for outbound webhook requests

## Success Criteria

### Configuration
- [ ] Facilitator can set a webhook URL for a workshop via PUT endpoint
- [ ] Facilitator can retrieve current webhook config via GET endpoint
- [ ] Facilitator can delete webhook config via DELETE endpoint
- [ ] Webhook URL is validated (must be valid HTTP/HTTPS URL)
- [ ] Non-facilitator roles receive 403 when configuring webhooks
- [ ] Webhook can be enabled/disabled without removing the URL

### Delivery
- [ ] Phase change triggers HTTP POST to configured webhook URL
- [ ] Webhook payload includes event type, workshop_id, previous_phase, new_phase, timestamp, workshop_name
- [ ] Webhook delivery is asynchronous (phase advance response not delayed)
- [ ] Failed webhook delivery does not roll back phase change
- [ ] Webhook delivery failure is logged at WARNING level
- [ ] Webhook request times out after 5 seconds
- [ ] No webhook sent when URL is not configured
- [ ] No webhook sent when webhook is disabled

### Edge Cases
- [ ] All six phase transitions trigger webhooks (intake->discovery, discovery->rubric, rubric->annotation, annotation->results, annotation->judge_tuning, judge_tuning->unity_volume)
- [ ] Generic advance_workshop_phase endpoint triggers exactly one webhook (not duplicated)
- [ ] Concurrent phase advances do not cause duplicate webhooks

## Future Work

- Webhook delivery retries with exponential backoff
- HMAC signature verification (webhook secret)
- Additional event types (annotation_completed, finding_created, etc.)
- Multiple webhook URLs per workshop
- Webhook delivery history/audit log in the database
- Webhook configuration UI in the frontend
- Global/system-level webhook configuration
```

---

## Step 7: Draft Spec Index Updates

### Quick Reference Table Addition

| Spec | Domain | Key Concepts |
|------|--------|--------------|
| [WEBHOOK_NOTIFICATIONS_SPEC](./WEBHOOK_NOTIFICATIONS_SPEC.md) | Webhooks & Events | webhook, phase change notification, outbound HTTP callback |

### Keyword Search Index Additions

```markdown
### Webhooks & Notifications
- **webhook** -> [WEBHOOK_NOTIFICATIONS_SPEC](./WEBHOOK_NOTIFICATIONS_SPEC.md)
- **notification** -> [WEBHOOK_NOTIFICATIONS_SPEC](./WEBHOOK_NOTIFICATIONS_SPEC.md)
- **phase change notification** -> [WEBHOOK_NOTIFICATIONS_SPEC](./WEBHOOK_NOTIFICATIONS_SPEC.md)
- **callback** -> [WEBHOOK_NOTIFICATIONS_SPEC](./WEBHOOK_NOTIFICATIONS_SPEC.md)
- **outbound HTTP** -> [WEBHOOK_NOTIFICATIONS_SPEC](./WEBHOOK_NOTIFICATIONS_SPEC.md)
- **event** -> [WEBHOOK_NOTIFICATIONS_SPEC](./WEBHOOK_NOTIFICATIONS_SPEC.md)
- **WebhookService** -> [WEBHOOK_NOTIFICATIONS_SPEC](./WEBHOOK_NOTIFICATIONS_SPEC.md)
- **fire-and-forget** -> [WEBHOOK_NOTIFICATIONS_SPEC](./WEBHOOK_NOTIFICATIONS_SPEC.md)
- **webhook_url** -> [WEBHOOK_NOTIFICATIONS_SPEC](./WEBHOOK_NOTIFICATIONS_SPEC.md)
- **webhook_enabled** -> [WEBHOOK_NOTIFICATIONS_SPEC](./WEBHOOK_NOTIFICATIONS_SPEC.md)
```

---

## Step 8: Approval Gate

> [Note: Would normally STOP here and present the draft spec + keyword additions for user approval before proceeding. Since this is a test run, noting that approval is assumed and continuing.]

**Awaiting approval on:**
1. Draft WEBHOOK_NOTIFICATIONS_SPEC (above)
2. Spec index keyword additions (above)

**Assumed: Approved.** Next step would be to invoke the `writing-plans` skill to create an implementation plan.

---

## Step 9: Terminal State

The brainstorming phase is complete. The next step in the pipeline is:

**brainstorming -> writing-plans -> implementation**

The `writing-plans` skill should be invoked with the approved spec and design above to produce a concrete implementation plan with task breakdown, file-by-file changes, and test plan.

> [Note: NOT invoking writing-plans since this is a test run that should only produce brainstorming output.]
