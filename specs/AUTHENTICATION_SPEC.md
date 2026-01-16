# Authentication Specification

## Overview

This specification defines the authentication flow, permission management, and session handling for the Human Evaluation Workshop system. It establishes requirements for reliable login, graceful error recovery, and proper loading state management.

## Architecture Context

### Current State: Application-Layer Auth

The workshop system currently implements a **secondary authentication layer** on top of Databricks workspace authentication:

```
┌─────────────────────────────────────────────────────────────┐
│                    Databricks Workspace                      │
│  ┌─────────────────────────────────────────────────────┐    │
│  │              Databricks User Auth                    │    │
│  │         (handles workspace access)                   │    │
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
- Databricks handles workspace-level access (who can access the app)
- Workshop auth handles application-level permissions (what users can do within the app)
- Workshop roles (participant, SME, facilitator) are app-specific concepts not in Databricks IAM

### Future State: Native Databricks Auth

The system is designed to eventually migrate to native Databricks user authentication:

- Workshop roles will map to Databricks groups or custom attributes
- Permission checks will use Databricks IAM where possible
- Session management will leverage Databricks tokens
- The application auth layer will be removed or simplified

**Migration path**: The permission model is intentionally abstract to allow swapping the auth backend without changing application code.

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

- [ ] No "permission denied" errors on normal login
- [ ] No page refresh required after login
- [ ] Slow network: Loading indicator shown until ready
- [ ] Permission API failure: User can log in with defaults
- [ ] 404 on validation: Session cleared, fresh login allowed
- [ ] Rapid navigation: Components wait for `isLoading = false`
- [ ] Error recovery: Errors cleared on new login attempt

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
