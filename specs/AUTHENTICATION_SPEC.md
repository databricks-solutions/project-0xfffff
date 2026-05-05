# Authentication Specification

## Overview

This specification defines the authentication flow, permission management, and session handling for the Human Evaluation Workshop system. It establishes requirements for reliable login, graceful error recovery, and proper loading state management.

## Architecture Context

The system has two distinct authentication concerns:

1. **Workshop application auth** (this spec) — login, roles, permissions, sessions
2. **Databricks API auth** — how the backend authenticates to Databricks services (MLflow, serving endpoints, volumes)

Application auth starts from the configured identity provider. In production on Databricks Apps, users are already authenticated before traffic reaches the application, so the app resolves the current user from that provider instead of presenting an app-owned email/password login screen. Local development may use a dev identity provider that defaults to facilitator so engineers can run the app without a hosted identity proxy.

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


### Optional Databricks OBO Auth

When the active provider is `DatabricksAppsIdentityProvider`, Databricks on-behalf-of-user (OBO) auth is available for future operations that explicitly need to execute with the logged-in Databricks user's permissions. OBO availability does not replace the app service principal as the default resource identity.

On Databricks Apps, delegated user auth is sourced from the platform-provided request identity and, when enabled for the app, the `X-Forwarded-Access-Token` header. The application must treat this token as request-scoped credential material:

- Do not persist the forwarded user token in localStorage, application database tables, logs, or long-lived backend caches.
- Do not expose the forwarded user token to the browser.
- Pass delegated credentials only to backend operations whose contract explicitly requires on-behalf-of-user execution.
- Use the app service principal for app-owned Databricks operations.

### Application User Identity

The backend owns an `IdentityProvider` boundary. The active provider resolves the external authenticated principal into a normalized application identity:

```python
Identity {
  provider: str
  subject: str
  email: str
  display_name: str
  provider_role: str | None
  provider_role_source: str | None
  delegated_databricks_auth_available: bool
}
```

The application must resolve the current app user from this provider identity, create or update the corresponding app user record as needed, then derive role permissions from that app user record.

#### IdentityProvider Contract

Every identity provider must implement the same backend contract so application auth does not branch on the hosting environment:

```python
class IdentityProvider(Protocol):
    provider_name: str

    def resolve_identity(request: Request) -> Identity:
        """Resolve the authenticated external principal for the current request."""

    def resolve_provider_role(identity: Identity) -> str:
        """Return provider role such as CAN_MANAGE or CAN_USE."""

    def map_provider_role(provider_role: str) -> UserRole:
        """Map provider role to application role."""

    def delegated_databricks_auth(request: Request) -> DelegatedDatabricksAuth | None:
        """Return request-scoped OBO credentials when supported and enabled."""
```

Provider requirements:

- `resolve_identity` must reject missing or unauthenticated identity with 401.
- `resolve_provider_role` must be implemented by every provider. It must not be optional even when a provider has a default role.
- `map_provider_role` is the only place provider-specific roles become application roles.
- `delegated_databricks_auth` returns `None` for providers that do not support Databricks OBO.
- The current-session endpoint must use this contract and return a normalized user/session shape independent of provider implementation.

This identity is separate from Databricks API auth:

- The logged-in external user determines the app user record and display name.
- On Databricks Apps, app permission determines the app role: users with `CAN MANAGE` are facilitators; users with `CAN USE` are non-facilitators.
- Databricks Apps identity headers provide user identity (`X-Forwarded-User`, `X-Forwarded-Email`, `X-Forwarded-Preferred-Username`) but do not document a forwarded app permission header. `DatabricksAppsIdentityProvider` must resolve `CAN MANAGE` / `CAN USE` from Databricks Apps permissions, for example through the Databricks SDK Apps permissions API (`get_permissions`) or an equivalent documented permissions endpoint, and may cache the result with a short TTL.
- Project ownership is application state. Project setup writes the submitting facilitator as the project's `facilitator_id`; identity resolution alone does not create project ownership.
- Backend calls to MLflow, model serving, Lakebase, and volumes continue to use the app's configured Databricks API auth unless a later on-behalf-of-user feature explicitly changes that contract.
- Databricks OBO is available when using `DatabricksAppsIdentityProvider`, but individual feature specs must opt into it explicitly.
- App-owned YAML facilitator passwords are not part of the standard production authentication path.

Supported providers:

- `DatabricksAppsIdentityProvider`: resolves the authenticated user from Databricks Apps request identity headers and maps Databricks App permission to app role (`CAN MANAGE` -> facilitator, `CAN USE` -> non-facilitator) using Databricks Apps permissions data rather than an assumed permission header.
- `LocalDevIdentityProvider`: resolves a configured local developer identity and implements `resolve_provider_role` from local configuration. Default local provider role is `CAN_MANAGE`; developers may set the local provider role to `CAN_USE` to test non-facilitator behavior.
- Future providers may support other hosted environments without changing application role or project-loading code.

First-time production facilitator access:

1. A workspace/admin deploys the Databricks App.
2. A user with `CAN MANAGE` on the app shares the app with the intended facilitator user or group and grants `CAN MANAGE`.
3. Non-facilitator users or groups receive `CAN USE`, or the app is configured so anyone in the organization can use it.
4. Required app resources are configured:
   - Lakebase/Postgres is added as an app resource, which provisions the app service principal's database role and connection environment variables.
   - The MLflow experiment is added as an app resource with the permission level required by setup, exposing `MLFLOW_EXPERIMENT_ID` to the app.
   - Required model serving endpoints are added as app resources with query permission for the app service principal.
5. The facilitator opens the app through Databricks and completes Databricks login if prompted by the platform.
6. The identity provider resolves the facilitator's external identity and `CAN MANAGE` app permission.
7. The app creates or updates the user record for that identity with facilitator role.
8. If no project exists, the app routes the facilitator to `/project/setup`; `CAN USE` users see a not-ready/non-facilitator state instead.
9. When the facilitator submits `/project/setup`, that authenticated app user is written as the project's `facilitator_id`.
10. Once setup completes, subsequent app loads resolve users through the provider and load the project workspace.

## Core Concepts

### User
- A workshop participant, SME, or facilitator with a unique identity
- Has associated permissions that control access to features
- Resolved from the configured identity provider and mapped to an app user record

### Permission
- Authorization flag controlling access to specific features
- Loaded from backend after successful authentication
- Defaults applied when backend is unavailable

### Session
- Client-side state representing the current resolved app user
- Includes user data, permissions, and project context
- Loaded from the backend on initialization and refreshed through TanStack Query

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
   a. In production, use the configured hosted identity provider
   b. In local development, use the configured local dev identity provider, defaulting to facilitator
3. Create, update, or fetch the app user record for that identity
4. Load permissions (with fallback)
5. Resolve the current project context
6. If no project exists and the user is a facilitator, route to the project setup flow
7. If no project exists and the user is non-facilitator, show a not-ready state
8. If a project exists, load the project workspace
9. Set isLoading = false (ONLY after all above complete)
```

**Critical Requirement**: `isLoading` must remain `true` until ALL initialization steps complete, including permission loading.

The frontend should model this as a current-session query. Route guards and shell components render loading UI while the current user, permissions, and project context are unresolved.

### Provider Session Flow

The application does not collect production passwords. Authentication happens in the configured identity provider before the app resolves its session.

```
Provider Session Flow:
1. User opens the app
2. Set isLoading = true
3. Load the current session from the backend
4. On success:
   a. Store user in state
   b. Load permissions (with fallback)
   c. Resolve project context
   d. Clear session errors
5. On failure: Set error message
6. ALWAYS: Set isLoading = false
```

### Logout Flow

```
Logout Flow:
1. Call provider logout if the active identity provider supports logout
2. Clear user state
3. Clear permissions
4. Clear project context
5. Redirect to the provider or app entry route
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

When the current-session endpoint returns unauthenticated:
1. Clear user, permissions, and project context
2. Display an actionable authentication message
3. Let the provider re-authenticate the user or restore the local dev identity

## Data Model

### UserContext State

```typescript
interface UserContextState {
  user: User | null;
  permissions: Permissions | null;
  projectId: string | null;
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
| `/auth/session` | GET | Resolve current provider identity, app user, permissions, and project context |
| `/users/{id}` | GET | Validate user exists |
| `/users/{id}/permissions` | GET | Load user permissions |

## Success Criteria

### Workshop Application Auth
- [ ] Production app load resolves the authenticated user through `IdentityProvider` without showing an app-owned password form
- [ ] Local development defaults to a facilitator identity when no hosted identity provider is present
- [ ] Every `IdentityProvider` implements `resolve_identity`, `resolve_provider_role`, `map_provider_role`, and `delegated_databricks_auth`
- [ ] `DatabricksAppsIdentityProvider` resolves app permission from Databricks Apps permissions data, using SDK Apps `get_permissions` or an equivalent documented permissions endpoint
- [ ] `LocalDevIdentityProvider` implements `resolve_provider_role` from local configuration, defaulting to `CAN_MANAGE` and allowing `CAN_USE` for non-facilitator testing
- [ ] Databricks Apps `CAN MANAGE` users map to facilitator role
- [ ] Databricks Apps `CAN USE` users map to non-facilitator role
- [ ] Local development can explicitly switch role/user for dev testing without enabling that switch in production
- [ ] Provider identity creates or updates the app user record before project setup/workspace loading
- [ ] Configured facilitator user can access `/project/setup` after receiving `CAN MANAGE` on the app and after required app resources are configured
- [ ] `CAN USE` users cannot access `/project/setup`
- [ ] No client-cached user state can override the active provider identity
- [ ] No "permission denied" errors on normal session load
- [ ] No page refresh required after provider-authenticated app load
- [ ] Slow network: Loading indicator shown until ready
- [ ] Permission API failure: User can continue with defaults
- [ ] Unauthenticated session: Session cleared and provider re-authentication allowed
- [ ] Rapid navigation: Components wait for `isLoading = false`
- [ ] Error recovery: Errors cleared on new session load attempt

### Databricks API Auth
- [ ] All Databricks API calls use SDK-resolved tokens (no user-provided PATs)
- [ ] MLflow operations use SDK auth without `os.environ["DATABRICKS_TOKEN"]` mutation
- [ ] Databricks OBO is available through `DatabricksAppsIdentityProvider` for features that explicitly require it
- [ ] Forwarded user tokens are never persisted, logged, stored in localStorage, or exposed to the browser
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

### Scenario 1: Normal Session Load
- User opens the app after authenticating with the provider
- Permissions load successfully
- Access granted to appropriate features

### Scenario 2: Slow Network
- User opens the app
- Loading indicator shown
- No race condition errors
- Access granted when complete

### Scenario 3: Permission API Failure
- User session resolves successfully
- Permission API returns 500
- Default permissions applied
- User can access basic features

### Scenario 4: Provider Session Expired
- User returns after provider session expires
- Current-session endpoint returns unauthenticated
- Session cleared
- "Session expired" shown
- Provider re-authentication works

### Scenario 5: Rapid Navigation
- User opens the app
- Immediately navigates
- Components wait for loading
- No permission errors

## Superseded Behavior

App-owned email/password login and YAML facilitator passwords are superseded by provider-resolved identity. Removal work should be tracked in implementation issues after this spec is merged.

## Implementation Log

| Date | Plan | Status | Summary |
|------|------|--------|---------|
| 2026-04-10 | [SDK Auth Migration](../.claude/plans/2026-04-10-sdk-auth-migration.md) | complete | Replace PAT token auth with Databricks SDK unified auth |
| 2026-04-11 | (inline) | complete | Fix Lakebase connection pool: switch to `do_connect` + `generate_database_credential()`, fix pool settings to match Databricks docs |
| 2026-04-15 | [Remove databricks_host](../.claude/plans/2026-04-15-remove-databricks-host-app-yaml-resources.md) | in-progress | Remove user-configurable host, use app.yaml resources for MLflow experiment, fix MemAlign embedding model |
| 2026-05-05 | (spec PR) | proposed | Define provider-resolved app identity and removal of app-owned password login before implementation |
