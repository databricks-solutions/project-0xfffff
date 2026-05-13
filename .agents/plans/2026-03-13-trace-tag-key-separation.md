# Trace Tag Key Separation — Bugfix Plan

**Spec:** [JUDGE_EVALUATION_SPEC](../../specs/JUDGE_EVALUATION_SPEC.md), [ANNOTATION_SPEC](../../specs/ANNOTATION_SPEC.md)
**Goal:** Fix MLflow trace tag mutual destruction by giving `eval` and `align` independent tag keys
**Architecture:** Currently both tag types use a single MLflow tag key (`label`), so setting one overwrites the other. The fix changes each tag type to its own key (`eval='true'`, `align='true'`) so they coexist. This also fixes the `start-evaluation` endpoint which actively sabotages itself by resyncing `align` tags before searching for `eval` tags.

**Success Criteria Targeted:**
- JUDGE-SC-1: "Auto-evaluation runs in background when annotation phase starts" (JUDGE_EVALUATION_SPEC)
- JUDGE-SC-2: "Results appear in Judge Tuning page" (JUDGE_EVALUATION_SPEC)
- JUDGE-SC-3: "Re-evaluate loads registered judge with aligned instructions" (JUDGE_EVALUATION_SPEC)
- JUDGE-SC-4: "Uses same model as initial auto-evaluation" (JUDGE_EVALUATION_SPEC)
- ANNOTATION-SC-1: "MLflow trace tagged with `label: "align"` and `workshop_id` on annotation" (ANNOTATION_SPEC)

**Invariants Restored:**
1. `eval` and `align` tags coexist independently on the same trace
2. `eval` tag persists from begin-annotation through re-evaluation
3. `align` tag is additive per annotation, does not destroy `eval`
4. Manual eval, auto-eval, re-eval, and alignment all find their traces reliably

---

## File Map

### Modified Files

| File | Change |
|------|--------|
| `server/services/database_service.py` | `tag_traces_for_evaluation()`: change `key='label', value=tag_type` → `key=tag_type, value='true'`; `sync_annotation_to_mlflow()`: change `'label': 'align'` → `'align': 'true'` |
| `server/services/alignment_service.py` | `_search_tagged_traces()`: change filter from `tags.label = '{tag_type}'` → `tags.{tag_type} = 'true'` |
| `server/routers/workshops.py` | Update polling filter in begin-annotation background thread; fix `start-evaluation` tag_type default |
| `tests/unit/services/test_evaluation_tag_overwrite.py` | Update assertions for new tag format; add coexistence test |
| `tests/contract/test_mlflow_contracts.py` | Update `set_trace_tag` contract test if it hardcodes `key="label"` |

---

### Task 1: Fix Tag Writers (database_service.py)

**Spec criteria:** ANNOTATION-SC-1, JUDGE-SC-1
**Files:**
- Modify: `server/services/database_service.py`
- Test: `tests/unit/services/test_evaluation_tag_overwrite.py`

- [ ] **Step 1: Write failing test — eval and align tags use independent keys**

```python
@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Auto-evaluation runs in background when annotation phase starts")
@pytest.mark.unit
def test_tag_traces_for_evaluation_uses_dedicated_key():
    """tag_traces_for_evaluation sets key=tag_type, value='true' (not key='label')."""
    from unittest.mock import MagicMock, patch, call

    db_service = _make_db_service_with_traces()

    with patch("mlflow.set_trace_tag") as mock_set_tag, \
         patch("mlflow.set_tracking_uri"), \
         patch("mlflow.set_experiment"):
        db_service.tag_traces_for_evaluation("w1", ["t1"], tag_type="eval")

    # Should set key='eval', value='true' — NOT key='label', value='eval'
    eval_calls = [c for c in mock_set_tag.call_args_list if c.kwargs.get('key') == 'eval']
    assert len(eval_calls) == 1
    assert eval_calls[0].kwargs['value'] == 'true'
    label_calls = [c for c in mock_set_tag.call_args_list if c.kwargs.get('key') == 'label']
    assert len(label_calls) == 0
```

- [ ] **Step 2: Run test to verify it fails**

Run: `just test-server -- tests/unit/services/test_evaluation_tag_overwrite.py -k test_tag_traces_for_evaluation_uses_dedicated_key`
Expected: FAIL — currently sets `key='label'`

- [ ] **Step 3: Fix `tag_traces_for_evaluation` in database_service.py**

Change line ~2514-2516:
```python
# BEFORE
def _tag_trace(_tid=mlflow_trace_id, _tag=tag_type, _wid=workshop_id, _set_tag=set_trace_tag):
    _set_tag(trace_id=_tid, key='label', value=_tag)
    _set_tag(trace_id=_tid, key='workshop_id', value=_wid)
    return True

# AFTER
def _tag_trace(_tid=mlflow_trace_id, _tag=tag_type, _wid=workshop_id, _set_tag=set_trace_tag):
    _set_tag(trace_id=_tid, key=_tag, value='true')
    _set_tag(trace_id=_tid, key='workshop_id', value=_wid)
    return True
```

Also update the log message at ~2526:
```python
# BEFORE
logger.debug(f"Tagged trace {mlflow_trace_id} with label={tag_type}")
# AFTER
logger.debug(f"Tagged trace {mlflow_trace_id} with {tag_type}=true")
```

- [ ] **Step 4: Fix `sync_annotation_to_mlflow` / `log_annotation_to_mlflow_sync` in database_service.py**

Change line ~2012-2016:
```python
# BEFORE
tags = {
    'label': 'align',
    'workshop_id': workshop_id,
}

# AFTER
tags = {
    'align': 'true',
    'workshop_id': workshop_id,
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `just test-server -- tests/unit/services/test_evaluation_tag_overwrite.py -k test_tag_traces_for_evaluation_uses_dedicated_key`
Expected: PASS

- [ ] **Step 6: Commit**

```bash
git add server/services/database_service.py tests/unit/services/test_evaluation_tag_overwrite.py
git commit -m "fix: use dedicated MLflow tag keys for eval and align

eval and align previously shared a single 'label' key, causing
mutual destruction. Now eval sets key='eval' and align sets
key='align', so both tags coexist on the same trace."
```

---

### Task 2: Fix Tag Reader (alignment_service.py)

**Spec criteria:** JUDGE-SC-1, JUDGE-SC-3
**Files:**
- Modify: `server/services/alignment_service.py`
- Test: `tests/unit/services/test_evaluation_tag_overwrite.py`

- [ ] **Step 1: Write failing test — search filter uses dedicated key**

```python
@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Re-evaluate loads registered judge with aligned instructions")
@pytest.mark.unit
def test_search_tagged_traces_uses_dedicated_eval_key():
    """_search_tagged_traces filters on tags.eval='true', not tags.label='eval'."""
    mock_db_service = MagicMock()
    service = AlignmentService(mock_db_service)
    mock_config = MagicMock()
    mock_config.experiment_id = "exp-123"

    with patch("mlflow.search_traces", return_value=pd.DataFrame()) as mock_search:
        service._search_tagged_traces(mock_config, "w1", tag_type="eval")

        filter_string = mock_search.call_args.kwargs.get("filter_string", "")
        assert "tags.eval = 'true'" in filter_string
        assert "tags.label" not in filter_string


@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.unit
def test_search_tagged_traces_uses_dedicated_align_key():
    """_search_tagged_traces with tag_type='align' filters on tags.align='true'."""
    mock_db_service = MagicMock()
    service = AlignmentService(mock_db_service)
    mock_config = MagicMock()
    mock_config.experiment_id = "exp-123"

    with patch("mlflow.search_traces", return_value=pd.DataFrame()) as mock_search:
        service._search_tagged_traces(mock_config, "w1", tag_type="align")

        filter_string = mock_search.call_args.kwargs.get("filter_string", "")
        assert "tags.align = 'true'" in filter_string
        assert "tags.label" not in filter_string
```

- [ ] **Step 2: Run tests to verify they fail**

Run: `just test-server -- tests/unit/services/test_evaluation_tag_overwrite.py -k "dedicated_eval_key or dedicated_align_key"`
Expected: FAIL

- [ ] **Step 3: Fix `_search_tagged_traces` filter**

Change line ~136-139 in alignment_service.py:
```python
# BEFORE
filter_parts = [
    f"tags.label = '{tag_type}'",
    f"tags.workshop_id = '{workshop_id}'",
]

# AFTER
filter_parts = [
    f"tags.{tag_type} = 'true'",
    f"tags.workshop_id = '{workshop_id}'",
]
```

- [ ] **Step 4: Run tests to verify they pass**

Run: `just test-server -- tests/unit/services/test_evaluation_tag_overwrite.py`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add server/services/alignment_service.py tests/unit/services/test_evaluation_tag_overwrite.py
git commit -m "fix: update trace search filter to use dedicated tag keys"
```

---

### Task 3: Fix Polling Filter and start-evaluation (workshops.py)

**Spec criteria:** JUDGE-SC-1, JUDGE-SC-2
**Files:**
- Modify: `server/routers/workshops.py`

- [ ] **Step 1: Fix polling filter in begin-annotation background thread**

Change line ~1553 in workshops.py:
```python
# BEFORE
filter_str = f"tags.label = 'eval' AND tags.workshop_id = '{workshop_id}'"

# AFTER
filter_str = f"tags.eval = 'true' AND tags.workshop_id = '{workshop_id}'"
```

- [ ] **Step 2: Audit `start-evaluation` endpoint for tag_type**

The `start-evaluation` endpoint (line ~3857) calls `run_evaluation_with_answer_sheet()` without specifying `tag_type`, defaulting to `'eval'`. But it also calls `resync_annotations_to_mlflow()` first. With separate keys this is no longer self-sabotaging — resync sets `align='true'` which no longer destroys `eval`. No code change needed here, the tag separation fixes this automatically.

- [ ] **Step 3: Run existing evaluation tests**

Run: `just test-server-spec JUDGE_EVALUATION_SPEC`
Expected: All PASS

- [ ] **Step 4: Commit**

```bash
git add server/routers/workshops.py
git commit -m "fix: update MLflow polling filter to use dedicated eval tag key"
```

---

### Task 4: Update Existing Tests

**Spec criteria:** All
**Files:**
- Modify: `tests/unit/services/test_evaluation_tag_overwrite.py`
- Modify: `tests/contract/test_mlflow_contracts.py` (if needed)

- [ ] **Step 1: Update the original bug reproduction test**

The existing `test_search_tagged_traces_returns_empty_after_align_overwrite` and `test_run_evaluation_yields_error_when_no_eval_tagged_traces` were written to reproduce the old bug. Update them to verify the fix:
- `test_search_tagged_traces_returns_empty_after_align_overwrite` → rename to `test_eval_and_align_tags_coexist` and verify that setting `align='true'` does NOT prevent finding `eval='true'`
- Keep `test_run_evaluation_yields_error_when_no_eval_tagged_traces` but update the filter assertion from `tags.label = 'eval'` to `tags.eval = 'true'`

- [ ] **Step 2: Add coexistence integration-style test**

```python
@pytest.mark.spec("JUDGE_EVALUATION_SPEC")
@pytest.mark.req("Auto-evaluation runs in background when annotation phase starts")
@pytest.mark.unit
def test_eval_tag_survives_align_tag():
    """Setting align='true' does not destroy eval='true' — the root cause fix.

    With separate keys, both tags coexist:
    - tags.eval = 'true' (set at begin-annotation)
    - tags.align = 'true' (set at each annotation)
    - Neither overwrites the other
    """
    # This test verifies the architectural invariant:
    # searching for eval still works after align has been set
    mock_db_service = MagicMock()
    service = AlignmentService(mock_db_service)
    mock_config = MagicMock()
    mock_config.experiment_id = "exp-123"

    # Simulate: traces have BOTH eval and align tags (the fixed state)
    trace_df = pd.DataFrame({"trace_id": ["tr-1", "tr-2"]})

    with patch("mlflow.search_traces", return_value=trace_df) as mock_search:
        result = service._search_tagged_traces(mock_config, "w1", tag_type="eval")
        assert len(result) == 2

        # Verify filter uses dedicated key
        filter_string = mock_search.call_args.kwargs["filter_string"]
        assert "tags.eval = 'true'" in filter_string
```

- [ ] **Step 3: Check contract test for hardcoded `key="label"`**

Review `tests/contract/test_mlflow_contracts.py` line ~318. If it tests `set_trace_tag(key="label", ...)` as a generic contract test for the MLflow API shape, leave it — it's testing MLflow's API, not our usage. Only update if it's testing our tagging logic specifically.

- [ ] **Step 4: Run all tests**

Run: `just test-server-spec JUDGE_EVALUATION_SPEC`
Run: `just test-server -- tests/contract/test_mlflow_contracts.py`
Expected: All PASS

- [ ] **Step 5: Commit**

```bash
git add tests/unit/services/test_evaluation_tag_overwrite.py
git commit -m "test: update tag overwrite tests for dedicated key separation fix"
```

---

### Task 5 (Final): Lint and Verify Spec Coverage

- [ ] **Step 1: Run linting**

Run: `just ui-lint` (frontend unchanged, but verify)
Expected: No new errors

- [ ] **Step 2: Run spec coverage**

Run: `just spec-coverage --specs JUDGE_EVALUATION_SPEC ANNOTATION_SPEC`
Expected: JUDGE_EVALUATION_SPEC stays at 100%, ANNOTATION_SPEC stays at 61%+

- [ ] **Step 3: Run full test suite for affected specs**

Run: `just test-spec JUDGE_EVALUATION_SPEC`
Expected: All tests PASS

- [ ] **Step 4: Run contract tests**

Run: `just test-contract`
Expected: All PASS

- [ ] **Step 5: Update implementation log on spec**

Add to JUDGE_EVALUATION_SPEC.md:

```markdown
## Implementation Log

| Date | Plan | Status | Summary |
|------|------|--------|---------|
| 2026-03-13 | [Trace Tag Key Separation](../.claude/plans/2026-03-13-trace-tag-key-separation.md) | planned | Fix eval/align tag mutual destruction by using dedicated MLflow tag keys |
```
