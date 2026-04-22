# Trace Display Pipeline Consistency — DNB Customer Hotfix

**Spec:** [TRACE_DISPLAY_SPEC](../../specs/TRACE_DISPLAY_SPEC.md) — SC under "Functional — Consistency": *"All backend services that consume trace input/output apply the same span filter and JSONPath pipeline as the TraceViewer."*

**Source commit:** [`da705d3`](https://github.com/databricks-solutions/project-0xfffff/commit/da705d3) (on `release/v1.10.0`)
**Base commit:** `090df1d` (customer's deployed version)
**Branch:** `hotfix/dnb-alignment`

## Goal

Port the `da705d3` trace-display consistency fix to the customer's base so backend services evaluate the same span-filtered + JSONPath-extracted text the TraceViewer shows SMEs.

## Why not cherry-pick

`da705d3` references `judge_service.py` and `discovery_service.py` as already-refactored, which is only true on `release/v1.10.0` after the SDK auth migration (commits `5df1069`, `ba8729c`). On `090df1d` those services still read raw `trace.input`/`trace.output` **and** don't load the `Workshop` object at the call sites. This plan hand-adapts the fix to the pre-migration structure.

## Files changed

### New
| File | Purpose |
|------|---------|
| `server/utils/trace_display_utils.py` | Shared `get_display_text(trace, workshop)` helper — verbatim port from da705d3 |

### Modified
| File | Change |
|------|--------|
| `server/services/judge_service.py` | 5 raw `trace.input/output` sites (lines 138, 145, 252, 258, 552-553) → `get_display_text()`. Add `workshop = self.db_service.get_workshop(workshop_id)` to `evaluate_prompt`, `evaluate_prompt_direct`, `export_judge` since workshop isn't currently loaded. |
| `server/services/discovery_service.py` | 2 sites (lines 330-331, 1370-1371) → `get_display_text()`. Workshop already in scope at both sites (loaded at 169 and 1202). Skip the keyword-peek at lines 882/884 (simulation fallback, out of scope). |
| `server/services/discovery_analysis_service.py` | Replace inline pipeline (lines 163-175) with a single `get_display_text()` call. Remove now-unused `apply_span_filter`/`apply_jsonpath` imports. |
| `tests/unit/services/test_trace_display_pipeline_consistency.py` | Port test additions from da705d3 (helper tests + judge_service behavior test + discovery_service behavior test). Keep existing tests. |

## Tasks (TDD)

### Task 1 — Helper + unit tests
- [ ] Port `server/utils/trace_display_utils.py` verbatim from `da705d3`
- [ ] Port `test_get_display_text_applies_full_pipeline` and `test_get_display_text_no_config` into the test file (tagged `@pytest.mark.spec("TRACE_DISPLAY_SPEC")`)
- [ ] `just test-server -- tests/unit/services/test_trace_display_pipeline_consistency.py` → green

### Task 2 — Wire `discovery_analysis_service.py`
- [ ] Replace inline pipeline at lines 163-175 with `get_display_text(trace, workshop)`
- [ ] Update imports (drop `apply_span_filter`, `apply_jsonpath`)
- [ ] Existing tests should still pass; no new tests needed (behavior equivalent)

### Task 3 — Wire `judge_service.py`
- [ ] In `evaluate_prompt`, `evaluate_prompt_direct`, `export_judge` — load `workshop = self.db_service.get_workshop(workshop_id)` once per function
- [ ] Replace all 5 raw `trace.input/output` references with `display_input, display_output = get_display_text(trace, workshop)` at the right scope
- [ ] Add `test_judge_service_applies_pipeline` (tagged) — port from da705d3 but adapted to the pre-migration API shape if needed
- [ ] `just test-server -- tests/unit/services/` → green

### Task 4 — Wire `discovery_service.py`
- [ ] Replace lines 330-331 (inside `get_discovery_questions`) with `display_input, display_output = get_display_text(trace, workshop)`. Workshop is loaded at line 169.
- [ ] Replace lines 1370-1371 (inside `_detect_disagreements_with_llm`) — workshop loaded at line 1202.
- [ ] Add `test_discovery_service_applies_pipeline` (tagged)
- [ ] `just test-server -- tests/unit/services/` → green

### Task 5 — Full verification
- [ ] `just test-server` (full backend) → green
- [ ] Commit with message referencing this plan + da705d3

## Out of scope

- `discovery_service.py:882,884` — the `'helpful' in (trace.output or '')` keyword peek inside a simulation-mode fallback. Not a real judge evaluation path; leaving raw read to minimize blast radius.
- `tests/unit/services/test_trace_display_pipeline_consistency.py::test_all_consumers_call_apply_span_filter_and_apply_jsonpath` — this structural test checks imports. On da705d3 it was replaced with behavioral tests. Preserving both is fine on this branch; da705d3's replacement tests are strict supersets.
- Spec `Implementation Log` entry — defer to the main-based forward-port PR, where the permanent record belongs.
- `uv run spec-coverage-analyzer` — same reason.

## Forward-port note

When this is eventually re-implemented against `main` for the upstream PR, skip Task 3's "add workshop loading" step — `judge_service.py` on main already has workshop-aware structure. The port there is closer to da705d3's original (direct one-line swap, no surrounding refactor).
