# Fix plan — MemAlign duplicate "Distilled Guidelines" + full episodic log

**Branch:** `hotfix/dnb-alignment`
**Author:** dylan.qu
**Date:** 2026-04-24
**Governing spec:** `/specs/JUDGE_EVALUATION_SPEC.md` (§ "Alignment (MemAlign Optimizer)", lines 312–390; § "Registered Judge Loading", lines 267–282)

## Summary

Two bugs in `server/services/alignment_service.py::AlignmentService.run_alignment()`:

1. **Duplicate "Distilled Guidelines (N):" blocks** in the aligned judge's prompt after a second alignment run. Root cause: we re-wrap the MemoryAugmentedJudge's *decorated* `instructions` string back into a plain `InstructionsJudge` via `make_judge(instructions=aligned_instructions, ...)` before calling `update()`. This throws away the structured `_semantic_memory` / `_episodic_trace_ids` and bakes the decoration into the registered judge's base instructions. Next alignment appends a second block on top.
2. **Episodic-memory log entries are truncated** in the Execution Logs panel — only 80 chars of `inputs` and no `outputs`/`expectations` are shown, limiting the user's ability to see what MemAlign is actually learning from.

---

## Root cause — MLflow API evidence

All evidence is from the MLflow `master` branch at `mlflow/genai/judges/optimizers/memalign/optimizer.py` (fetched 2026-04-24).

### How MemAlign stores distilled guidelines

`MemoryAugmentedJudge.instructions` is a **computed property** (optimizer.py:269–275):

```python
@property
def instructions(self) -> str:
    instructions = self._base_judge.instructions
    if self._semantic_memory:
        instructions += f"\n\nDistilled Guidelines ({len(self._semantic_memory)}):\n"
        for guideline in self._semantic_memory:
            instructions += f"  - {guideline.guideline_text}\n"
    return instructions
```

The decorated block is **not stored** — it is rebuilt on every access from (a) the clean `_base_judge.instructions` and (b) the structured `_semantic_memory: list[Guideline]`.

### How the judge is persisted

`MemoryAugmentedJudge.model_dump()` (optimizer.py:292–310) serializes the three pieces separately:

```python
memory_augmented_data = {
    "base_judge": base_judge_data,                     # CLEAN base instructions
    "episodic_trace_ids": self._episodic_trace_ids,    # list[str]
    "semantic_memory": [g.model_dump() for g in self._semantic_memory],
    ...
}
```

`_from_serialized()` (optimizer.py:313–337) rebuilds a `MemoryAugmentedJudge` from that data, so `get_scorer()` returns the full memory-augmented object — not a flattened prompt string. (Note: contrary to a stale comment in our code and spec, episodic **trace IDs** *are* persisted — the examples lazily reconstruct from MLflow traces.)

### How re-alignment unwraps correctly — *if* the input is a real MemoryAugmentedJudge

`MemoryAugmentedJudge.__init__()` (optimizer.py:139–142):

```python
effective_base_judge = (
    base_judge._base_judge if isinstance(base_judge, MemoryAugmentedJudge) else base_judge
)
```

And `_initialize_dspy_components()` (optimizer.py:186–193) inherits the prior semantic/episodic memory when the base is a MemoryAugmentedJudge:

```python
if isinstance(base_judge, MemoryAugmentedJudge):
    self._semantic_memory = copy.deepcopy(base_judge._semantic_memory)
    self._episodic_trace_ids = base_judge._episodic_trace_ids.copy()
    ...
```

Combined with `_distill_new_guidelines()` (optimizer.py:500–518), which passes `existing_guideline_texts` to dedupe:

```python
new_guidelines = distill_guidelines(
    ...
    judge_instructions=self._base_judge.instructions,   # CLEAN — no decoration
    existing_guidelines=existing_guideline_texts,
)
self._semantic_memory.extend(new_guidelines)
```

…MLflow handles re-alignment correctly *as long as* the registered judge is saved as a real MemoryAugmentedJudge. There is exactly one "Distilled Guidelines (N+k):" block at the end of `instructions` — never two.

### Why our current code produces two blocks

`alignment_service.py:1442–1457` (current):

```python
aligned_judge_for_registration = make_judge(
    name=registered_judge_name,
    instructions=aligned_instructions,        # <-- aligned_judge.instructions (DECORATED)
    feedback_value_type=feedback_type,
    model=judge_model_uri,
)
aligned_judge_for_registration.update(
    experiment_id=experiment_id,
    name=registered_judge_name,
    sampling_config=ScorerSamplingConfig(sample_rate=0.0),
)
```

`make_judge()` returns a plain `InstructionsJudge` whose `instructions` field **literally stores the decorated string** ("original … \n\nDistilled Guidelines (5):\n  - …"). `update()` then persists that plain judge — **dropping** `_semantic_memory`, `_episodic_trace_ids`, and `kind = ScorerKind.MEMORY_AUGMENTED`.

On the next `Run Align()` click:

1. Frontend sends the prior `aligned_instructions` as `AlignmentRequest.judge_prompt` (workshops.py:3959). The DB copy was saved from the previous run at workshops.py:3982–3992.
2. `run_alignment()` builds `judge = make_judge(instructions=normalized_judge_prompt, ...)` — a plain judge whose base instructions already contain `Distilled Guidelines (5):`.
3. `judge.align(...)` wraps it in a new `MemoryAugmentedJudge` with this polluted judge as `_base_judge`.
4. The new judge's computed `instructions` property returns **`_base_judge.instructions` (already contains `Distilled Guidelines (5):`) + freshly appended `Distilled Guidelines (7):`** → two blocks, matching the observed output.

### Why `aligned_judge.update(sampling_config=...)` is the fix (per MLflow docs + source)

MLflow's end-to-end workflow docs (`.../llm-judge/workflow/`) show:

```python
aligned_judge = support_judge.align(aligned_traces)
aligned_judge.register(experiment_id=experiment_id)
```

Calling `register()`/`update()` **directly on the returned `MemoryAugmentedJudge`** dispatches to `Scorer.register()` / `Scorer.update()` (scorers/base.py:736 and :884). These call `self._create_copy()` and `model_dump()` — which for `MemoryAugmentedJudge` emits the structured form with clean base + `semantic_memory` + `episodic_trace_ids`.

Result: the registered judge round-trips through `_from_serialized()` as a real `MemoryAugmentedJudge`. Subsequent `.align()` calls see `isinstance(base_judge, MemoryAugmentedJudge) → True` and unwrap correctly. **No duplication.**

---

## Fix 1 — register the MemoryAugmentedJudge directly

### File: `server/services/alignment_service.py`

Replace the registration block (currently lines 1433–1481) with the pattern below.

**Key notes on the API signatures (confirmed from `mlflow/genai/scorers/base.py`):**
- `Scorer.register(*, name=None, experiment_id=None)` — does **not** accept `sampling_config`.
- `Scorer.update(*, name=None, experiment_id=None, sampling_config)` — `sampling_config` is **required**.

The user's sketched fallback `aligned_judge.register(sampling_config=…)` would raise `TypeError`. Correct fallback: `register()` first, then `update()` to set sampling.

### New code

```python
from mlflow.genai.scorers import ScorerSamplingConfig

registered_judge_name = judge_name  # reuse original name; no "_aligned" suffix
try:
    # Preferred path: judge was already pre-registered earlier (lines 1211–1230)
    # so update() finds it and persists the MemoryAugmentedJudge structure
    # (clean base + semantic_memory + episodic_trace_ids).
    aligned_judge.update(
        experiment_id=experiment_id,
        name=registered_judge_name,
        sampling_config=ScorerSamplingConfig(sample_rate=0.0),
    )
    yield f"Updated registered judge '{registered_judge_name}' with aligned memory (semantic + episodic trace IDs)"
except Exception as update_err:
    # Fallback: scorer not yet registered — register, then set sampling.
    err_text = str(update_err).lower()
    if "not found" in err_text or "does not exist" in err_text:
        try:
            aligned_judge.register(
                experiment_id=experiment_id,
                name=registered_judge_name,
            )
            yield f"Registered new judge '{registered_judge_name}' with aligned memory"
            try:
                aligned_judge.update(
                    experiment_id=experiment_id,
                    name=registered_judge_name,
                    sampling_config=ScorerSamplingConfig(sample_rate=0.0),
                )
                yield f"Set sample_rate=0 for judge '{registered_judge_name}'"
            except Exception as config_err:
                yield f"WARNING: Could not set sampling config: {config_err}"
        except Exception as register_err:
            yield f"WARNING: Could not register aligned judge: {register_err}"
    else:
        yield f"WARNING: Could not update registered judge: {update_err}"
```

### What to delete

- Remove the `aligned_judge_for_registration = make_judge(...)` block entirely. The in-memory `aligned_judge` (the MemoryAugmentedJudge returned by `judge.align()`) is the correct thing to persist.
- Update the stale log line at line 1376:
  - from: `Episodic memory: {example_count} examples (not persisted to registered judge)`
  - to: `Episodic memory: {example_count} examples (trace IDs persisted on registered judge)`
- Update the stale module docstring at lines 7–9 to reflect that episodic trace IDs are persisted.

### Cascading risk to flag (recommend addressing in the same PR)

Even after Fix 1, the frontend still stores and re-sends the decorated `aligned_instructions` as the next `judge_prompt` (workshops.py:3982–3992 → workshops.py:3959 → alignment_service.py:1178 `make_judge(instructions=normalized_judge_prompt)`). So if the user re-aligns without relying on the registered-scorer path, the decorated string re-enters as the *base* of a new alignment and the bug resurfaces.

**Recommendation:** in `run_alignment()`, before `make_judge(...)`, try to load the previously registered MemoryAugmentedJudge:

```python
from mlflow.genai.scorers import get_scorer

judge = None
try:
    existing = get_scorer(name=judge_name, experiment_id=experiment_id)
    if existing is not None and getattr(existing, "kind", None).__str__().endswith("MEMORY_AUGMENTED"):
        judge = existing  # reuse clean base + prior memory; MemAlign will extend, not duplicate
        yield f"Loaded previously aligned judge '{judge_name}' — will extend its memory"
except Exception as load_err:
    logger.info("No prior registered judge to reuse: %s", load_err)

if judge is None:
    judge = make_judge(
        name=judge_name,
        instructions=self._normalize_judge_prompt(judge_prompt),
        feedback_value_type=feedback_type,
        model=judge_model_uri,
    )
```

`MemAlignOptimizer.align()` calls `MemoryAugmentedJudge(base_judge=judge, ...)` which auto-unwraps when `judge` is already a MemoryAugmentedJudge (optimizer.py:139–142), so passing the loaded scorer is safe. Semantic memory is inherited; new guidelines extend (dedup'd) instead of stacking.

If we skip this and keep the frontend-driven flow, we should at minimum strip any `Distilled Guidelines (\d+):` block from the incoming `judge_prompt` before `make_judge` — but this is a defensive hack compared to the get_scorer path.

---

## Fix 2 — show full episodic-memory examples in logs

### File: `server/services/alignment_service.py` (lines 1394–1406)

Replace the truncated preview with full rendering of the first 2 examples. Include `inputs`, `outputs`, and `expectations` (typical DSPy example fields for episodic memory entries).

```python
# Log sample episodic memory examples (first 2, full content — no truncation)
if episodic_memory:
    yield "--- Sample Episodic Memory Examples ---"
    for i, example in enumerate(episodic_memory[:2], 1):
        ex_dict = dict(example) if hasattr(example, "__iter__") else {}
        trace_id = getattr(example, "_trace_id", "N/A")
        yield f"  Example {i} (trace: {trace_id}):"
        if "inputs" in ex_dict:
            yield f"    Inputs: {ex_dict['inputs']}"
        if "outputs" in ex_dict:
            yield f"    Outputs: {ex_dict['outputs']}"
        if "expectations" in ex_dict:
            yield f"    Expectations: {ex_dict['expectations']}"
    if len(episodic_memory) > 2:
        yield f"  ... and {len(episodic_memory) - 2} more examples"
```

Rationale: the current `[:80]` slice of `inputs` and 3-example cap was a placeholder. Showing 2 *full* examples gives the user enough context to validate what MemAlign is distilling from, without flooding the log panel.

---

## Success criteria

Tied to `JUDGE_EVALUATION_SPEC.md` §§ Alignment (line 601–602) and Registered Judge Loading (line 275).

1. **Single "Distilled Guidelines (N):" block.** After aligning a judge twice in a row against the same (or overlapping) human-annotated traces, the final `aligned_judge.instructions` contains **exactly one** `Distilled Guidelines (\d+):` block. Guideline count may grow, but the block header appears once.
2. **Registered judge is MemoryAugmentedJudge.** `get_scorer(name=judge_name, experiment_id=experiment_id).kind == ScorerKind.MEMORY_AUGMENTED` after alignment. `_semantic_memory` and `_episodic_trace_ids` are non-empty when alignment distilled at least one guideline / produced at least one example.
3. **Episodic log renders 2 full examples.** Execution Logs panel for an alignment run shows `Example 1 (trace: …): \n    Inputs: {...full dict...}\n    Outputs: {...}\n    Expectations: {...}` for the first two entries, followed by `... and N more examples` if applicable. No `...` truncation inside an example.
4. **No regression in first-time alignment.** A brand-new judge (no prior registration) still completes alignment, is registered successfully, and has sampling_config `sample_rate=0.0`.

## Test plan

Test additions belong in `tests/services/test_alignment_service.py` (per `TESTING_SPEC.md` backend test layout). Tag each test with `@pytest.mark.spec("JUDGE_EVALUATION_SPEC")` and the relevant `@req` markers from `JUDGE_EVALUATION_SPEC.md` lines 601, 602, 275.

1. `test_align_registers_memory_augmented_judge` — mock `MemAlignOptimizer.align` to return a MemoryAugmentedJudge; assert `aligned_judge.update` / `.register` is called (not `make_judge(...).update`).
2. `test_re_align_produces_single_guidelines_block` — run align twice; assert `aligned_judge.instructions.count("Distilled Guidelines (")` == 1 at the end of each run.
3. `test_episodic_log_shows_two_full_examples` — capture yields from `run_alignment`; assert the log stream contains `Example 1` and `Example 2` with full `Inputs:` / `Outputs:` fields (no `...` truncation within).
4. (If Fix 1 + get_scorer cascading fix is adopted) `test_realign_reuses_registered_judge` — seed a registered MemoryAugmentedJudge, call align again, assert `get_scorer` was used and `make_judge` was not.

Verification commands:
- `just test-server` — after backend changes.
- `just spec-coverage` — confirm new `@req` tags land on the expected requirements.
- Manual E2E: align the DNB workshop judge twice from the UI, verify a single `Distilled Guidelines (N):` block in the final prompt and two full episodic examples in the Execution Logs.

## Risks / considerations

- **`Scorer._check_can_be_registered()`** may raise if the `MemoryAugmentedJudge` instance is not in a registrable state. We already call `judge.register(experiment_id, name=judge_name)` for the pre-alignment judge at lines 1211–1230, and the aligned judge inherits that path through `model_dump()` / `_create_copy()`. If this check fires, fall back to the register-then-update branch in Fix 1.
- **Sampling config side effect.** `sample_rate=0.0` preserves current behavior (judge is registered but not auto-sampling traces). Do not change to `None` or omit — that would change runtime behavior.
- **Spec drift note (out of scope for this PR but flag):** `JUDGE_EVALUATION_SPEC.md` line 279 and line 382 state "Episodic memory (example retrieval) not persisted in registered judge". Post-fix this is inaccurate — episodic **trace IDs** *are* persisted and examples are lazily reconstructed from MLflow traces on load. Update the spec in a follow-up so `/spec-coverage` reflects reality.
- **Protected op reminder:** `/specs/` files are protected — do not edit them as part of this fix without separately asking the user.

## Rollout

1. Apply Fix 1 (registration) + Fix 2 (episodic log) to `alignment_service.py`.
2. Decide on the cascading-risk recommendation (load via `get_scorer` in `run_alignment`) — strongly recommended as part of the same PR, otherwise the bug reappears on any UI flow that re-sends the stored aligned prompt.
3. Add the pytest cases above; tag with `@pytest.mark.spec("JUDGE_EVALUATION_SPEC")`.
4. `just test-server && just spec-coverage` must pass before commit on `hotfix/dnb-alignment`.
5. Manual E2E on a staging workshop with the DNB judge to confirm a single "Distilled Guidelines" block after two alignment runs.
