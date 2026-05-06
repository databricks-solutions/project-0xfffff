# ADR 0001: Use Provider-Resolved App Identity

## Status

Accepted for V2.

## Context

Databricks Apps authenticate users before requests reach the app container. The app receives trusted forwarded identity headers and can resolve app permissions from Databricks Apps permissions data. V2 does not need to preserve the legacy workshop login model.

## Decision

Use provider-resolved app identity as the authentication source of truth.

- The frontend loads auth state from `GET /api/auth/session` through TanStack Query.
- The backend resolves the current provider identity and provider role, materializes or updates the app user, and returns app permissions.
- Databricks Apps `CAN_MANAGE` maps to project-management authority; `CAN_USE` maps to non-power-user access.
- Local development uses the same session endpoint through a local dev provider that defaults to `CAN_MANAGE`.
- App-owned password login, frontend login forms, browser-restored user sessions, password fields, and facilitator YAML auth are removed from V2.

## Consequences

The app no longer implements its own login flow. Unauthenticated production users are expected to be redirected by Databricks Apps before the SPA loads. A `401` from `GET /api/auth/session` is treated as an unexpected unauthenticated state, not as a prompt for an app-owned login form.

Request-scoped Databricks on-behalf-of-user auth remains a future provider capability and is not implemented in this slice.

