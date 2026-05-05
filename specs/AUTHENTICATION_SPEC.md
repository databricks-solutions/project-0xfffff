# Authentication Specification

## Overview

This specification defines the authentication flow, permission management, and session handling for the Human Evaluation Workshop system. It establishes requirements for reliable login, graceful error recovery, and proper loading state management.

## Architecture Context

The system has two distinct authentication concerns:

1. **Workshop application auth** (this spec) — login, roles, permissions, sessions
2. **Databricks API auth** — how the backend authenticates to Databricks services (MLflow, serving endpoints, volumes)

For V2 project-mode deployments, application auth starts from the Databricks Apps user session. A production Databricks App is already behind Databricks login, so the app must not present the legacy email/password workshop login as the default first screen. Local development may keep a development-only facilitator identity so engineers can run the app without the Databricks Apps identity proxy.

```
┌─────────────────────────────────────────────────────────────┐
│                    Databricks Workspace                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │         Databricks API Auth (SDK-based)              │    │
│  │    Service principal (Apps) / CLI profile (local)    │    │
│  └─────────────────────────────────────────────────────┘    │
│                           │                                  │
│                           ▼                                  │
│  ┌─────────────────────────────────────────────────────┐    │
│  │        Workshop Application Auth (this spec)         │    │
│  │    (handles app-specific roles & permissions)        │    │
│  └─────────────────────────────────────────────────────┘    │
└─────────────────────────────────────────────────────────────┘
```

**Why two layers?**
- Databricks API auth handles backend-to-Databricks communication (MLflow traces, serving endpoints, volume access)
- Workshop auth handles application-level permissions (what users can do within the app)
- Workshop roles (participant, SME, facilitator) are app-specific concepts not in Databricks IAM

## Databricks API Authentication

All Databricks API calls (MLflow, model serving, volume access) use the **Databricks SDK unified auth**. Users never provide Personal Access Tokens (PATs) through the UI.

### Token Resolution

The backend resolves auth tokens via `resolve_databricks_token()` in `server/services/databricks_service.py`:

```
Token Resolution Order:
1. Databricks SDK (WorkspaceClient().config.authenticate())
   - On Databricks Apps: uses platform-injected service principal
     (DATABRICKS_CLIENT_ID / DATABRICKS_CLIENT_SECRET)
   - Locally: uses CLI profile from `databricks auth login`
2. DATABRICKS_TOKEN environment variable (fallback for CI/containers)
3. Raise RuntimeError if nothing available
```

### Environment-Specific Behavior

| Environment | Auth Method | Setup |
|-------------|-------------|-------|
| Databricks Apps | Service principal (automatic) | Platform injects `DATABRICKS_CLIENT_ID`/`SECRET` |
| Local development | CLI profile | Run `databricks auth login --host <workspace-url>` |
| CI / containers | Environment variable | Set `DATABRICKS_TOKEN` |

### MLflow Auth

MLflow operations (`search_traces`, `log_feedback`, `set_experiment`) use whatever auth the Databricks SDK provides. `DATABRICKS_HOST` is set by the platform (Databricks Apps) or the developer (`.env.local`). `MLFLOW_EXPERIMENT_ID` is provided via the app.yaml resource declaration. The backend calls `mlflow.set_tracking_uri('databricks')` — the SDK handles auth automatically. No user-configurable host or token is stored.

### Required Service Principal Permissions

The app's service principal needs access to these Databricks resources. On Databricks Apps, grant these through the Apps UI "Add resource" flow.

#### Core Resources (required)

| Resource | Operations | Required Permission |
|----------|-----------|-------------------|
| **Lakebase (PostgreSQL)** | Primary production database. OAuth tokens injected per-connection via `do_connect` event. Configured via `DATABASE_ENV=postgres` + `PGHOST`/`PGDATABASE`/`PGUSER`/`ENDPOINT_NAME` env vars. | Postgres role with `databricks_auth` extension ([docs](https://docs.databricks.com/aws/en/lakebase/admin/authentication.html)) |
| **MLflow Experiment** | `search_traces`, `get_experiment`, `set_experiment`, `log_feedback`, `set_trace_tag`. Declared as app.yaml resource (`MLFLOW_EXPERIMENT_ID`). | Can edit |
| **Model Serving Endpoints** | `chat.completions.create` (judge evaluation, rubric generation, discovery). Includes embedding endpoints (e.g. `databricks-gte-large-en`) used by MemAlign. | Can query |

### Lakebase Connection Pool

The app connects to Lakebase Autoscaling (serverless PostgreSQL) using SQLAlchemy + psycopg with OAuth token rotation. This section defines the required connection pool behavior.

**Reference:** [Connect a custom Databricks app to Lakebase](https://docs.databricks.com/aws/en/lakebase/connect/custom-app.html), [Token rotation in Lakebase](https://docs.databricks.com/aws/en/lakebase/connect/token-rotation.html)

#### Token Lifecycle

- OAuth tokens expire after **1 hour**, but expiration is enforced **only at connection establishment** (login), not on existing connections
- Existing pooled connections remain valid after their token expires — no need to recycle them
- Fresh tokens are needed only when creating **new** physical connections (pool growth or replacing dropped connections)

#### Token Injection Pattern

Use the SQLAlchemy `do_connect` event listener to inject fresh tokens into new physical connections. Do **not** bake the token into the connection URL or use a `creator` callable.

```python
@event.listens_for(engine, "do_connect")
def provide_token(dialect, conn_rec, cargs, cparams):
    # Refresh token if near expiry (2 min buffer before 1-hour lifetime)
    if token is None or near_expiry:
        cred = w.postgres.generate_database_credential(endpoint=endpoint_name)
        token = cred.token
    cparams["password"] = token
```

**Reference:** [About authentication in Lakebase](https://docs.databricks.com/aws/en/lakebase/admin/authentication.html)

#### Required Pool Settings

| Setting | Value | Rationale |
|---------|-------|-----------|
| `pool_size` | 5 | Matches recommended range (5–10). With 2 gunicorn workers = 10 base connections. |
| `max_overflow` | 5 | Caps burst at 10 per worker, 20 total. Docs recommend 0–5. |
| `pool_recycle` | 3600 | Match 1-hour token lifetime. 300s (5 min) causes excessive connection churn. |
| `pool_pre_ping` | False | Conflicts with `do_connect` token injection. Use retry logic instead. |

#### Credential API

For Lakebase Autoscaling, use `WorkspaceClient().postgres.generate_database_credential(endpoint=endpoint_name)` to generate connection-scoped credentials. This requires the `ENDPOINT_NAME` environment variable (format: `projects/<id>/branches/<id>/endpoints/<id>`).

**Reference:** [Connect external app to Lakebase using SDK](https://docs.databricks.com/aws/en/lakebase/connect/external-app.html)

#### Lakebase Setup Prerequisites

**Databricks Apps (production):** Add the Lakebase database as an App resource in the Apps UI. Databricks automatically creates a Postgres role for the app's service principal (named after its `DATABRICKS_CLIENT_ID`) with `CONNECT` and `CREATE` grants. No manual role creation needed.

**External / additional identities:** If connecting from outside Databricks Apps or adding extra identities beyond the app SP, a workspace admin must manually create roles:

1. Enable the `databricks_auth` extension: `CREATE EXTENSION IF NOT EXISTS databricks_auth`
2. Create a Postgres role: `SELECT databricks_create_role('<DATABRICKS_CLIENT_ID>', 'service_principal')`
3. Grant `CONNECT` on the database and `CREATE, USAGE` on schemas
4. Grant table-level permissions on app tables

**Reference:** [Lakebase authentication](https://docs.databricks.com/aws/en/lakebase/admin/authentication.html), [Databricks Apps resources](https://docs.databricks.com/aws/en/dev-tools/databricks-apps/resources)


### Future: Per-User Auth (On-Behalf-Of-User)

Databricks Apps can forward the logged-in user's OAuth token via the `x-forwarded-access-token` HTTP header. This would allow per-user Unity Catalog enforcement (row-level filters, column masks). Not yet implemented — the app currently uses the service principal identity for all Databricks API calls.

### Databricks App User Identity

Databricks Apps production traffic is already authenticated by the platform. The application must resolve the current app user from platform-provided identity, create or update the corresponding app user record as needed, then derive role permissions from that app user record.

This identity is separate from Databricks API auth:

- The logged-in Databricks user determines the app user record, display name, role, and project ownership.
- Backend calls to MLflow, model serving, Lakebase, and volumes continue to use the app's configured Databricks API auth unless a later on-behalf-of-user feature explicitly changes that contract.
- The legacy YAML facilitator credentials are not the production default in V2 project mode.

Local development behavior:

- If no Databricks Apps identity is available locally, the app may assume a facilitator identity by default.
- Local development may provide an explicit dev-only switch for testing SME or participant behavior.
- Dev identity switches must not be enabled implicitly in production deployments.

## Core Concepts

### User
- A workshop participant, SME, or facilitator with a unique identity
- Has associated permissions that control access to features
- Session persisted in localStorage for cross-page continuity

### Permission
- Authorization flag controlling access to specific features
- Loaded from backend after successful authentication
- Defaults applied when backend is unavailable

### Session
- Client-side state representing authenticated user
- Includes user data, permissions, and workshop context
- Validated against backend on initialization

## Permission Model

### Permission Types

| Permission | Description | Default |
|------------|-------------|---------|
| `can_annotate` | User can submit annotations | `true` |
| `can_view_rubric` | User can view rubric questions | `true` |
| `can_create_rubric` | User can create/edit rubrics | `false` |
| `can_manage_workshop` | User can manage workshop settings | `false` |
| `can_assign_annotations` | User can assign traces to annotators | `false` |

### Permission Loading

```
Permission Loading Flow:
1. Attempt to load permissions from API
2. On success: Apply loaded permissions
3. On 404: Session expired, clear user state
4. On other error: Apply default permissions (fallback)
```

## Authentication Flow

### Initialization (App Load)

```
App Initialization:
1. Set isLoading = true
2. Resolve the current app user:
   a. In Databricks Apps production, use the platform-authenticated user identity
   b. In local development, use the configured local dev identity, defaulting to facilitator
3. Create, update, or fetch the app user record for that identity
4. Load permissions (with fallback)
5. Resolve the current V2 project context
6. If no project exists, route to the project setup flow
7. If a project exists, load the project workspace
8. Set isLoading = false (ONLY after all above complete)
```

**Critical Requirement**: `isLoading` must remain `true` until ALL initialization steps complete, including permission loading.

The legacy localStorage session validation path is a compatibility fallback for non-V2 workshop flows. It must not override a Databricks Apps production identity.

### Login Flow

In V2 project mode, manual login is not the primary production path. Users arrive with a Databricks session, and app initialization resolves the app user automatically.

Legacy workshop login may remain for compatibility until the workshop-mode surface is retired:

```
Login Flow:
1. Clear previous errors
2. Set isLoading = true
3. Make login API call
4. On success:
   a. Store user in state
   b. Load permissions (with fallback)
   c. Store user in localStorage
   d. Clear errors
5. On failure: Set error message
6. ALWAYS: Set isLoading = false
```

### Logout Flow

```
Logout Flow:
1. Clear user state
2. Clear permissions
3. Clear localStorage
4. Clear workshop context
5. Redirect to login
```

## Error Handling

### Race Condition Prevention

**Problem**: Setting `isLoading = false` before permissions load causes "permission denied" errors.

**Solution**:
- `isLoading` set to `false` ONLY at the end of initialization
- All async operations complete before loading state changes
- Components render only when `isLoading === false`

### Fallback Permissions

When permission loading fails (non-404 errors), apply default permissions:

```typescript
const defaultPermissions = {
  can_annotate: true,
  can_view_rubric: true,
  can_create_rubric: false,
  can_manage_workshop: false,
  can_assign_annotations: false,
};
```

This ensures users can access basic features even when the permission API is unavailable.

### Session Expiration

When user validation returns 404:
1. Clear stale user data from localStorage
2. Clear permissions and state
3. Display "session expired" message
4. Allow fresh login

## Data Model

### UserContext State

```typescript
interface UserContextState {
  user: User | null;
  permissions: Permissions | null;
  workshopId: string | null;
  isLoading: boolean;
  error: string | null;
}
```

### User

```typescript
interface User {
  id: string;
  name: string;
  email?: string;
  role: 'participant' | 'sme' | 'facilitator';
  created_at: string;
}
```

### Permissions

```typescript
interface Permissions {
  can_annotate: boolean;
  can_view_rubric: boolean;
  can_create_rubric: boolean;
  can_manage_workshop: boolean;
  can_assign_annotations: boolean;
}
```

## Implementation

### File: `client/src/context/UserContext.tsx`

Key implementation points:

1. **Loading State Management**
   - Initialize `isLoading = true`
   - Set `false` only after ALL async operations complete
   - Never set `false` mid-initialization

2. **Permission Loading**
   - Always await permission loading before proceeding
   - Apply fallback on non-404 errors
   - Log warnings for debugging

3. **Error Handling**
   - Clear errors before new login attempts
   - Set appropriate error messages
   - Don't block UI on non-critical errors

### API Endpoints

| Endpoint | Method | Purpose |
|----------|--------|---------|
| `/users/auth/current` | GET | Resolve current Databricks Apps or local dev app user |
| `/users/{id}` | GET | Validate user exists |
| `/users/{id}/permissions` | GET | Load user permissions |
| `/users/auth/login` | POST | Legacy workshop login |

## Success Criteria

### Workshop Application Auth
- [ ] V2 production app load resolves the already-authenticated Databricks user without showing the legacy login form
- [ ] V2 local development defaults to a facilitator identity when no Databricks Apps identity proxy is present
- [ ] Local development can explicitly switch role/user for dev testing without enabling that switch in production
- [ ] Databricks Apps user identity creates or updates the app user record before project setup/workspace loading
- [ ] Legacy cached sessions never override the Databricks Apps production identity
- [ ] No "permission denied" errors on normal login
- [ ] No page refresh required after login
- [ ] Slow network: Loading indicator shown until ready
- [ ] Permission API failure: User can log in with defaults
- [ ] 404 on validation: Session cleared, fresh login allowed
- [ ] Rapid navigation: Components wait for `isLoading = false`
- [ ] Error recovery: Errors cleared on new login attempt

### Databricks API Auth
- [ ] All Databricks API calls use SDK-resolved tokens (no user-provided PATs)
- [ ] MLflow operations use SDK auth without `os.environ["DATABRICKS_TOKEN"]` mutation
- [ ] No token input fields exist in the frontend UI
- [ ] No token persistence in memory (`TokenStorageService` for Databricks) or database (`databricks_tokens` table)
- [ ] Local development works via `databricks auth login` CLI profile
- [ ] Databricks Apps deployment works via platform-injected service principal
- [ ] `DATABRICKS_TOKEN` env var works as fallback for CI/containers
- [ ] `resolve_databricks_token()` raises `RuntimeError` with actionable message when no auth available
- [ ] No user-configurable `databricks_host` — app always uses its own workspace
- [ ] `DATABRICKS_HOST` comes from environment (Databricks Apps platform or developer), not stored config
- [ ] `MLFLOW_EXPERIMENT_ID` comes from app.yaml resource declaration
- [ ] `DatabricksService` does not accept `workspace_url` parameter — uses env-based host only
- [ ] MemAlign embedding model is selectable with default to `databricks-gte-large-en`
- [ ] No dead `OPENAI_API_KEY` code paths in alignment service

### Lakebase Connection Pool
- [ ] Token injection uses `do_connect` event listener, not `creator` callable or baked-in URL
- [ ] Tokens generated via `generate_database_credential(endpoint=...)` for Lakebase Autoscaling
- [ ] Token refresh only when creating new physical connections (not on every checkout)
- [ ] `pool_recycle=3600` (not shorter — avoids unnecessary connection churn)
- [ ] `pool_pre_ping=False` (conflicts with `do_connect` token injection)
- [ ] `max_overflow` ≤ 5 (caps total connections at 20 across 2 gunicorn workers)
- [ ] `ENDPOINT_NAME` environment variable required for Lakebase Autoscaling deployments

## Testing Scenarios

### Scenario 1: Normal Login
- User logs in
- Permissions load successfully
- Access granted to appropriate features

### Scenario 2: Slow Network
- User logs in
- Loading indicator shown
- No race condition errors
- Access granted when complete

### Scenario 3: Permission API Failure
- User logs in successfully
- Permission API returns 500
- Default permissions applied
- User can access basic features

### Scenario 4: Session Expired
- User returns with stale session
- Validation returns 404
- Session cleared
- "Session expired" shown
- Fresh login works

### Scenario 5: Rapid Navigation
- User logs in
- Immediately navigates
- Components wait for loading
- No permission errors

## Backwards Compatibility

- All existing authentication flows work unchanged
- No database changes required
- No API changes needed
- Graceful fallbacks for all error cases

## Implementation Log

| Date | Plan | Status | Summary |
|------|------|--------|---------|
| 2026-04-10 | [SDK Auth Migration](../.claude/plans/2026-04-10-sdk-auth-migration.md) | complete | Replace PAT token auth with Databricks SDK unified auth |
| 2026-04-11 | (inline) | complete | Fix Lakebase connection pool: switch to `do_connect` + `generate_database_credential()`, fix pool settings to match Databricks docs |
| 2026-04-15 | [Remove databricks_host](../.claude/plans/2026-04-15-remove-databricks-host-app-yaml-resources.md) | in-progress | Remove user-configurable host, use app.yaml resources for MLflow experiment, fix MemAlign embedding model |
| 2026-05-05 | (spec PR) | proposed | Define V2 Databricks Apps user bootstrap and local facilitator fallback before implementation |
