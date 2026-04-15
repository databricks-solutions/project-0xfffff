# Remove User-Configurable Databricks Host & Use App YAML Resources

**Spec:** [AUTHENTICATION_SPEC](../../specs/AUTHENTICATION_SPEC.md)
**Goal:** Remove all user-configurable `databricks_host` plumbing — the app always uses its own workspace via `DATABRICKS_HOST` env var (set by Databricks Apps platform or developer). MLflow experiment ID comes from app.yaml resource declaration (`MLFLOW_EXPERIMENT_ID`). Also fixes MemAlign embedding model selection and dead `OPENAI_API_KEY` code.
**Architecture:** Eliminate the `databricks_host` field from the DB, API models, and frontend. Replace all `os.environ["DATABRICKS_HOST"] = mlflow_config.databricks_host` patterns with a single `get_databricks_host()` helper that reads `DATABRICKS_HOST` from the environment (or falls back to `WorkspaceClient().config.host`). Similarly, `get_experiment_id()` reads `MLFLOW_EXPERIMENT_ID`. The `mlflow_intake_config` table keeps `experiment_id` for historical tracking but the app reads the env var for the active value. `DatabricksService` no longer accepts a `workspace_url` parameter.

**Success Criteria Targeted:**
- SC-AUTH-SDK-1: All Databricks API calls use SDK-resolved tokens (no user-provided PATs)
- SC-AUTH-SDK-2: MLflow operations use SDK auth without `os.environ["DATABRICKS_TOKEN"]` mutation
- SC-AUTH-SDK-3: No token input fields exist in the frontend UI
- SC-AUTH-HOST-1 (new): No user-configurable `databricks_host` — app always uses its own workspace
- SC-AUTH-HOST-2 (new): `DATABRICKS_HOST` comes from environment, not stored config
- SC-AUTH-HOST-3 (new): `MLFLOW_EXPERIMENT_ID` comes from app.yaml resource declaration
- SC-AUTH-HOST-4 (new): `DatabricksService` does not accept `workspace_url` parameter
- SC-AUTH-MEMALIGN-1 (new): MemAlign embedding model is selectable (defaults to `databricks-gte-large-en`)
- SC-AUTH-MEMALIGN-2 (new): Dead `OPENAI_API_KEY` code path removed from alignment service

**Proposed spec additions (protected operation — needs user approval):**

Add to AUTHENTICATION_SPEC `## Success Criteria > ### Databricks API Auth`:
```
- [ ] No user-configurable `databricks_host` — app always uses its own workspace
- [ ] `DATABRICKS_HOST` comes from environment (Databricks Apps platform or developer), not stored config
- [ ] `MLFLOW_EXPERIMENT_ID` comes from app.yaml resource declaration
- [ ] `DatabricksService` does not accept `workspace_url` parameter — uses env-based host only
- [ ] MemAlign embedding model is selectable with default to `databricks-gte-large-en`
- [ ] No dead `OPENAI_API_KEY` code paths in alignment service
```

---

## File Map

### New Files
| File | Responsibility |
|------|----------------|
| `migrations/versions/0017_remove_databricks_host.py` | Drop `databricks_host` from `mlflow_intake_config`, make `experiment_id` nullable |

### Modified Files — Specs (protected operation — user approved)
| File | Change |
|------|--------|
| `specs/JUDGE_EVALUATION_SPEC.md` | Fix stale MemAlign API example (remove `openai:/gpt-4o-mini`), fix "Guideline Distillation Fails" section (remove dead `OPENAI_API_KEY` advice) |
| `specs/AUTHENTICATION_SPEC.md` | Update MLflow Auth section (host from env not stored config), add embedding endpoint to resources table, add new success criteria |
| `specs/BUILD_AND_DEPLOY_SPEC.md` | Add `MLFLOW_EXPERIMENT_ID` to env vars table, clarify `DATABRICKS_HOST` source |

### Modified Files — Backend Core
| File | Change |
|------|--------|
| `app.yaml` | Add `mlflow-experiment` resource with `value_from` key `MLFLOW_EXPERIMENT_ID` |
| `server/services/databricks_service.py` | Remove `workspace_url` param from `_get_sdk_token`, `resolve_databricks_token`, `DatabricksService.__init__`; add `get_databricks_host()` and `get_experiment_id()` helpers |
| `server/database.py` | Remove `databricks_host` column from `MLflowIntakeConfigDB` |
| `server/postgres_manager.py` | Remove `databricks_host` from `mlflow_intake_config` CREATE TABLE |
| `server/models.py` | Remove `databricks_host` from `MLflowIntakeConfig`, `MLflowIntakeConfigCreate`, `DBSQLExportRequest` |

### Modified Files — Backend Services
| File | Change |
|------|--------|
| `server/services/mlflow_intake_service.py` | Remove `databricks_host` from config; use `get_databricks_host()` |
| `server/services/alignment_service.py` | Remove `os.environ["DATABRICKS_HOST"]` mutations; add `embedding_model` parameter; remove dead `OPENAI_API_KEY` code |
| `server/services/judge_service.py` | Remove `os.environ["DATABRICKS_HOST"]` mutation |
| `server/services/database_service.py` | Remove all `os.environ["DATABRICKS_HOST"]` mutations; remove `databricks_host` from config creation/reads |
| `server/services/dbsql_export_service.py` | Remove `os.environ["DATABRICKS_HOST"]` mutation; use `get_databricks_host()` |

### Modified Files — Backend Routers
| File | Change |
|------|--------|
| `server/routers/workshops.py` | Remove all `resolve_databricks_token(mlflow_config.databricks_host)` → `resolve_databricks_token()`; remove `databricks_host` from form params; add `embedding_model` to `AlignmentRequest` |
| `server/routers/databricks.py` | Remove `workspace_url` from `create_databricks_service()` calls |
| `server/routers/dbsql_export.py` | Remove `databricks_host` from request body |

### Modified Files — Frontend
| File | Change |
|------|--------|
| `client/src/pages/IntakePage.tsx` | Remove `databricks_host` field from config, form, localStorage, validation |
| `client/src/pages/IRRResultsDemo.tsx` | Build MLflow trace URL from env-provided host (via API) instead of `mlflowConfig.databricks_host` |
| `client/src/client/models/MLflowIntakeConfig.ts` | Remove `databricks_host` field |
| `client/src/client/models/MLflowIntakeConfigCreate.ts` | Remove `databricks_host` field |
| `client/src/client/models/DBSQLExportRequest.ts` | Remove `databricks_host` field |
| `client/src/pages/DBSQLExportPage.tsx` | Remove `databricksHost` state and input |

---

## Task 0: Update specs with corrected documentation

**Spec criteria:** All — these are the governing spec updates.
**Files:**
- Modify: `specs/JUDGE_EVALUATION_SPEC.md`
- Modify: `specs/AUTHENTICATION_SPEC.md`
- Modify: `specs/BUILD_AND_DEPLOY_SPEC.md`

- [ ] **Step 1: Fix JUDGE_EVALUATION_SPEC — Alignment API example**

Replace the code example at lines 368-383:

```python
from mlflow.genai.judges.optimizers import MemAlignOptimizer

optimizer = MemAlignOptimizer(
    reflection_lm=alignment_model_uri,  # Same model used for judge evaluation
    retrieval_k=5,  # Examples to retrieve
    embedding_model="databricks:/databricks-gte-large-en",  # Configurable, defaults to GTE Large
)

aligned_judge = judge.align(traces, optimizer)

# Aligned judge has:
# - aligned_judge.instructions (original + distilled guidelines)
# - aligned_judge._semantic_memory (list of guidelines)
# - aligned_judge._episodic_memory (list of examples - not persisted)
```

- [ ] **Step 2: Fix JUDGE_EVALUATION_SPEC — "Guideline Distillation Fails" section**

Replace lines 650-655:

```markdown
### Guideline Distillation Fails

Databricks models may not support the JSON schema format required for guideline distillation. In this case:
1. Alignment still succeeds using episodic memory (example-based learning)
2. Semantic memory (distilled guidelines) will be empty
3. The aligned judge uses original instructions + retrieved examples at evaluation time
```

- [ ] **Step 3: Update AUTHENTICATION_SPEC — MLflow Auth section**

Replace line 63:

```markdown
MLflow operations (`search_traces`, `log_feedback`, `set_experiment`) use whatever auth the Databricks SDK provides. `DATABRICKS_HOST` is set by the platform (Databricks Apps) or the developer (`.env.local`). `MLFLOW_EXPERIMENT_ID` is provided via the app.yaml resource declaration. The backend calls `mlflow.set_tracking_uri('databricks')` — the SDK handles auth automatically. No user-configurable host or token is stored.
```

- [ ] **Step 4: Update AUTHENTICATION_SPEC — Core Resources table**

Update the MLflow Experiment and Model Serving Endpoints rows:

```markdown
| **MLflow Experiment** | `search_traces`, `get_experiment`, `set_experiment`, `log_feedback`, `set_trace_tag`. Declared as app.yaml resource (`MLFLOW_EXPERIMENT_ID`). | Can edit |
| **Model Serving Endpoints** | `chat.completions.create` (judge evaluation, rubric generation, discovery). Includes embedding endpoints (e.g. `databricks-gte-large-en`) used by MemAlign. | Can query |
```

- [ ] **Step 5: Update AUTHENTICATION_SPEC — Add new success criteria**

Add to `## Success Criteria > ### Databricks API Auth`:

```markdown
- [ ] No user-configurable `databricks_host` — app always uses its own workspace
- [ ] `DATABRICKS_HOST` comes from environment (Databricks Apps platform or developer), not stored config
- [ ] `MLFLOW_EXPERIMENT_ID` comes from app.yaml resource declaration
- [ ] `DatabricksService` does not accept `workspace_url` parameter — uses env-based host only
- [ ] MemAlign embedding model is selectable with default to `databricks-gte-large-en`
- [ ] No dead `OPENAI_API_KEY` code paths in alignment service
```

- [ ] **Step 6: Update BUILD_AND_DEPLOY_SPEC — Environment Variables table**

Replace lines 223-225:

```markdown
| `MLFLOW_TRACKING_URI` | MLflow server URL (set to `databricks` on Apps) | (required) |
| `DATABRICKS_HOST` | Databricks workspace URL (set by platform on Apps, developer locally) | (required) |
| `MLFLOW_EXPERIMENT_ID` | MLflow experiment ID (from app.yaml resource declaration) | (required) |
| `DATABRICKS_TOKEN` | Databricks access token (fallback — SDK auth preferred) | (optional) |
```

- [ ] **Step 7: Update AUTHENTICATION_SPEC — Implementation log**

Add entry:

```markdown
| 2026-04-15 | [Remove databricks_host](../.claude/plans/2026-04-15-remove-databricks-host-app-yaml-resources.md) | planned | Remove user-configurable host, use app.yaml resources for MLflow experiment, fix MemAlign embedding model |
```

- [ ] **Step 8: Commit**

```bash
git add specs/
git commit -m "docs(specs): update auth, judge eval, and deploy specs for env-based host and app.yaml resources"
```

---

## Task 1: Add environment helpers and simplify `databricks_service.py`

**Spec criteria:** SC-AUTH-HOST-1, SC-AUTH-HOST-2, SC-AUTH-HOST-4
**Files:**
- Modify: `server/services/databricks_service.py`

- [ ] **Step 1: Add `get_databricks_host()` and `get_experiment_id()` helpers**

Add after `resolve_databricks_token()`:

```python
def get_databricks_host() -> str:
    """Get the Databricks workspace host URL.

    On Databricks Apps, DATABRICKS_HOST is set by the platform.
    Locally, it comes from .env.local or the SDK config.

    Raises:
        RuntimeError: If no host can be resolved.
    """
    host = os.getenv("DATABRICKS_HOST")
    if host:
        return host.rstrip("/")
    try:
        from databricks.sdk import WorkspaceClient
        w = WorkspaceClient()
        if w.config.host:
            return w.config.host.rstrip("/")
    except Exception:
        pass
    raise RuntimeError(
        "DATABRICKS_HOST not set. "
        "On Databricks Apps this is automatic. "
        "Locally, set DATABRICKS_HOST or configure a CLI profile."
    )


def get_experiment_id() -> str:
    """Get the MLflow experiment ID from the environment.

    Set via app.yaml resource declaration (value_from key: MLFLOW_EXPERIMENT_ID).

    Raises:
        RuntimeError: If MLFLOW_EXPERIMENT_ID is not set.
    """
    exp_id = os.getenv("MLFLOW_EXPERIMENT_ID")
    if exp_id:
        return exp_id
    raise RuntimeError(
        "MLFLOW_EXPERIMENT_ID not set. "
        "On Databricks Apps, declare an mlflow_experiment resource in app.yaml. "
        "Locally, set MLFLOW_EXPERIMENT_ID in .env.local."
    )
```

- [ ] **Step 2: Remove `workspace_url` from `_get_sdk_token`**

Replace the current function with:

```python
def _get_sdk_token() -> str | None:
    """Get an OAuth token via the Databricks SDK (unified auth).

    On Databricks Apps the platform injects DATABRICKS_CLIENT_ID /
    DATABRICKS_CLIENT_SECRET which the SDK uses for M2M OAuth.
    Locally, the SDK uses CLI profile auth.
    """
    try:
        from databricks.sdk import WorkspaceClient
        w = WorkspaceClient()
        headers = w.config.authenticate()
        auth_header = headers.get("Authorization", "")
        if auth_header.startswith("Bearer "):
            return auth_header[len("Bearer "):]
    except Exception as exc:
        logger.warning("Databricks SDK auth failed: %s", exc)
    return None
```

- [ ] **Step 3: Simplify `resolve_databricks_token`**

Remove `workspace_url` parameter:

```python
def resolve_databricks_token() -> str:
    """Resolve a Databricks auth token via the SDK.

    On Databricks Apps the platform injects service principal credentials.
    Locally, the SDK picks up CLI profile auth from ``databricks auth login``.

    Falls back to the ``DATABRICKS_TOKEN`` environment variable when the SDK
    is not configured (e.g. CI or minimal local setups).

    Raises:
        RuntimeError: If no valid token can be resolved.
    """
    token = _get_sdk_token()
    if token:
        return token
    token = os.getenv("DATABRICKS_TOKEN")
    if token:
        logger.info("Using DATABRICKS_TOKEN env var (SDK auth unavailable)")
        return token
    raise RuntimeError(
        "Could not resolve Databricks auth token. "
        "On Databricks Apps this is automatic. "
        "Locally, run: databricks auth login --host <workspace-url>"
    )
```

- [ ] **Step 4: Simplify `DatabricksService.__init__`**

Remove `workspace_url`, `token`, `workshop_id`, `db_service` params. Use the helpers:

```python
class DatabricksService:
    """Service for interacting with Databricks model serving endpoints."""

    def __init__(self, init_sdk: bool = True):
        """Initialize the Databricks service.

        Uses environment-based host and SDK-resolved token.
        """
        self.workspace_url = get_databricks_host()
        self.token = resolve_databricks_token()

        if not self.workspace_url or not self.token:
            raise ValueError("Databricks workspace URL and token are required")

        # Initialize the OpenAI client for calling serving endpoints
        try:
            cache_key = (self.workspace_url, _get_token_hash(self.token))
            if cache_key in _client_cache:
                self.client = _client_cache[cache_key]
            else:
                self.client = OpenAI(
                    api_key=self.token,
                    base_url=f"{self.workspace_url}/serving-endpoints",
                )
                _client_cache[cache_key] = self.client
        except Exception as e:
            logger.error(f"Failed to initialize OpenAI client: {e}")
            raise HTTPException(status_code=500, detail=f"Failed to initialize OpenAI client: {e!s}") from e
```

- [ ] **Step 5: Simplify `create_databricks_service`**

```python
def create_databricks_service() -> DatabricksService:
    """Create a Databricks service instance."""
    return DatabricksService()
```

- [ ] **Step 6: Run server tests**

Run: `just test-server`
Expected: Some failures from callers passing removed params — that's expected, fixed in later tasks.

- [ ] **Step 7: Commit**

```bash
git add server/services/databricks_service.py
git commit -m "feat(auth): remove workspace_url param, add get_databricks_host/get_experiment_id helpers"
```

---

## Task 2: Update app.yaml with MLflow experiment resource

**Spec criteria:** SC-AUTH-HOST-3
**Files:**
- Modify: `app.yaml`
- Modify: `.env.local`

- [ ] **Step 1: Add resource declaration to app.yaml**

```yaml
command:
  - "gunicorn"
  - "server.app:app"
  - "-c"
  - "gunicorn_conf.py"
  - "-w"
  - "2"
  - "--worker-class"
  - "uvicorn.workers.UvicornWorker"
  - "--timeout"
  - "1800"
env:
  - name: DATABASE_ENV
    value: postgres
resources:
  - name: mlflow-experiment
    type: mlflow_experiment
    value_from:
      key: MLFLOW_EXPERIMENT_ID
```

- [ ] **Step 2: Add MLFLOW_EXPERIMENT_ID to .env.local for local dev**

Append to `.env.local`:

```
MLFLOW_EXPERIMENT_ID=<placeholder>
```

Note: Developers set their own experiment ID here. On Databricks Apps it's injected by the platform.

- [ ] **Step 3: Commit**

```bash
git add app.yaml .env.local
git commit -m "feat(auth): add mlflow-experiment resource to app.yaml"
```

---

## Task 3: Database migration — remove `databricks_host`

**Spec criteria:** SC-AUTH-HOST-1, SC-AUTH-HOST-2
**Files:**
- Create: `migrations/versions/0017_remove_databricks_host.py`
- Modify: `server/database.py`
- Modify: `server/postgres_manager.py`

- [ ] **Step 1: Create migration**

```python
"""Remove databricks_host from mlflow_intake_config.

The app now uses DATABRICKS_HOST from the environment (set by the Databricks
Apps platform) instead of a user-provided value stored in the database.
"""

from __future__ import annotations

from alembic import op
import sqlalchemy as sa


revision = "0017_remove_databricks_host"
down_revision = "0016_add_span_attribute_filter"
branch_labels = None
depends_on = None


def upgrade() -> None:
    with op.batch_alter_table("mlflow_intake_config") as batch_op:
        batch_op.drop_column("databricks_host")


def downgrade() -> None:
    with op.batch_alter_table("mlflow_intake_config") as batch_op:
        batch_op.add_column(
            sa.Column("databricks_host", sa.String(), nullable=True, server_default="")
        )
```

- [ ] **Step 2: Update `MLflowIntakeConfigDB` in `server/database.py`**

Remove line 379:
```python
    databricks_host = Column(String, nullable=False)
```

- [ ] **Step 3: Update `server/postgres_manager.py`**

Remove `databricks_host VARCHAR NOT NULL,` from the `mlflow_intake_config` CREATE TABLE block (line 189).

- [ ] **Step 4: Commit**

```bash
git add migrations/versions/0017_remove_databricks_host.py server/database.py server/postgres_manager.py
git commit -m "feat(auth): migration 0017 — remove databricks_host from mlflow_intake_config"
```

---

## Task 4: Update API models — remove `databricks_host`

**Spec criteria:** SC-AUTH-HOST-1
**Files:**
- Modify: `server/models.py`

- [ ] **Step 1: Remove `databricks_host` from `MLflowIntakeConfig`**

Remove lines 329-330 (`databricks_host` and `databricks_token` fields). Result:

```python
class MLflowIntakeConfig(BaseModel):
    """Configuration for MLflow trace intake."""
    experiment_id: str = Field(..., description="MLflow experiment ID to pull traces from")
    max_traces: int | None = Field(100, description="Maximum number of traces to pull")
    filter_string: str | None = Field(None, description="Optional filter string for traces")
```

- [ ] **Step 2: Same for `MLflowIntakeConfigCreate`**

Remove `databricks_host` and `databricks_token` from lines 339-340.

- [ ] **Step 3: Remove `databricks_host` from `DBSQLExportRequest`**

Remove `databricks_host` field (lines 479-481) and `databricks_token` field (line 482). The DBSQL export endpoint will use `get_databricks_host()`.

- [ ] **Step 4: Commit**

```bash
git add server/models.py
git commit -m "feat(auth): remove databricks_host from API models"
```

---

## Task 5: Update backend services — remove host mutations

**Spec criteria:** SC-AUTH-HOST-2
**Files:**
- Modify: `server/services/mlflow_intake_service.py`
- Modify: `server/services/judge_service.py`
- Modify: `server/services/alignment_service.py`
- Modify: `server/services/database_service.py`
- Modify: `server/services/dbsql_export_service.py`

The pattern is the same everywhere: replace `os.environ["DATABRICKS_HOST"] = mlflow_config.databricks_host.rstrip("/")` with `os.environ["DATABRICKS_HOST"] = get_databricks_host()` (or remove entirely if `DATABRICKS_HOST` is already set by the platform). Since MLflow reads `DATABRICKS_HOST` from the env, and the env is set once at startup by the platform, these mutations are redundant in production. But we keep one canonical set at MLflow configure time for safety.

- [ ] **Step 1: Update `mlflow_intake_service.py`**

In `configure_mlflow()` (line 55), replace:
```python
os.environ['DATABRICKS_HOST'] = config.databricks_host.rstrip('/')
```
with:
```python
from server.services.databricks_service import get_databricks_host
os.environ['DATABRICKS_HOST'] = get_databricks_host()
```

Remove the `databricks_host` validation (lines 44-48) — it's no longer a user input.

- [ ] **Step 2: Update `judge_service.py`**

Line 286: replace `os.environ["DATABRICKS_HOST"] = mlflow_config.databricks_host.rstrip("/")` with:
```python
from server.services.databricks_service import get_databricks_host
os.environ["DATABRICKS_HOST"] = get_databricks_host()
```

- [ ] **Step 3: Update `alignment_service.py`**

Lines 565, 1136: same replacement. Also remove `mlflow_config.databricks_host` references from the alignment method signatures if they exist.

- [ ] **Step 4: Update `database_service.py`**

Lines 2149, 2485, 2631: same replacement. Also update `create_mlflow_config()` and `get_mlflow_config()` to stop reading/writing `databricks_host`.

- [ ] **Step 5: Update `dbsql_export_service.py`**

Line 45: replace `os.environ["DATABRICKS_HOST"] = databricks_host` with `os.environ["DATABRICKS_HOST"] = get_databricks_host()`. Remove the `databricks_host` parameter from the method signature.

- [ ] **Step 6: Commit**

```bash
git add server/services/
git commit -m "feat(auth): remove databricks_host mutations from all services"
```

---

## Task 6: Update routers — remove host from API calls

**Spec criteria:** SC-AUTH-HOST-1, SC-AUTH-HOST-2, SC-AUTH-HOST-4
**Files:**
- Modify: `server/routers/workshops.py`
- Modify: `server/routers/databricks.py`
- Modify: `server/routers/dbsql_export.py`

- [ ] **Step 1: Update `workshops.py` — replace all `resolve_databricks_token(mlflow_config.databricks_host)` calls**

Every `resolve_databricks_token(mlflow_config.databricks_host)` or `resolve_databricks_token(mlflow_config.databricks_host if mlflow_config else None)` call becomes `resolve_databricks_token()` (no args). Locations: lines 1397, 1722, 2685, 3041, 3126, 3910, 4113, 4311, 5080.

- [ ] **Step 2: Update `workshops.py` — replace `DatabricksService()` calls**

All `DatabricksService(workspace_url=..., token=...)` and `DatabricksService(workshop_id=..., db_service=...)` calls become `DatabricksService()`. Locations: lines 2408, 3048-3049, 3645, 4337.

- [ ] **Step 3: Update `workshops.py` — remove `databricks_host` from form params and search endpoints**

Line 3409: remove `databricks_host: str = Form(None)` param.
Lines 3447-3465: remove the host resolution logic from stored config; use `get_databricks_host()`.
Line 2677: remove `databricks_host` from upload request parsing.

- [ ] **Step 4: Update `workshops.py` — remove `os.environ["DATABRICKS_HOST"]` mutations**

Lines 1772, 3465: remove.

- [ ] **Step 5: Update `databricks.py`**

Replace `create_databricks_service(workspace_url=config.workspace_url, token=config.token or None)` with `create_databricks_service()`.

- [ ] **Step 6: Update `dbsql_export.py`**

Remove `databricks_host` from request body usage; use `get_databricks_host()`.

- [ ] **Step 7: Run server tests**

Run: `just test-server`
Expected: Pass (or known failures from test fixtures still passing host — fix in step 8)

- [ ] **Step 8: Fix any test failures**

Update test fixtures that pass `databricks_host` or `workspace_url` to services.

- [ ] **Step 9: Commit**

```bash
git add server/routers/ tests/
git commit -m "feat(auth): remove databricks_host from routers, use env-based host everywhere"
```

---

## Task 7: Fix MemAlign — embedding model selection, remove dead code

**Spec criteria:** SC-AUTH-MEMALIGN-1, SC-AUTH-MEMALIGN-2
**Files:**
- Modify: `server/services/alignment_service.py`
- Modify: `server/routers/workshops.py` (AlignmentRequest model)

- [ ] **Step 1: Add `embedding_model` to `AlignmentRequest`**

In `server/routers/workshops.py` (line 222):

```python
class AlignmentRequest(BaseModel):
    """Request model for running judge alignment."""
    judge_name: str
    judge_prompt: str
    evaluation_model_name: str
    alignment_model_name: str | None = None
    embedding_model_name: str = "databricks-gte-large-en"  # Embedding model for MemAlign episodic memory
    prompt_id: str | None = None
    judge_type: str | None = None
```

- [ ] **Step 2: Thread `embedding_model_name` through to `run_alignment`**

In `server/routers/workshops.py`, pass `embedding_model_name=request.embedding_model_name` to `alignment_service.run_alignment()`.

In `server/services/alignment_service.py`, add `embedding_model_name: str = "databricks-gte-large-en"` parameter to `run_alignment()`.

- [ ] **Step 3: Clean up MemAlign optimizer creation**

Replace lines 1271-1302 in `alignment_service.py`:

```python
            try:
                from mlflow.genai.judges.optimizers import MemAlignOptimizer

                # Use Databricks model for reflection — guideline distillation
                # may fail if the model doesn't support JSON schema, but episodic
                # memory (example-based learning) will still work.
                reflection_model = optimizer_model_uri
                yield f"Using {alignment_model} for reflection/distillation"

                embedding_uri = f"databricks:/{embedding_model_name}"
                optimizer = MemAlignOptimizer(
                    reflection_lm=reflection_model,
                    retrieval_k=5,
                    embedding_model=embedding_uri,
                )
                yield f"MemAlign optimizer created with reflection_lm={reflection_model}, embedding_model={embedding_uri}"
                yield "Using MemAlign dual memory system (semantic + episodic memory)"
            except ImportError as e:
                error_msg = f"MemAlign optimizer not available: {e}. Ensure mlflow>=3.9 is installed."
                yield f"ERROR: {error_msg}"
                yield {"error": error_msg, "success": False}
                return
```

This removes:
- Dead `OPENAI_API_KEY` check (line 1277)
- Dead OpenAI fallback branch (lines 1285-1288)
- Databricks JSON schema warning (lines 1290-1294) — now just a direct approach
- Hardcoded `databricks-gte-large-en` (line 1299) — now from parameter

- [ ] **Step 4: Remove `os.environ["DATABRICKS_HOST"]` mutation from `run_alignment`**

Lines 565 and 1136: replace with `os.environ["DATABRICKS_HOST"] = get_databricks_host()`.

- [ ] **Step 5: Commit**

```bash
git add server/services/alignment_service.py server/routers/workshops.py
git commit -m "fix(alignment): add embedding model selection, remove dead OPENAI_API_KEY code"
```

---

## Task 8: Update frontend — remove `databricks_host` inputs

**Spec criteria:** SC-AUTH-HOST-1, SC-AUTH-HOST-3
**Files:**
- Modify: `client/src/pages/IntakePage.tsx`
- Modify: `client/src/pages/DBSQLExportPage.tsx`
- Modify: `client/src/pages/IRRResultsDemo.tsx`
- Modify: `client/src/client/models/MLflowIntakeConfig.ts`
- Modify: `client/src/client/models/MLflowIntakeConfigCreate.ts`
- Modify: `client/src/client/models/DBSQLExportRequest.ts`

- [ ] **Step 1: Update `IntakePage.tsx`**

Remove `databricks_host` from:
- `MLflowConfig` interface (line 26)
- `getInitialConfig()` (lines 55, 65)
- `handleConfigChange` persistence to localStorage
- Validation checks (lines 84, 140, 265) — only check `experiment_id` is not needed since it comes from env
- Form data append (line 276) — remove `databricks_host`
- The form input field (lines 422-431) — remove entire `<div>` for Databricks Host

Since experiment_id now comes from the environment, the Intake page simplifies to just `max_traces` and `filter_string` configuration. Remove the experiment_id input too.

- [ ] **Step 2: Update `IRRResultsDemo.tsx`**

Line 802: Replace `mlflowConfig.databricks_host` with a call to a new API endpoint or use `window.location.origin` for Databricks Apps (the host is the same workspace). Actually, the simplest approach: add a `/api/databricks-host` endpoint that returns `get_databricks_host()`, or include `databricks_host` in the workshop status response from the environment.

Alternative (simpler): Since the app runs on the same Databricks workspace, construct the URL as:
```typescript
const baseUrl = window.location.origin.replace(/\.databricksapps\.com.*/, '.cloud.databricks.com');
```

Actually, the cleanest approach: add `databricks_host` to the MLflow status response (read from env, not DB). This way the frontend gets it without storing it.

- [ ] **Step 3: Update TypeScript models**

Remove `databricks_host` from:
- `client/src/client/models/MLflowIntakeConfig.ts`
- `client/src/client/models/MLflowIntakeConfigCreate.ts`
- `client/src/client/models/DBSQLExportRequest.ts`

- [ ] **Step 4: Update `DBSQLExportPage.tsx`**

Remove `databricksHost` state variable and input field.

- [ ] **Step 5: Run frontend lint**

Run: `just ui-lint`
Expected: No errors

- [ ] **Step 6: Commit**

```bash
git add client/
git commit -m "feat(auth): remove databricks_host inputs from frontend"
```

---

## Task 9 (Final): Lint, test, and verify

**Spec criteria:** All
**Files:** None (verification only)

- [ ] **Step 1: Run full server test suite**

Run: `just test-server`
Expected: All tests pass

- [ ] **Step 2: Run frontend tests**

Run: `just ui-test-unit`
Expected: Pass

- [ ] **Step 3: Run frontend lint**

Run: `just ui-lint`
Expected: No errors

- [ ] **Step 4: Verify no remaining `databricks_host` in active code**

```bash
grep -rn "databricks_host" server/ client/src/ --include="*.py" --include="*.ts" --include="*.tsx" | grep -v "node_modules" | grep -v ".pyc" | grep -v "test"
```
Expected: No matches in non-test files (test fixtures may still reference it).

- [ ] **Step 5: Verify no remaining `os.environ.*DATABRICKS_HOST.*=.*mlflow_config`**

```bash
grep -rn 'os.environ.*DATABRICKS_HOST.*mlflow_config' server/ --include="*.py"
```
Expected: No matches.

- [ ] **Step 6: Verify `resolve_databricks_token` has no `workspace_url` param**

```bash
grep -n "resolve_databricks_token(" server/ -r --include="*.py" | grep -v "def resolve"
```
Expected: All calls have no arguments.

- [ ] **Step 7: Update AUTHENTICATION_SPEC implementation log**

Add entry:
```markdown
| 2026-04-15 | [Remove databricks_host](../.claude/plans/2026-04-15-remove-databricks-host-app-yaml-resources.md) | complete | Remove user-configurable host, use app.yaml resources for MLflow experiment, fix MemAlign embedding model |
```

- [ ] **Step 8: Commit any final fixes**

If any issues found, fix and commit.
