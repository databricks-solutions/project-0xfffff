# Brainstorming Skill Benchmark — Iteration 1

## Overall

| Config | Pass Rate | Time | Tokens |
|--------|-----------|------|--------|
| With Skill | **95%** (19/20) | ~45s | ~38.5k |
| Baseline | **10%** (2/20) | ~35s | ~28.5k |
| **Delta** | **+85%** | +10s | +10k |

## Per-Eval Breakdown

| Eval | With Skill | Baseline |
|------|-----------|----------|
| CSV Export | 5/6 (83%) | 1/6 (17%) |
| Webhooks | 6/6 (100%) | 0/6 (0%) |
| Admin Dashboard | 8/8 (100%) | 1/8 (12%) |

## Key Observations

1. **Spec-first workflow is the primary value.** Without the skill, agents skip specs entirely and jump to code.
2. **One borderline failure:** The CSV export eval flagged "proposed new criteria" as a failure, but the agent correctly identified a spec gap — the assertion was too strict.
3. **Code avoidance works:** All skill runs stayed at design level. All baselines included implementation code.
4. **Keyword additions:** 3/3 skill runs proposed README.md keywords. 0/3 baselines did.
5. **Skill chaining:** 3/3 skill runs terminated with writing-plans invocation. 0/3 baselines did.
