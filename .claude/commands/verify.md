---
allowed-tools: Bash(just:*), Bash(git status:*)
argument-hint: [scope] - "all", "affected", "backend", "frontend", "e2e"
description: Run tests to verify code changes
---

# Verify Code Changes

You are verifying code changes using the project's test infrastructure.

## Scope: $ARGUMENTS

Based on the scope provided, run the appropriate verification:

### If scope is "all" or empty:
Run the full verification suite:
1. `just test-server` - Python unit tests
2. `just ui-lint` - TypeScript/ESLint checks
3. `just ui-test-unit` - React unit tests
4. `just e2e` - End-to-end tests

### If scope is "affected":
1. First, check `git status` to see what files changed
2. If Python files changed: run `just test-server`
3. If TypeScript/React files changed: run `just ui-lint && just ui-test-unit`
4. If E2E-relevant changes (UI components, API routes): run `just e2e`

### If scope is "backend":
Run only backend verification:
1. `just test-server`

### If scope is "frontend":
Run only frontend verification:
1. `just ui-lint`
2. `just ui-test-unit`

### If scope is "e2e":
Run only E2E tests:
1. `just e2e`

## On Failure

If any test fails:
1. Report which tests failed with the error output
2. Suggest fixes based on the error messages
3. Ask if the user wants you to fix the issues

## Reference

See the verification-testing skill in `.claude/skills/verification-testing/` for detailed testing patterns and mocking guidance.
