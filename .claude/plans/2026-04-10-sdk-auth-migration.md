# SDK Auth Migration — Remove PAT Token Plumbing

**Spec:** [AUTHENTICATION_SPEC](../../specs/AUTHENTICATION_SPEC.md) (§ Future State: Native Databricks Auth)
**Goal:** Replace all user-provided PAT token auth with Databricks SDK unified auth
**Architecture:** Centralize token resolution into a single `resolve_databricks_token()` function that uses the Databricks SDK (`WorkspaceClient().config.authenticate()`). The SDK auto-detects service principal credentials on Databricks Apps and CLI profiles locally. Remove all token storage (in-memory + DB), token fields from API models, and token inputs from the frontend.

**Success Criteria Targeted:**
- SC-AUTH-SDK-1: All Databricks API calls use SDK-resolved tokens (no user-provided PATs)
- SC-AUTH-SDK-2: MLflow operations use SDK auth (no `os.environ['DATABRICKS_TOKEN']` mutation)
- SC-AUTH-SDK-3: No token input fields in the frontend UI
- SC-AUTH-SDK-4: No token persistence (in-memory `TokenStorageService` or `databricks_tokens` DB table)
- SC-AUTH-SDK-5: Local development works via `databricks auth login` CLI profile
- SC-AUTH-SDK-6: Databricks Apps deployment works via platform-injected service principal
- SC-AUTH-SDK-7: All existing server tests continue to pass

**Note:** SC-AUTH-SDK-1 through SC-AUTH-SDK-7 are proposed criteria for the AUTHENTICATION_SPEC "Future State" section. They are not yet added to the spec (protected operation — requires user approval).

---

## File Map

### Deleted Files
| File | Reason |
|------|--------|
| `server/services/token_storage_service.py` | In-memory PAT token storage — no longer needed |
| `tests/unit/services/test_token_storage_service.py` | Tests for deleted service |

### Modified Files — Backend Services
| File | Change |
|------|--------|
| `server/services/databricks_service.py` | Add `resolve_databricks_token()`, simplify `DatabricksService.__init__` to SDK-only |
| `server/services/mlflow_intake_service.py` | Remove env var mutation, use SDK auth |
| `server/services/discovery_service.py` | Replace 7 `token_storage` references with `resolve_databricks_token()` |
| `server/services/judge_service.py` | Replace `token_storage` reference with `resolve_databricks_token()` |
| `server/services/draft_rubric_grouping_service.py` | Replace `token_storage` reference with `resolve_databricks_token()` |
| `server/services/database_service.py` | Remove `set_databricks_token()`, `get_databricks_token()`, `token_storage` import |

### Modified Files — Backend Models & DB
| File | Change |
|------|--------|
| `server/models.py` | Make `databricks_token` optional (default `""`) on `MLflowIntakeConfig`, `MLflowIntakeConfigCreate`, `DBSQLExportRequest`; remove `token` from `DatabricksConfig` |
| `server/database.py` | Remove `DatabricksTokenDB` model, remove relationship from `WorkshopDB` |
| `server/postgres_manager.py` | Remove `databricks_tokens` from table list and CREATE TABLE statement |

### Modified Files — Backend Routers
| File | Change |
|------|--------|
| `server/routers/workshops.py` | Remove 10 token-fetch-and-patch patterns, remove token storage calls |
| `server/routers/databricks.py` | Remove token from `DatabricksConfig` usage, use SDK auth |
| `server/routers/dbsql_export.py` | Use SDK token instead of request body token |

### Modified Files — Frontend
| File | Change |
|------|--------|
| `client/src/pages/IntakePage.tsx` | Remove `databricks_token` input field and state |
| `client/src/pages/DBSQLExportPage.tsx` | Remove `databricksToken` input field and state |
| `client/src/client/models/MLflowIntakeConfig.ts` | Make `databricks_token` optional |
| `client/src/client/models/MLflowIntakeConfigCreate.ts` | Make `databricks_token` optional |
| `client/src/client/models/DBSQLExportRequest.ts` | Make `databricks_token` optional |
| `client/src/client/models/Body_upload_csv_and_log_to_mlflow_workshops__workshop_id__csv_upload_to_mlflow_post.ts` | Already optional — no change needed |

---

## Task 1: Create centralized `resolve_databricks_token()`

**Spec criteria:** SC-AUTH-SDK-1, SC-AUTH-SDK-5, SC-AUTH-SDK-6
**Files:**
- Modify: `server/services/databricks_service.py`

This is the foundation. The existing `_get_sdk_token()` function does the right thing — we promote it to a public API and make it raise on failure instead of returning `None`.

- [ ] **Step 1: Add `resolve_databricks_token()` function**

Add after the existing `_get_sdk_token()` function (around line 54):

```python
def resolve_databricks_token(workspace_url: str | None = None) -> str:
    """Resolve a Databricks auth token via the SDK.

    On Databricks Apps the platform injects service principal credentials.
    Locally, the SDK picks up CLI profile auth from ``databricks auth login``.

    Raises:
        RuntimeError: If no valid token can be resolved.
    """
    token = _get_sdk_token(workspace_url)
    if token:
        return token
    raise RuntimeError(
        "Could not resolve Databricks auth token. "
        "On Databricks Apps this is automatic. "
        "Locally, run: databricks auth login --host <workspace-url>"
    )
```

- [ ] **Step 2: Simplify `DatabricksService.__init__` token resolution**

Replace lines 89-107 (the 4-level fallback chain) with:

```python
        # Resolve token via SDK (service principal on Apps, CLI profile locally)
        self.token = _get_sdk_token(self.workspace_url)
        if not self.token and token:
            self.token = token  # Allow explicit token for backward compat during transition
        if not self.token:
            self.token = os.getenv("DATABRICKS_TOKEN")
```

Note: We keep the explicit `token` param and env var as fallbacks during transition. These can be removed in a follow-up once everything is verified working.

- [ ] **Step 3: Remove `token_storage` import from `DatabricksService.__init__`**

Remove the `from server.services.token_storage_service import token_storage` block (lines 99-104) and the `workshop_id`/`db_service` token lookup logic.

- [ ] **Step 4: Run server tests**

Run: `just test-server`
Expected: 753 passed (same as baseline)

- [ ] **Step 5: Commit**

```bash
git add server/services/databricks_service.py
git commit -m "feat(auth): add resolve_databricks_token() and simplify DatabricksService init"
```

---

## Task 2: Simplify MLflow intake auth

**Spec criteria:** SC-AUTH-SDK-2
**Files:**
- Modify: `server/services/mlflow_intake_service.py`

- [ ] **Step 1: Replace `configure_mlflow()` env var mutation**

Replace the current `configure_mlflow` method (lines 36-59) with:

```python
  def configure_mlflow(self, config: MLflowIntakeConfig) -> None:
    """Configure MLflow with Databricks credentials."""
    try:
      if not config.databricks_host:
        raise ValueError('Databricks host is required')
      if not config.databricks_host.startswith('https://'):
        raise ValueError('Databricks host must start with https://')

      mlflow.set_tracking_uri('databricks')

      # Set host for SDK to use; clear profile vars that would override SDK auth
      import os
      os.environ['DATABRICKS_HOST'] = config.databricks_host.rstrip('/')
      os.environ.pop('DATABRICKS_CONFIG_PROFILE', None)
      os.environ.pop('DATABRICKS_AUTH_TYPE', None)
      # Don't set DATABRICKS_TOKEN — let the SDK handle auth
      # (service principal on Apps, CLI profile locally)

    except Exception as e:
      raise ValueError(f'Failed to configure MLflow: {str(e)}')
```

Key change: Remove `os.environ['DATABRICKS_TOKEN'] = config.databricks_token`. The SDK will provide auth.

- [ ] **Step 2: Run server tests**

Run: `just test-server`
Expected: All tests pass

- [ ] **Step 3: Commit**

```bash
git add server/services/mlflow_intake_service.py
git commit -m "feat(auth): remove DATABRICKS_TOKEN env var mutation from MLflow intake"
```

---

## Task 3: Make token optional in API models

**Spec criteria:** SC-AUTH-SDK-3
**Files:**
- Modify: `server/models.py`
- Modify: `client/src/client/models/MLflowIntakeConfig.ts`
- Modify: `client/src/client/models/MLflowIntakeConfigCreate.ts`
- Modify: `client/src/client/models/DBSQLExportRequest.ts`

- [ ] **Step 1: Update Python models**

In `server/models.py`:

`MLflowIntakeConfig` (line 307): Change `databricks_token` to optional:
```python
databricks_token: str = Field("", description="Databricks access token (deprecated — SDK auth used instead)")
```

`MLflowIntakeConfigCreate` (line 317): Same change:
```python
databricks_token: str = Field("", description="Databricks access token (deprecated — SDK auth used instead)")
```

`DBSQLExportRequest` (line 459): Same change:
```python
databricks_token: str = Field("", description="Databricks access token (deprecated — SDK auth used instead)")
```

`DatabricksConfig` (line 572): Make token optional:
```python
token: str = Field("", description="Databricks API token (deprecated — SDK auth used instead)")
```

- [ ] **Step 2: Update TypeScript models**

In each TS model file, change `databricks_token: string` to `databricks_token?: string`.

- [ ] **Step 3: Run server tests**

Run: `just test-server`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add server/models.py client/src/client/models/
git commit -m "feat(auth): make databricks_token optional in API models"
```

---

## Task 4: Clean up `workshops.py` router — remove token-fetch patterns

**Spec criteria:** SC-AUTH-SDK-1, SC-AUTH-SDK-4
**Files:**
- Modify: `server/routers/workshops.py`

This is the biggest task. The token-fetch-and-patch pattern appears ~10 times. Each instance looks like:

```python
from server.services.token_storage_service import token_storage
databricks_token = token_storage.get_token(workshop_id)
if not databricks_token:
    databricks_token = db_service.get_databricks_token(workshop_id)
    if databricks_token:
        token_storage.store_token(workshop_id, databricks_token)
if not databricks_token:
    raise HTTPException(...)
mlflow_config.databricks_token = databricks_token
```

Replace each with:

```python
from server.services.databricks_service import resolve_databricks_token
try:
    databricks_token = resolve_databricks_token(mlflow_config.databricks_host)
except RuntimeError as e:
    raise HTTPException(status_code=401, detail=str(e))
```

- [ ] **Step 1: Replace all token-fetch patterns in workshops.py**

Locations to update (line numbers from current file):
1. ~line 1163 (add_traces endpoint)
2. ~line 1488 (ingest_traces endpoint)
3. ~line 2759 (configure_mlflow endpoint — remove `token_storage.store_token` + `db_service.set_databricks_token`)
4. ~line 2802 (get_serving_endpoints endpoint)
5. ~line 2890 (call_serving_endpoint endpoint)
6. ~line 3652 (search_traces endpoint)
7. ~line 3858 (search_traces_v2 endpoint)
8. ~line 4059 (judge_evaluate endpoint)
9. ~line 4831 (evaluate_endpoint)
10. ~line 5209 (re_evaluate endpoint)
11. ~line 5432 (top-level import)

Also remove the `os.environ["DATABRICKS_TOKEN"] = ...` lines (~line 1550, ~line 199).

- [ ] **Step 2: Remove volume export token from request body**

At ~line 2446-2479, the volume export uses `databricks_token` from the upload request body. Replace with SDK token:

```python
from server.services.databricks_service import resolve_databricks_token
databricks_token = resolve_databricks_token(databricks_host)
```

- [ ] **Step 3: Run server tests**

Run: `just test-server`
Expected: All tests pass

- [ ] **Step 4: Commit**

```bash
git add server/routers/workshops.py
git commit -m "feat(auth): replace token-fetch patterns with SDK auth in workshops router"
```

---

## Task 5: Clean up remaining services

**Spec criteria:** SC-AUTH-SDK-1, SC-AUTH-SDK-4
**Files:**
- Modify: `server/services/discovery_service.py` (7 references)
- Modify: `server/services/judge_service.py` (1 reference)
- Modify: `server/services/draft_rubric_grouping_service.py` (1 reference)
- Modify: `server/services/database_service.py` (remove token methods + import)
- Modify: `server/routers/databricks.py`
- Modify: `server/routers/dbsql_export.py`

- [ ] **Step 1: Update discovery_service.py**

Replace all 7 `from server.services.token_storage_service import token_storage` + `token_storage.get_token()` patterns with `resolve_databricks_token()`.

- [ ] **Step 2: Update judge_service.py**

Replace `token_storage` import and usage with `resolve_databricks_token()`.

- [ ] **Step 3: Update draft_rubric_grouping_service.py**

Replace `token_storage` import and usage with `resolve_databricks_token()`.

- [ ] **Step 4: Update databricks.py router**

Update `get_databricks_service()` to use SDK auth instead of `config.token`.

- [ ] **Step 5: Update dbsql_export.py router**

Use SDK token instead of `request.databricks_token`.

- [ ] **Step 6: Clean up database_service.py**

Remove `set_databricks_token()` and `get_databricks_token()` methods (~lines 3403-3424).
Remove `from server.services.token_storage_service import token_storage` import (line 71).

- [ ] **Step 7: Run server tests**

Run: `just test-server`
Expected: All tests pass

- [ ] **Step 8: Commit**

```bash
git add server/services/ server/routers/
git commit -m "feat(auth): replace token_storage with SDK auth in all services and routers"
```

---

## Task 6: Remove token storage infrastructure

**Spec criteria:** SC-AUTH-SDK-4
**Files:**
- Delete: `server/services/token_storage_service.py`
- Delete: `tests/unit/services/test_token_storage_service.py`
- Modify: `server/database.py` (remove `DatabricksTokenDB` model)
- Modify: `server/postgres_manager.py` (remove `databricks_tokens` table)

- [ ] **Step 1: Delete token_storage_service.py**

```bash
rm server/services/token_storage_service.py
rm tests/unit/services/test_token_storage_service.py
```

- [ ] **Step 2: Remove DatabricksTokenDB from database.py**

Remove lines 378-388 (the `DatabricksTokenDB` class).
Remove `databricks_token = relationship(...)` from `WorkshopDB` (~line 182).

- [ ] **Step 3: Remove from postgres_manager.py**

Remove `"databricks_tokens"` from the `ALLOWED_TABLES` list (line 39).
Remove the `CREATE TABLE IF NOT EXISTS databricks_tokens (...)` block (~lines 202-210).

- [ ] **Step 4: Run server tests**

Run: `just test-server`
Expected: Tests pass (test_token_storage_service tests gone, no import errors)

- [ ] **Step 5: Commit**

```bash
git add -A
git commit -m "feat(auth): remove token_storage_service and databricks_tokens DB table"
```

---

## Task 7: Frontend — remove token input fields

**Spec criteria:** SC-AUTH-SDK-3
**Files:**
- Modify: `client/src/pages/IntakePage.tsx`
- Modify: `client/src/pages/DBSQLExportPage.tsx`

- [ ] **Step 1: IntakePage.tsx — remove token input**

Remove the `databricks_token` field from:
- The config state initialization (line ~68)
- The `localStorage` persistence (lines ~57, ~87)
- The form input field (lines ~451-458)
- The validation checks (lines ~144, ~269, ~490, ~617, ~628)
- The form data append (line ~281)

Keep `databricks_host` and `experiment_id` — those are still needed.

- [ ] **Step 2: DBSQLExportPage.tsx — remove token input**

Remove the `databricksToken` state variable and all references:
- State initialization (line ~108)
- localStorage persistence (line ~158)
- The form input field (lines ~415-419)
- Validation checks (lines ~219, ~262, ~576, ~729)
- Request body (lines ~235, ~293)

- [ ] **Step 3: Run frontend linting**

Run: `just ui-lint`
Expected: No new errors

- [ ] **Step 4: Commit**

```bash
git add client/
git commit -m "feat(auth): remove token input fields from IntakePage and DBSQLExportPage"
```

---

## Task 8 (Final): Lint and verify

**Spec criteria:** SC-AUTH-SDK-7
**Files:** None (verification only)

- [ ] **Step 1: Run full server test suite**

Run: `just test-server`
Expected: All tests pass (minus deleted token_storage tests)

- [ ] **Step 2: Run frontend tests**

Run: `just ui-test-unit`
Expected: Same pass rate as baseline (27/36 files pass)

- [ ] **Step 3: Run frontend lint**

Run: `just ui-lint`
Expected: No errors

- [ ] **Step 4: Verify no remaining token_storage references**

```bash
grep -r "token_storage" server/ --include="*.py"
```
Expected: No matches

- [ ] **Step 5: Verify no remaining DATABRICKS_TOKEN env var mutation**

```bash
grep -rn "os.environ.*DATABRICKS_TOKEN" server/ --include="*.py"
```
Expected: No matches (only reads via `os.getenv` allowed)

- [ ] **Step 6: Commit any final fixes**

If any issues found, fix and commit.
