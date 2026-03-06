# Role & Permissions Specification

## Overview

This specification defines the role-based permission system for the Human Evaluation Workshop. It establishes the three participant roles (facilitator, SME, participant), the permissions each role grants or denies, and the rules governing role protection, phase advancement, and role-specific operations.

**Boundary**: This spec defines *what each role can do*. [AUTHENTICATION_SPEC](./AUTHENTICATION_SPEC.md) defines *how users authenticate and how permissions are loaded/fallback*. [DISCOVERY_TRACE_ASSIGNMENT_SPEC](./DISCOVERY_TRACE_ASSIGNMENT_SPEC.md) defines *how trace assignment works* once the `can_assign_annotations` permission is granted.

## Core Concepts

### Role

A user classification that determines their permissions within a workshop. Defined as a string enum with three values:

| Role | Purpose |
|------|---------|
| **Facilitator** | Workshop supervisor: creates rubrics, manages workshop, advances phases, monitors progress. Does not participate in annotation. |
| **SME** | Subject Matter Expert: discovers findings, annotates traces. Cannot manage workshop or view aggregate results. |
| **Participant** | General annotator: discovers findings, annotates traces. Same permissions as SME. |

### Permission

A boolean flag controlling access to a specific feature. Each permission defaults to a value and is overridden by the user's role via `UserPermissions.for_role()`.

### Role Protection

Facilitator accounts have elevated protections: their role cannot be changed, and they cannot be deleted through normal user management endpoints.

## Data Model

### UserRole Enum

```python
class UserRole(str, Enum):
    FACILITATOR = 'facilitator'
    SME = 'sme'
    PARTICIPANT = 'participant'
```

### Permission Model

```python
class UserPermissions(BaseModel):
    can_view_discovery: bool = True
    can_create_findings: bool = True
    can_view_all_findings: bool = False
    can_create_rubric: bool = False
    can_view_rubric: bool = True
    can_annotate: bool = True
    can_view_all_annotations: bool = False
    can_view_results: bool = True
    can_manage_workshop: bool = False
    can_assign_annotations: bool = False
```

### Role-to-Permission Matrix

| Permission | Facilitator | SME | Participant |
|-----------|-------------|-----|-------------|
| `can_view_discovery` | true | true | true |
| `can_create_findings` | false | true | true |
| `can_view_all_findings` | true | false | false |
| `can_create_rubric` | true | false | false |
| `can_view_rubric` | true | false | false |
| `can_annotate` | false | true | true |
| `can_view_all_annotations` | true | false | false |
| `can_view_results` | true | false | false |
| `can_manage_workshop` | true | false | false |
| `can_assign_annotations` | true | false | false |

Design rationale:
- Facilitators are **supervisors**: they monitor and manage but do not participate in annotation (avoids conflict of interest)
- SMEs and Participants have **identical permissions**: both annotate and create findings, neither can manage
- `can_view_rubric` is false for SME/Participant because the facilitator shares their screen during rubric discussion

## Behavior

### Permission Derivation

Permissions are derived from the user's role at request time via `UserPermissions.for_role(role)`. There is no per-user permission override — the role is the single source of truth for what a user can do.

```
GET /users/{user_id}/permissions
  1. Look up user by ID
  2. If not found: return 404
  3. Return UserPermissions.for_role(user.role)
```

### Role Assignment

Roles are assigned at user creation time and stored in both the `users` table and the `workshop_participants` table.

```
POST /users/
  1. Create user with provided role
  2. Add user as workshop participant with same role
```

### Login Flow by Role

Facilitators and other roles authenticate through different paths:

```
POST /auth/login
  1. Attempt facilitator auth via YAML config
  2. If YAML match:
     - Get or create facilitator user record
     - Return AuthResponse with is_preconfigured_facilitator=true
  3. If no YAML match:
     - Authenticate via database (email/password)
     - Return AuthResponse with is_preconfigured_facilitator=false
```

### Phase Advancement (Facilitator Only)

Only facilitators can advance the workshop through phases. Each transition has prerequisites:

| Transition | Endpoint | Prerequisites |
|-----------|----------|---------------|
| INTAKE -> DISCOVERY | `POST /advance-to-discovery` | At least one trace exists |
| DISCOVERY -> RUBRIC | `POST /advance-to-rubric` | At least one discovery finding exists |
| RUBRIC -> ANNOTATION | `POST /advance-to-annotation` | Rubric exists for workshop |
| ANNOTATION -> RESULTS | `POST /advance-to-results` | At least one annotation exists |
| ANNOTATION/RESULTS -> JUDGE_TUNING | `POST /advance-to-judge-tuning` | Idempotent if already in phase |
| JUDGE_TUNING -> UNITY_VOLUME | `POST /advance-to-unity-volume` | Idempotent if already in phase |

### Facilitator-Only Operations

The following operations require the facilitator role:

| Operation | Enforcement |
|-----------|-------------|
| Create invitation | Checks `inviter.role == FACILITATOR`, returns 403 otherwise |
| Advance workshop phase | Documented as facilitator-only |
| Assign traces to user | Requires `can_assign_annotations` permission (facilitator-only) |
| Auto-assign annotations | Requires `can_assign_annotations` permission (facilitator-only) |
| Create/edit rubrics | Requires `can_create_rubric` permission (facilitator-only) |
| View IRR results | Requires `can_view_results` permission (facilitator-only) |

### Role Protection Rules

```
PUT /users/{user_id}/role
  - If user.role == FACILITATOR: return 403 "Cannot change facilitator role"

DELETE /users/{user_id}
  - If user.role == FACILITATOR: return 403 "Cannot delete facilitators"
```

### Data Access Filtering

Permissions control what data users see:

| Data | Facilitator | SME / Participant |
|------|-------------|-------------------|
| Findings | All findings (any user) | Own findings only |
| Annotations | All annotations (any user) | Own annotations only |
| IRR / Results | Visible | Hidden |

## Implementation

### Key Files

| File | Responsibility |
|------|---------------|
| `server/models.py` | `UserRole` enum, `UserPermissions` model with `for_role()` classmethod |
| `server/database.py` | `UserDB` and `WorkshopParticipantDB` models (store role as string) |
| `server/routers/users.py` | Permission endpoint, role checks on invitation/delete/role-change |
| `server/routers/workshops.py` | Phase advancement endpoints (facilitator-only) |
| `client/src/context/UserContext.tsx` | Client-side permission loading and state |

### Permission Endpoint

```
GET /users/{user_id}/permissions -> UserPermissions
```

Returns the permission set derived from the user's role. Called by the frontend after login to determine UI visibility.

## Success Criteria

### Role-to-Permission Mapping

- [ ] Facilitator role grants: can_create_rubric, can_manage_workshop, can_assign_annotations, can_view_all_findings, can_view_all_annotations, can_view_results
- [ ] Facilitator role denies: can_annotate, can_create_findings
- [ ] SME role grants: can_annotate, can_create_findings, can_view_discovery
- [ ] SME role denies: can_create_rubric, can_manage_workshop, can_view_results, can_view_all_annotations
- [ ] Participant role grants: can_annotate, can_create_findings, can_view_discovery
- [ ] Participant role denies: can_create_rubric, can_manage_workshop, can_view_results, can_view_all_annotations
- [ ] Permissions derived from role via UserPermissions.for_role() classmethod

### Role Protection

- [ ] Facilitator role cannot be changed via update endpoint
- [ ] Facilitator accounts cannot be deleted via delete endpoint
- [ ] Only facilitators can create invitations

### Phase Advancement

- [ ] Only facilitators can advance workshop phases
- [ ] Phase advancement validates prerequisites before transitioning
- [ ] Phase advancement returns 400 if prerequisites not met

### Login by Role

- [ ] Facilitators authenticate via YAML config (preconfigured credentials)
- [ ] SMEs and participants authenticate via database credentials
- [ ] Login response includes is_preconfigured_facilitator flag for facilitator logins

## Related Specs

- [AUTHENTICATION_SPEC](./AUTHENTICATION_SPEC.md) — Login flow, session management, permission loading/fallback, error recovery
- [DISCOVERY_TRACE_ASSIGNMENT_SPEC](./DISCOVERY_TRACE_ASSIGNMENT_SPEC.md) — Trace assignment behavior (uses `can_assign_annotations` permission)
- [ANNOTATION_SPEC](./ANNOTATION_SPEC.md) — Annotation submission (uses `can_annotate` permission)
- [RUBRIC_SPEC](./RUBRIC_SPEC.md) — Rubric creation (uses `can_create_rubric` permission)
