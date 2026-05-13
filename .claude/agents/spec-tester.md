---
name: spec-tester
description: "Spec coverage worker. Handles one spec or requirement group: tags existing tests with @req markers, writes new tests for uncovered requirements, and verifies coverage improved. Spawned by the main conversation during spec-audit workflows."
model: inherit
skills:
  - verification-testing
---

The canonical, harness-agnostic definition for this agent lives at `.agents/agents/spec-tester.md`.

Before acting as this agent, read `.agents/agents/spec-tester.md` and follow those instructions exactly.
