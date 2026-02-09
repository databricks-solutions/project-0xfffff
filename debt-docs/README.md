# Tech Debt Registry

This directory contains the comprehensive tech debt audit for the Human Evaluation Workshop codebase. Each document follows the spec format used in `/specs/` with an added prioritized backlog section.

## Debt Categories

| Document | Category | Critical | High | Medium | Low |
|----------|----------|----------|------|--------|-----|
| [ARCHITECTURE_DEBT.md](ARCHITECTURE_DEBT.md) | Separation of concerns, modularity, abstractions | 3 | 4 | 6 | 2 |
| [COMPLEXITY_DEBT.md](COMPLEXITY_DEBT.md) | Cyclomatic/cognitive complexity, nesting, coupling | 4 | 5 | 5 | 2 |
| [CODE_QUALITY_DEBT.md](CODE_QUALITY_DEBT.md) | Code quality, architecture, complexity | 3 | 6 | 5 | 4 |
| [TESTING_DEBT.md](TESTING_DEBT.md) | Test coverage, quality, infrastructure | 4 | 4 | 4 | 0 |
| [SECURITY_DEBT.md](SECURITY_DEBT.md) | Auth, secrets, CORS, encryption | 3 | 3 | 3 | 2 |
| [DEPENDENCY_DEBT.md](DEPENDENCY_DEBT.md) | Unused deps, pinning, duplication | 0 | 1 | 1 | 1 |
| [PERFORMANCE_DEBT.md](PERFORMANCE_DEBT.md) | Queries, indexes, caching, polling | 0 | 3 | 4 | 2 |
| [DEPLOYMENT_DEBT.md](DEPLOYMENT_DEBT.md) | Config, health checks, CI/CD, logging | 2 | 3 | 4 | 3 |
| [DX_DEBT.md](DX_DEBT.md) | Tooling, onboarding, docs, artifacts | 1 | 3 | 5 | 1 |
| [TOOLING_PATTERNS_DEBT.md](TOOLING_PATTERNS_DEBT.md) | Library misuse, framework underutilization | 2 | 4 | 3 | 1 |
| [REACT_PATTERNS_DEBT.md](REACT_PATTERNS_DEBT.md) | React architecture, components, hooks, routing | 2 | 3 | 3 | 2 |

## Keyword Index

| Keyword | Document(s) |
|---------|-------------|
| separation of concerns, SoC | ARCHITECTURE_DEBT |
| god service, god component, modularity | ARCHITECTURE_DEBT, CODE_QUALITY_DEBT |
| service layer, business logic in routes | ARCHITECTURE_DEBT |
| generated client, raw fetch, API bypass | ARCHITECTURE_DEBT |
| duplicate types, type drift | ARCHITECTURE_DEBT |
| duplicate logic, rubric parsing | ARCHITECTURE_DEBT |
| localStorage, storage abstraction | ARCHITECTURE_DEBT |
| late imports, internal imports | ARCHITECTURE_DEBT, CODE_QUALITY_DEBT |
| os.environ, environment mutation | ARCHITECTURE_DEBT |
| auth pattern, auth decorator, middleware | ARCHITECTURE_DEBT, SECURITY_DEBT |
| context provider, state management | ARCHITECTURE_DEBT |
| query keys, React Query config | ARCHITECTURE_DEBT |
| job persistence, background threads | ARCHITECTURE_DEBT |
| permission logic, UserPermissions | ARCHITECTURE_DEBT |
| cyclomatic complexity, CC, decision points | COMPLEXITY_DEBT |
| cognitive complexity, nesting depth | COMPLEXITY_DEBT, CODE_QUALITY_DEBT |
| useState explosion, useEffect chains | COMPLEXITY_DEBT |
| retry loop, retry pattern | COMPLEXITY_DEBT, CODE_QUALITY_DEBT |
| generator protocol, implicit types | COMPLEXITY_DEBT |
| fan-in, fan-out, dependency graph | COMPLEXITY_DEBT |
| as any, type cast | COMPLEXITY_DEBT, CODE_QUALITY_DEBT |
| LLM parsing, JSON fallback | COMPLEXITY_DEBT |
| schema updates, raw SQL | COMPLEXITY_DEBT, DEPLOYMENT_DEBT |
| useReducer, state cascade | COMPLEXITY_DEBT |
| bare except, error handling | CODE_QUALITY_DEBT |
| god file, large file, complexity | CODE_QUALITY_DEBT |
| any type, type safety | CODE_QUALITY_DEBT |
| dead code, unused, TODO | CODE_QUALITY_DEBT, DX_DEBT |
| print, console.log, debug | CODE_QUALITY_DEBT, DX_DEBT |
| polling, retry, duplication | CODE_QUALITY_DEBT, PERFORMANCE_DEBT |
| test coverage, missing tests | TESTING_DEBT |
| spec tagging | TESTING_DEBT |
| E2E, Playwright, flaky | TESTING_DEBT |
| mock, fixture, test infra | TESTING_DEBT |
| hardcoded password, credentials | SECURITY_DEBT |
| CORS, allow_origins | SECURITY_DEBT, DEPLOYMENT_DEBT |
| encryption, ENCRYPTION_KEY | SECURITY_DEBT |
| auth, admin, unprotected | SECURITY_DEBT |
| password_hash, exposure | SECURITY_DEBT |
| litellm, dspy, unused dep | DEPENDENCY_DEBT |
| version pinning | DEPENDENCY_DEBT |
| N+1, index, query | PERFORMANCE_DEBT |
| pagination, list endpoints | PERFORMANCE_DEBT |
| cache, TTL | PERFORMANCE_DEBT |
| bundle size, drop_console | PERFORMANCE_DEBT, DX_DEBT |
| health check, readiness | DEPLOYMENT_DEBT |
| migration, rollback | DEPLOYMENT_DEBT |
| worker, pool, connection | DEPLOYMENT_DEBT |
| structured logging | DEPLOYMENT_DEBT, DX_DEBT |
| rate limiting | DEPLOYMENT_DEBT |
| eslint, prettier, pre-commit | DX_DEBT |
| architecture docs, onboarding | DX_DEBT |
| stale artifacts, git cleanup | DX_DEBT |
| config sprawl | DX_DEBT |
| TanStack Query, useQuery, refetchInterval | TOOLING_PATTERNS_DEBT |
| generated client, fetch bypass, OpenAPI | TOOLING_PATTERNS_DEBT, ARCHITECTURE_DEBT |
| response_model, Pydantic, raw dict | TOOLING_PATTERNS_DEBT |
| Alembic bypass, runtime schema, _apply_schema | TOOLING_PATTERNS_DEBT, DEPLOYMENT_DEBT |
| SQLAlchemy .query(), select(), deprecated API | TOOLING_PATTERNS_DEBT |
| Depends(), dependency injection, DI | TOOLING_PATTERNS_DEBT |
| BackgroundTasks, threading.Thread | TOOLING_PATTERNS_DEBT |
| QueryClient, staleTime, cache invalidation | TOOLING_PATTERNS_DEBT |
| junction table, JSON column, relational | TOOLING_PATTERNS_DEBT |
| code splitting, React.lazy, manualChunks | TOOLING_PATTERNS_DEBT |
| React Router, navigation, deep linking, URL | REACT_PATTERNS_DEBT |
| useState explosion, component size, decomposition | REACT_PATTERNS_DEBT, COMPLEXITY_DEBT |
| error boundary, ErrorBoundary, white screen | REACT_PATTERNS_DEBT |
| context provider, re-render, provider hell | REACT_PATTERNS_DEBT |
| form handling, react-hook-form, validation | REACT_PATTERNS_DEBT |
| conditional rendering, ternary, && chain | REACT_PATTERNS_DEBT |
| useEffect chain, missing deps, data cascade | REACT_PATTERNS_DEBT |
| Suspense, loading skeleton, progressive | REACT_PATTERNS_DEBT |
| JudgeTuningPage, FacilitatorDashboard, TraceViewer | REACT_PATTERNS_DEBT, CODE_QUALITY_DEBT |

## How to Use This Registry

1. **Before starting work**: Check if your area has known debt items
2. **During implementation**: If you encounter new debt, add it to the relevant document
3. **Sprint planning**: Use the Prioritized Backlog section in each document to plan remediation
4. **Tracking**: Update item status as debt is resolved

## Severity Definitions

| Severity | Definition |
|----------|------------|
| **CRITICAL** | Active risk to production stability, data integrity, or security. Fix immediately. |
| **HIGH** | Significant impact on maintainability, reliability, or developer productivity. Fix this sprint. |
| **MEDIUM** | Moderate impact on code quality or DX. Plan for remediation within 1-2 sprints. |
| **LOW** | Minor improvements. Address opportunistically or during related work. |
