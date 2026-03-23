# Webhook Notifications for Workshop Phase Changes

## Overview

Add a webhook notification system that fires HTTP callbacks when a workshop transitions between phases (intake, discovery, rubric, annotation, results, judge_tuning, unity_volume). This enables external systems (Slack bots, CI/CD pipelines, monitoring dashboards, Databricks workflows) to react to workshop lifecycle events.

## Clarifying Questions (Self-Answered)

**Q: Should webhooks be per-workshop or global?**
A: Per-workshop. Each workshop may have different integration needs. A facilitator configures webhooks for their workshop.

**Q: What authentication should webhook requests use?**
A: Support an optional shared secret (HMAC-SHA256 signature in a header), similar to GitHub/Slack webhook patterns. This is simple and well-understood.

**Q: Should we support retry logic for failed deliveries?**
A: Yes, with a simple retry policy (3 attempts, exponential backoff). Delivery is best-effort -- we log failures but don't block the phase transition.

**Q: Should webhook delivery be synchronous or asynchronous?**
A: Asynchronous. Phase transitions must not be blocked by slow or failing webhook endpoints. Use `asyncio.create_task` or a background task queue.

**Q: What events beyond phase changes should be supported?**
A: Start with phase changes only. The model can be extended later (e.g., annotation_complete, irr_calculated). Use an event_type field to future-proof.

## Current Phase Transition Points

All phase transitions funnel through `DatabaseService.update_workshop_phase()` in `/server/services/database_service.py` (line 324). The router endpoints that trigger transitions are in `/server/routers/workshops.py`:

| Endpoint | Transition |
|----------|-----------|
| `POST /{id}/begin-discovery` | intake -> discovery |
| `POST /{id}/advance-to-discovery` | intake -> discovery (alt) |
| `POST /{id}/advance-to-rubric` | discovery -> rubric |
| `POST /{id}/advance-to-annotation` | rubric -> annotation |
| `POST /{id}/begin-annotation` | rubric -> annotation (alt) |
| `POST /{id}/advance-to-results` | annotation -> results |
| `POST /{id}/advance-to-judge-tuning` | results -> judge_tuning |
| `POST /{id}/advance-to-unity-volume` | judge_tuning -> unity_volume |
| `PUT /{id}/phase` | Direct phase set (generic) |
| `DELETE /{id}/traces` | Reset to intake |
| `POST /{id}/reset-discovery` | Reset discovery |
| `POST /{id}/reset-annotation` | Reset annotation |

## Design

### 1. Data Model

New Pydantic models in `/server/models.py`:

```python
class WebhookCreate(BaseModel):
    url: str  # Target URL
    secret: str | None = None  # Shared secret for HMAC signing
    events: list[str] = ["phase_changed"]  # Event types to subscribe to
    is_active: bool = True

class Webhook(BaseModel):
    id: str
    workshop_id: str
    url: str
    secret_configured: bool = False  # Never expose the actual secret
    events: list[str] = ["phase_changed"]
    is_active: bool = True
    created_at: datetime
    last_triggered_at: datetime | None = None
    last_status_code: int | None = None

class WebhookDelivery(BaseModel):
    id: str
    webhook_id: str
    event_type: str
    payload: dict[str, Any]
    status_code: int | None = None
    success: bool
    attempt: int
    error_message: str | None = None
    delivered_at: datetime
```

New SQLAlchemy model in `/server/database.py`:

```python
class WebhookDB(Base):
    __tablename__ = "webhooks"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    workshop_id = Column(String, ForeignKey("workshops.id"), nullable=False)
    url = Column(String, nullable=False)
    secret_hash = Column(String, nullable=True)  # Store hashed, not plaintext
    events = Column(JSON, default=["phase_changed"])
    is_active = Column(Boolean, default=True)
    created_at = Column(DateTime, default=func.now())
    last_triggered_at = Column(DateTime, nullable=True)
    last_status_code = Column(Integer, nullable=True)

class WebhookDeliveryDB(Base):
    __tablename__ = "webhook_deliveries"

    id = Column(String, primary_key=True, default=lambda: str(uuid.uuid4()))
    webhook_id = Column(String, ForeignKey("webhooks.id"), nullable=False)
    event_type = Column(String, nullable=False)
    payload = Column(JSON, nullable=False)
    status_code = Column(Integer, nullable=True)
    success = Column(Boolean, default=False)
    attempt = Column(Integer, default=1)
    error_message = Column(Text, nullable=True)
    delivered_at = Column(DateTime, default=func.now())
```

### 2. Webhook Payload Format

```json
{
  "event_type": "phase_changed",
  "timestamp": "2026-03-11T14:30:00Z",
  "workshop": {
    "id": "ws-123",
    "name": "Q1 Eval Workshop"
  },
  "data": {
    "previous_phase": "discovery",
    "new_phase": "rubric",
    "triggered_by": "facilitator@example.com"
  }
}
```

Headers sent with each request:
- `Content-Type: application/json`
- `X-Workshop-Event: phase_changed`
- `X-Workshop-Signature: sha256=<hmac_hex>` (if secret configured)
- `X-Workshop-Delivery: <delivery_id>`

### 3. New Service: `/server/services/webhook_service.py`

```python
class WebhookService:
    """Manages webhook registration and async delivery."""

    async def fire_phase_changed(
        self,
        workshop_id: str,
        previous_phase: str,
        new_phase: str,
        triggered_by: str | None = None,
    ) -> None:
        """Fire phase_changed event to all active webhooks for this workshop."""

    async def _deliver(self, webhook: WebhookDB, payload: dict) -> bool:
        """Deliver payload to a single webhook URL with retries."""

    def _sign_payload(self, payload_bytes: bytes, secret: str) -> str:
        """Compute HMAC-SHA256 signature."""
```

Key implementation details:
- Use `httpx.AsyncClient` for non-blocking HTTP delivery
- 3 retry attempts with exponential backoff (1s, 2s, 4s)
- 10-second timeout per delivery attempt
- Log all deliveries to `webhook_deliveries` table for debugging
- Fire-and-forget via `asyncio.create_task` so phase transitions are never blocked

### 4. Integration Point

The cleanest integration point is `DatabaseService.update_workshop_phase()`. After the DB commit succeeds, emit the webhook event. Since `DatabaseService` is synchronous and webhooks are async, the best approach is to hook into the router layer instead.

**Recommended approach**: Create a thin wrapper/helper called at each phase transition endpoint:

```python
# In workshops.py, after each successful phase update:
background_tasks.add_task(
    webhook_service.fire_phase_changed,
    workshop_id=workshop_id,
    previous_phase=old_phase,
    new_phase=new_phase,
    triggered_by=current_user_email,
)
```

Use FastAPI's `BackgroundTasks` dependency -- it runs after the response is sent, so the facilitator sees immediate feedback.

### 5. API Endpoints

New router: `/server/routers/webhooks.py` (mounted under `/api/workshops/{workshop_id}/webhooks`)

| Method | Path | Description |
|--------|------|-------------|
| POST | `/` | Register a new webhook |
| GET | `/` | List webhooks for workshop |
| GET | `/{webhook_id}` | Get webhook details |
| PUT | `/{webhook_id}` | Update webhook (URL, events, active) |
| DELETE | `/{webhook_id}` | Remove webhook |
| POST | `/{webhook_id}/test` | Send a test ping event |
| GET | `/{webhook_id}/deliveries` | View recent delivery history |

### 6. Frontend (Optional / Phase 2)

Add a "Webhooks" section in the Facilitator Dashboard settings panel:
- Simple form: URL, optional secret, event checkboxes
- Table showing registered webhooks with last delivery status
- "Test" button to send a ping

This is lower priority than the backend -- webhooks are often configured via API/CLI.

### 7. Security Considerations

- **Secret storage**: Hash the secret (or encrypt with `server/utils/encryption.py` which already exists). Never return it in API responses.
- **URL validation**: Reject private/internal IPs (127.0.0.1, 10.x, 169.254.x) to prevent SSRF.
- **Rate limiting**: Cap webhooks per workshop (e.g., 5) to prevent abuse.
- **Payload size**: Keep payloads small -- don't embed full trace data.
- **Permissions**: Only facilitators (role check via `can_manage_workshop`) can CRUD webhooks.

### 8. Files to Create/Modify

| File | Action | Description |
|------|--------|-------------|
| `server/models.py` | Modify | Add Webhook* Pydantic models |
| `server/database.py` | Modify | Add WebhookDB, WebhookDeliveryDB tables |
| `server/services/webhook_service.py` | Create | Async delivery + HMAC signing logic |
| `server/routers/webhooks.py` | Create | CRUD + test endpoints |
| `server/routers/__init__.py` | Modify | Register webhook router |
| `server/routers/workshops.py` | Modify | Add background webhook calls after phase transitions |
| `tests/test_webhook_service.py` | Create | Unit tests for delivery, signing, retries |
| `tests/test_webhook_api.py` | Create | API integration tests |

### 9. Migration

A new Alembic migration (or SQLAlchemy `create_all` auto-detection) adds the `webhooks` and `webhook_deliveries` tables. Since the project uses `Base.metadata.create_all(bind=engine, checkfirst=True)` as a safety net in `app.py`, new tables will be created automatically on startup even without an explicit migration.

### 10. Estimated Effort

| Component | Estimate |
|-----------|----------|
| Data models + DB tables | 1 hour |
| Webhook service (delivery, signing, retries) | 3 hours |
| API endpoints (CRUD + test) | 2 hours |
| Integration into phase transition endpoints | 1 hour |
| Tests | 2 hours |
| Frontend UI (Phase 2) | 3 hours |
| **Total (backend only)** | **~9 hours** |

### 11. Open Questions for Future Consideration

- **Event expansion**: Should we also fire on `annotation_submitted`, `irr_calculated`, `workshop_completed`?
- **Bulk operations**: If a workshop is reset (e.g., reset-discovery), should that fire a `phase_reset` event distinct from `phase_changed`?
- **Delivery queue**: For production at scale, consider replacing `asyncio.create_task` with a proper task queue (Celery, ARQ). For the current single-workshop-at-a-time usage pattern, async tasks are sufficient.
- **Databricks Jobs integration**: A natural extension would be a built-in "trigger Databricks Job" action type, beyond generic webhooks.
