# Authentication Specification

## Overview

This specification defines the authentication flow, permission management, and session handling for the Human Evaluation Workshop system. It establishes requirements for reliable login, graceful error recovery, and proper loading state management.

## Architecture Context

The system has two distinct authentication concerns:

1. **Workshop application auth** (this spec) — login, roles, permissions, sessions
2. **Databricks API auth** — how the backend authenticates to Databricks services (MLflow, serving endpoints, volumes)

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

MLflow operations (`search_traces`, `log_feedback`, `set_experiment`) use whatever auth the Databricks SDK provides. The backend sets `DATABRICKS_HOST` so the SDK knows which workspace, then calls `mlflow.set_tracking_uri('databricks')`. No explicit token is passed — the SDK handles it.

### Required Service Principal Permissions

The app's service principal needs access to these Databricks resources. On Databricks Apps, grant these through the Apps UI "Add resource" flow.

#### Core Resources (required)

| Resource | Operations | Required Permission |
|----------|-----------|-------------------|
| **Lakebase (PostgreSQL)** | Primary production database. `OAuthTokenManager` refreshes OAuth tokens via `WorkspaceClient().config.oauth_token()` every 15 minutes. Configured via `DATABASE_ENV=postgres` + `PGHOST`/`PGDATABASE`/`PGUSER` env vars. | App resource with read/write |
| **MLflow Experiment** | `search_traces`, `get_experiment`, `set_experiment`, `log_feedback`, `set_trace_tag` | Can edit |
| **Model Serving Endpoints** | `chat.completions.create` (judge evaluation, rubric generation, discovery) | Can query |

#### Optional Resources

| Resource | Operations | When Needed | Required Permission |
|----------|-----------|-------------|-------------------|
| **SQL Warehouse** | DBSQL export via `databricks.sql.connect()` | DBSQL export feature | Can use |
| **Unity Catalog Volume** | SQLite backup/restore via SDK Files API (`files.upload`, `files.download`, `files.get_status`) | Only if using SQLite with SQLite Rescue (not needed with Lakebase) | Can read and write |

### What Was Removed

Prior to this migration, the system had:
- Token input fields in the UI (IntakePage, DBSQLExportPage)
- In-memory token storage (`TokenStorageService`) with 24-hour expiration
- Database-persisted tokens (`databricks_tokens` table)
- A 4-level token fallback chain (SDK → explicit → stored → env var)
- `os.environ["DATABRICKS_TOKEN"]` mutations at runtime

All of this was replaced by the single `resolve_databricks_token()` function.

### Future: Per-User Auth (On-Behalf-Of-User)

Databricks Apps can forward the logged-in user's OAuth token via the `x-forwarded-access-token` HTTP header. This would allow per-user Unity Catalog enforcement (row-level filters, column masks). Not yet implemented — the app currently uses the service principal identity for all Databricks API calls.

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
2. Check localStorage for saved user
3. If user found:
   a. Validate user exists via API
   b. If valid: Load user data
   c. Load permissions (with fallback)
   d. Set workshop context if available
4. Set isLoading = false (ONLY after all above complete)
```

**Critical Requirement**: `isLoading` must remain `true` until ALL initialization steps complete, including permission loading.

### Login Flow

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
| `/users/{id}` | GET | Validate user exists |
| `/users/{id}/permissions` | GET | Load user permissions |
| `/login` | POST | Authenticate user |

## Success Criteria

### Workshop Application Auth
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
