# Context

## Glossary

### Session

A backend-resolved representation of the current authenticated app user, derived from the active identity provider and returned through the current-session endpoint. The browser must not restore the app session from locally stored workshop user state.

### Current Session Endpoint

The frontend's source of truth for authentication and role state, exposed as `GET /api/auth/session`. It answers "who am I for this app request?" by resolving trusted provider/proxy identity on the backend. A successful response means the provider identity was authenticated, the app user was fetched or materialized, and role-derived permissions are valid for the request. Missing provider identity returns `401`, not `200 null`. The SPA does not log in with an app-owned password flow and does not send browser-stored JWTs or user records for normal authenticated API calls.

Session resolution may reconcile provider permissions with a short cache, but it must be fresh enough that granting or revoking `CAN_USE` or `CAN_MANAGE` on the Databricks App is reflected in the UI after a normal session refresh.

Legacy app-owned login is not part of V2. Frontend login forms, browser-restored user sessions, backend password login endpoints, password fields, and password-oriented persistence columns should be removed rather than preserved as compatibility paths.

The implementation is working when an end-to-end auth flow successfully replaces the old UI role mapping: provider/session-derived authorization determines whether the user sees power-user project controls or non-facilitator surfaces.

Specs are part of the provider-based identity loading work. They should codify current-session/provider language and remove obsolete localStorage login, app-owned password login, and workshop-management authorization wording from V2 flows.

The move to provider-resolved app identity should be documented with a lightweight ADR. V2 is not preserving backward compatibility with the legacy login model.

The provider-based identity loading PR should be treated as setting up V2 authentication from scratch rather than patching the legacy auth model.

### User Profile

The user's display data, such as name and email. Provider identity may refresh this data when the user is materialized or explicitly refreshed, but profile refresh is distinct from project authorization checks. `GET /api/auth/session` includes only the display data needed by the app shell; `GET /api/users/me` is the canonical current-user profile endpoint; and `GET /api/users/` lists materialized app users for facilitator-facing management. Provider-resolved, non-materialized users are returned only during an explicit invite/search action, with pagination and performance boundaries so provider lookups do not make the normal roster UI expensive or fragile.

### Invite

A facilitator action that marks one or more provider-resolved people as expected to participate. The UI must support inviting comma-separated user lists. The canonical facilitator roster is `GET /api/users/`; it returns users with `status = "pending"` or `status = "active"`. Pending users become active when they open the app through the provider-authenticated flow and session resolution updates their user record.

### Databricks User Id

The canonical external user identifier for Databricks-backed users. In this app, the Databricks user id is the normalized email / SCIM `userName`. Display name is separate and is used for rendering.

### Identity Provider

The backend boundary that resolves an external authenticated principal, resolves the provider role, and maps that role to application authorization. Request-scoped delegated Databricks on-behalf-of-user auth belongs in the spec as a future provider capability, but is omitted from the current implementation slice.

Provider identity and current-session behavior live in a dedicated auth feature boundary. User roster, profile, and invite functionality live in a users boundary because user-specific behavior is expected to grow.

Providers return provider facts such as identity and provider role. The auth session service maps those facts into app users, statuses, roles, and project permissions.

### Provider Role

The role supplied by the hosting provider's app permission system. For Databricks Apps, `CAN_MANAGE` grants facilitator authority and `CAN_USE` grants non-facilitator app access.

Provider role resolution may use a short TTL cache around the provider roles/permissions endpoint so normal session refreshes reflect Databricks App permission changes without issuing provider calls on every protected route.

The current implementation should stay simple: provider role drives current session capabilities, while app user data stores durable display/status/subrole fields. Elaborate downgrade handling is not a release priority.

### App Role

The role stored by this application for a materialized user. The current durable distinction is facilitator versus non-facilitator: facilitators can update project configuration, while non-facilitators cannot. `sme` and `participant` are non-facilitator subroles whose distinction is expected to become less important or disappear as the user model becomes more granular.

### Project Permission

A capability that controls a project-scoped action. V2 setup starts with `can_manage_project` for project configuration authority; future capabilities may include actions such as updating rubrics or invoking agents. New project flows should use project permissions instead of legacy workshop permission names. The UI reads user/session details through TanStack Query to decide which controls to show, while protected API routes such as project updates check the backend authorization model before performing the action.

### Project Facilitator

The app user recorded as the facilitator who submitted project setup. Setup derives this from the current authenticated session instead of accepting it as a frontend form field.

### Current Project

The single project configured for the deployed app. V2 has a one-app/one-project invariant, so normal UI and API flows operate on the current project rather than asking the user to choose a project id.

### Non-Facilitator Home

The workspace surface for authenticated non-power users. It owns non-facilitator onboarding, home, feed, and related user flows. Non-facilitators must not be routed into the facilitator workspace. The provider-based identity loading PR may stub this workspace rather than implementing the full feed or onboarding flows.

### Trusted Proxy Identity

Authenticated identity supplied to the backend by Databricks Apps or another trusted auth proxy through agreed request headers. The backend accepts these headers only as provider input; missing identity is unauthenticated, and the application must not treat arbitrary client-supplied identity headers as trustworthy outside a trusted proxy deployment.

In Databricks Apps, unauthenticated users who open the app URL are expected to receive an OAuth redirect to the Databricks control plane before returning to the app. The SPA should not implement its own login screen for this path.

### Local Dev Identity

The local development provider for the same current-session contract used in production. It defaults to a power user / `CAN_MANAGE` identity, while tests can configure `CAN_MANAGE` or `CAN_USE` to exercise facilitator and non-facilitator behavior. The frontend does not branch for local auth and no local login screen exists.

