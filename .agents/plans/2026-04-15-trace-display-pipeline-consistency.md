# Trace Display Pipeline Consistency Fix

**Spec:** [TRACE_DISPLAY_SPEC](../../specs/TRACE_DISPLAY_SPEC.md)
**Goal:** Ensure all backend services that consume trace input/output apply the same span filter + JSONPath pipeline as the TraceViewer.
**Architecture:** Extract a shared `get_display_text(trace, workshop)` helper into `server/utils/trace_display_utils.py`. Each affected service calls this instead of reading `trace.input`/`trace.output` directly. The helper applies span filter first, then JSONPath — same order as the existing correct implementation in `discovery_analysis_service.py`.
**Success Criteria Targeted:**
- SC-1: All backend services that consume trace input/output apply the same span filter and JSONPath pipeline as the TraceViewer

---

## File Map

### New Files
| File | Responsibility |
|------|----------------|
| `server/utils/trace_display_utils.py` | Shared `get_display_text()` helper |

### Modified Files
| File | Change |
|------|--------|
| `server/services/judge_service.py` | Use `get_display_text()` in `evaluate_prompt`, `evaluate_prompt_direct`, and `export_judge` |
| `server/services/discovery_service.py` | Use `get_display_text()` in `get_discovery_questions` (line 330-331) and `_detect_disagreements` (line 1370-1371) |
| `server/services/discovery_analysis_service.py` | Replace inline pipeline with `get_display_text()` call |
| `tests/unit/services/test_trace_display_pipeline_consistency.py` | Add tests for judge_service and discovery_service; update structural check |

---

### Task 1: Create shared helper

**Spec criteria:** SC-1
**Files:**
- Create: `server/utils/trace_display_utils.py`
- Test: `tests/unit/services/test_trace_display_pipeline_consistency.py`

- [ ] **Step 1: Write the failing test**

Add to the existing `TestTraceDisplayPipelineConsistency` class:

```python
def test_get_display_text_applies_full_pipeline(self):
    """get_display_text applies span filter then JSONPath."""
    from server.utils.trace_display_utils import get_display_text
    from server.models import Trace, Workshop

    workshop = Workshop(
        id="ws", name="test", facilitator_id="f",
        input_jsonpath=INPUT_JSONPATH,
        output_jsonpath=OUTPUT_JSONPATH,
        span_attribute_filter=SPAN_FILTER_CONFIG,
    )
    trace = Trace(
        id="t", input=ROOT_INPUT, output=ROOT_OUTPUT,
        context=TRACE_CONTEXT, trace_metadata={}, mlflow_trace_id="m",
    )
    result_input, result_output = get_display_text(trace, workshop)
    assert result_input == EXPECTED_INPUT
    assert result_output == EXPECTED_OUTPUT

def test_get_display_text_no_config(self):
    """get_display_text returns raw input/output when no filters configured."""
    from server.utils.trace_display_utils import get_display_text
    from server.models import Trace, Workshop

    workshop = Workshop(id="ws", name="test", facilitator_id="f")
    trace = Trace(
        id="t", input=ROOT_INPUT, output=ROOT_OUTPUT,
        context=TRACE_CONTEXT, trace_metadata={}, mlflow_trace_id="m",
    )
    result_input, result_output = get_display_text(trace, workshop)
    assert result_input == ROOT_INPUT
    assert result_output == ROOT_OUTPUT
```

Run: `just test-server -k test_get_display_text`
Expected: FAIL — `get_display_text` not found

- [ ] **Step 2: Implement `get_display_text`**

Create `server/utils/trace_display_utils.py`:

```python
"""Shared trace display pipeline: span filter → JSONPath extraction."""

from __future__ import annotations

from typing import TYPE_CHECKING

from server.utils.jsonpath_utils import apply_jsonpath
from server.utils.span_filter_utils import apply_span_filter

if TYPE_CHECKING:
    from server.models import Trace, Workshop


def get_display_text(trace: Trace, workshop: Workshop | None) -> tuple[str, str]:
    """Apply the span filter + JSONPath pipeline to get display-ready input/output.

    This is the single source of truth for transforming raw trace data into the
    text that the UI shows and that backend services (judges, discovery, etc.)
    should use.

    Order: span attribute filter first, then JSONPath extraction.
    """
    input_text = trace.input or ""
    output_text = trace.output or ""

    if workshop is None:
        return input_text, output_text

    # Step 1: Span attribute filter
    span_input, span_output = apply_span_filter(
        trace.context,
        workshop.span_attribute_filter,
    )
    if span_input is not None:
        input_text = span_input
    if span_output is not None:
        output_text = span_output

    # Step 2: JSONPath extraction
    extracted, ok = apply_jsonpath(input_text, workshop.input_jsonpath)
    if ok:
        input_text = extracted
    extracted, ok = apply_jsonpath(output_text, workshop.output_jsonpath)
    if ok:
        output_text = extracted

    return input_text, output_text
```

- [ ] **Step 3: Run test to verify it passes**

Run: `just test-server -k test_get_display_text`
Expected: PASS

---

### Task 2: Wire into judge_service.py

**Spec criteria:** SC-1
**Files:**
- Modify: `server/services/judge_service.py`
- Test: `tests/unit/services/test_trace_display_pipeline_consistency.py`

- [ ] **Step 1: Write the failing test**

Add to `TestTraceDisplayPipelineConsistency`:

```python
def test_judge_service_applies_pipeline(
    self, test_db, db_service, workshop, trace_with_spans,
):
    """JudgeService passes pipeline-transformed text to the judge, not raw trace data."""
    from unittest.mock import patch, MagicMock
    from server.services.judge_service import JudgeService

    judge_svc = JudgeService(db_service)

    # Create a judge prompt
    from datetime import datetime
    from server.models import JudgePrompt
    prompt = JudgePrompt(
        id="jp-1", workshop_id="ws-pipeline",
        prompt_text="Rate: {input} {output}", version=1,
        few_shot_examples=[], model_name="demo",
        model_parameters={}, created_by="test",
        created_at=datetime.now(), performance_metrics=None,
    )
    db_service.create_judge_prompt(prompt)

    # Create an annotation so evaluation has ground truth
    from server.database import AnnotationDB
    ann = AnnotationDB(
        id="ann-1", workshop_id="ws-pipeline", trace_id="t-1",
        user_id="u-1", rating=3,
    )
    test_db.add(ann)
    test_db.commit()

    # Patch _simulate_judge_rating to capture what input/output it receives
    captured = {}
    original_simulate = judge_svc._simulate_judge_rating
    def spy_simulate(prompt_text, input_text, output_text, human_rating):
        captured["input"] = input_text
        captured["output"] = output_text
        return original_simulate(prompt_text, input_text, output_text, human_rating)

    with patch.object(judge_svc, "_simulate_judge_rating", side_effect=spy_simulate):
        from server.models import JudgeEvaluationRequest
        judge_svc.evaluate_prompt("ws-pipeline", JudgeEvaluationRequest(
            prompt_id="jp-1", trace_ids=["t-1"],
        ))

    assert captured["input"] == EXPECTED_INPUT, (
        f"Judge received raw input '{captured['input']}' instead of pipeline-transformed '{EXPECTED_INPUT}'"
    )
    assert captured["output"] == EXPECTED_OUTPUT, (
        f"Judge received raw output '{captured['output']}' instead of pipeline-transformed '{EXPECTED_OUTPUT}'"
    )
```

Run: `just test-server -k test_judge_service_applies_pipeline`
Expected: FAIL — judge receives raw ROOT_INPUT/ROOT_OUTPUT

- [ ] **Step 2: Implement the fix in judge_service.py**

In `evaluate_prompt`: after fetching traces, fetch the workshop and apply the pipeline.

```python
# At top of file, add import:
from server.utils.trace_display_utils import get_display_text

# In evaluate_prompt, after building trace_objects dict:
workshop = self.db_service.get_workshop(workshop_id)

# In the per-trace loop, replace trace.input/trace.output with:
display_input, display_output = get_display_text(trace, workshop)
# Then pass display_input, display_output to _evaluate_with_mlflow / _simulate_judge_rating
```

Apply same pattern to `evaluate_prompt_direct`.

In `export_judge` (few-shot examples), replace `trace.input`/`trace.output` with pipeline-transformed values:

```python
workshop = self.db_service.get_workshop(workshop_id)
# ... inside the few_shot loop:
display_input, display_output = get_display_text(trace, workshop)
few_shot_examples.append({
    "input": display_input,
    "output": display_output,
    ...
})
```

- [ ] **Step 3: Run test to verify it passes**

Run: `just test-server -k test_judge_service_applies_pipeline`
Expected: PASS

---

### Task 3: Wire into discovery_service.py

**Spec criteria:** SC-1
**Files:**
- Modify: `server/services/discovery_service.py`
- Test: `tests/unit/services/test_trace_display_pipeline_consistency.py`

- [ ] **Step 1: Implement the fix**

In `get_discovery_questions` (around line 330):

```python
from server.utils.trace_display_utils import get_display_text

# Fetch workshop for display pipeline
workshop = self.db_service.get_workshop(workshop_id)
display_input, display_output = get_display_text(trace, workshop)

# Replace trace.input/trace.output with display_input/display_output:
trace_input=self._trim(display_input, 2000),
trace_output=self._trim(display_output, 2000),
```

In `_detect_disagreements` (around line 1370), same pattern:

```python
workshop = self.db_service.get_workshop(workshop_id)
display_input, display_output = get_display_text(trace, workshop)
trace_input=self._trim(display_input, 1000),
trace_output=self._trim(display_output, 1000),
```

Also fix the demo data generator (line 882) which reads `trace.output` for heuristic text — this is less critical since it's demo-only, but should be consistent.

- [ ] **Step 2: Run existing tests**

Run: `just test-server -k discovery`
Expected: PASS (no regressions)

---

### Task 4: Refactor discovery_analysis_service.py to use shared helper

**Spec criteria:** SC-1
**Files:**
- Modify: `server/services/discovery_analysis_service.py`

- [ ] **Step 1: Replace inline pipeline with `get_display_text`**

Replace lines 162-176 with:

```python
from server.utils.trace_display_utils import get_display_text

# Build a lightweight Workshop-like object or fetch the actual one
# (workshop is already fetched at line 148)
display_input, display_output = get_display_text(trace_obj, workshop_obj)
# where trace_obj and workshop_obj are the Pydantic models from db_service
```

Note: `discovery_analysis_service` currently operates on DB models, but `get_display_text` expects Pydantic `Trace`/`Workshop` models. Verify the attribute interface matches (both have `.input`, `.output`, `.context`, `.input_jsonpath`, `.output_jsonpath`, `.span_attribute_filter`). If not, the helper should accept a duck-typed interface or the service should pass the fetched Pydantic models.

- [ ] **Step 2: Run existing tests to verify no regression**

Run: `just test-server -k test_trace_display_pipeline_consistency`
Expected: All existing tests PASS

---

### Task 5: Update structural test and verify

**Spec criteria:** SC-1
**Files:**
- Modify: `tests/unit/services/test_trace_display_pipeline_consistency.py`

- [ ] **Step 1: Update structural import check**

Update `test_all_consumers_call_apply_span_filter_and_apply_jsonpath` to include the new consumers:

```python
consumer_modules = [
    "server.routers.workshops",
    "server.services.discovery_analysis_service",
    "server.services.judge_service",
    "server.services.discovery_service",
]
```

Alternatively, update this test to check for `get_display_text` imports instead, since that's now the canonical way to apply the pipeline.

- [ ] **Step 2: Run full consistency test suite**

Run: `just test-server -k test_trace_display_pipeline_consistency`
Expected: All PASS

---

### Task 6 (Final): Lint and Verify

- [ ] **Step 1: Run linting**

Run: `just lint` (or equivalent)
Expected: No errors

- [ ] **Step 2: Run full test suite for the spec**

Run: `just test-server-spec TRACE_DISPLAY_SPEC`
Expected: All tests PASS

- [ ] **Step 3: Run spec coverage**

Run: `just spec-coverage --specs TRACE_DISPLAY_SPEC`
Expected: Coverage remains 100%
