# Draft-to-Rubric Creation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When the facilitator clicks "Create Rubric", a new backend endpoint converts draft rubric items (grouped during discovery) into a saved rubric, then the frontend navigates to the rubric creation page where it's loaded.

**Architecture:** New `POST /workshops/{id}/create-rubric-from-draft` endpoint in the discovery router reads draft items, maps groups → rubric questions using the existing delimiter format, and delegates to `DatabaseService.create_rubric()`. Frontend adds a mutation hook and updates the sidebar button handler to call the endpoint before navigating.

**Tech Stack:** Python/FastAPI (backend), React/TypeScript with React Query (frontend), pytest + vitest (tests)

---

### Task 1: Backend — Service method `create_rubric_from_draft`

**Files:**
- Modify: `server/services/discovery_service.py:1597` (after `apply_draft_rubric_groups`)
- Test: `tests/unit/services/test_draft_rubric_items.py`

**Step 1: Write the failing test**

Add to `tests/unit/services/test_draft_rubric_items.py`:

```python
class TestCreateRubricFromDraft:
    """@req DI-S3-RUBRIC-SEED: Draft rubric items seed initial rubric."""

    @pytest.mark.req("Grouped draft items become rubric questions")
    def test_grouped_items_become_questions(self, db_service, workshop):
        """@req DI-S3-GROUP-TO-Q: Each group becomes one rubric question."""
        # Create draft items in two groups
        item1 = db_service.add_draft_rubric_item(
            workshop.id,
            DraftRubricItemCreate(text="Accuracy matters", source_type="finding"),
            promoted_by="facilitator",
        )
        db_service.update_draft_rubric_item(item1.id, DraftRubricItemUpdate(group_id="g1", group_name="Response Quality"))
        item2 = db_service.add_draft_rubric_item(
            workshop.id,
            DraftRubricItemCreate(text="Completeness check", source_type="finding"),
            promoted_by="facilitator",
        )
        db_service.update_draft_rubric_item(item2.id, DraftRubricItemUpdate(group_id="g1", group_name="Response Quality"))
        item3 = db_service.add_draft_rubric_item(
            workshop.id,
            DraftRubricItemCreate(text="Tone is friendly", source_type="disagreement"),
            promoted_by="facilitator",
        )
        db_service.update_draft_rubric_item(item3.id, DraftRubricItemUpdate(group_id="g2", group_name="Tone"))

        svc = DiscoveryService(db_service.db)
        rubric = svc.create_rubric_from_draft(workshop.id, created_by="facilitator")

        assert rubric is not None
        assert "Response Quality" in rubric.question
        assert "Tone" in rubric.question
        assert "Accuracy matters" in rubric.question
        assert "Completeness check" in rubric.question
        assert "Tone is friendly" in rubric.question
        assert "|||QUESTION_SEPARATOR|||" in rubric.question

    @pytest.mark.req("Ungrouped draft items each become a question")
    def test_ungrouped_items_each_become_question(self, db_service, workshop):
        """@req DI-S3-UNGROUPED-Q: Ungrouped items become individual questions."""
        db_service.add_draft_rubric_item(
            workshop.id,
            DraftRubricItemCreate(text="Factual accuracy", source_type="finding"),
            promoted_by="facilitator",
        )
        db_service.add_draft_rubric_item(
            workshop.id,
            DraftRubricItemCreate(text="Code quality", source_type="finding"),
            promoted_by="facilitator",
        )

        svc = DiscoveryService(db_service.db)
        rubric = svc.create_rubric_from_draft(workshop.id, created_by="facilitator")

        assert "Factual accuracy" in rubric.question
        assert "Code quality" in rubric.question
        # Each ungrouped item is a separate question
        assert rubric.question.count("|||QUESTION_SEPARATOR|||") >= 1

    @pytest.mark.req("Empty draft items raises error")
    def test_no_items_raises_400(self, db_service, workshop):
        """@req DI-S3-EMPTY-GUARD: Cannot create rubric from empty draft."""
        svc = DiscoveryService(db_service.db)
        with pytest.raises(HTTPException) as exc_info:
            svc.create_rubric_from_draft(workshop.id, created_by="facilitator")
        assert exc_info.value.status_code == 400

    @pytest.mark.req("Mixed grouped and ungrouped items")
    def test_mixed_grouped_and_ungrouped(self, db_service, workshop):
        """@req DI-S3-MIXED: Groups appear first, ungrouped items after."""
        item1 = db_service.add_draft_rubric_item(
            workshop.id,
            DraftRubricItemCreate(text="Grouped item", source_type="finding"),
            promoted_by="facilitator",
        )
        db_service.update_draft_rubric_item(item1.id, DraftRubricItemUpdate(group_id="g1", group_name="Quality"))
        db_service.add_draft_rubric_item(
            workshop.id,
            DraftRubricItemCreate(text="Solo item", source_type="finding"),
            promoted_by="facilitator",
        )

        svc = DiscoveryService(db_service.db)
        rubric = svc.create_rubric_from_draft(workshop.id, created_by="facilitator")

        # Quality group should come before solo item
        quality_pos = rubric.question.index("Quality")
        solo_pos = rubric.question.index("Solo item")
        assert quality_pos < solo_pos
```

**Step 2: Run test to verify it fails**

Run: `just test-server -k TestCreateRubricFromDraft -v`
Expected: FAIL with `AttributeError: 'DiscoveryService' object has no attribute 'create_rubric_from_draft'`

**Step 3: Write the implementation**

Add to `server/services/discovery_service.py` after `apply_draft_rubric_groups` (line ~1603):

```python
    def create_rubric_from_draft(self, workshop_id: str, created_by: str) -> "Rubric":
        """Convert draft rubric items into a saved rubric.

        Groups become questions (group_name → title, item texts → description).
        Ungrouped items each become their own question.
        """
        from server.models import Rubric, RubricCreate

        self._get_workshop_or_404(workshop_id)
        items = self.db_service.get_draft_rubric_items(workshop_id)

        if not items:
            raise HTTPException(
                status_code=400,
                detail="No draft rubric items exist. Promote findings before creating a rubric.",
            )

        QUESTION_DELIMITER = "|||QUESTION_SEPARATOR|||"
        JUDGE_TYPE_DELIMITER = "|||JUDGE_TYPE|||"

        # Separate grouped vs ungrouped
        grouped: dict[str, list[DraftRubricItem]] = {}
        group_names: dict[str, str] = {}
        ungrouped: list[DraftRubricItem] = []

        for item in items:
            if item.group_id and item.group_name:
                grouped.setdefault(item.group_id, []).append(item)
                group_names[item.group_id] = item.group_name
            else:
                ungrouped.append(item)

        question_parts: list[str] = []

        # Grouped items first (sorted by group name)
        for gid in sorted(grouped, key=lambda g: group_names[g]):
            title = group_names[gid]
            description = "\n".join(f"- {i.text}" for i in grouped[gid])
            question_parts.append(f"{title}: {description}{JUDGE_TYPE_DELIMITER}likert")

        # Ungrouped items after
        for item in ungrouped:
            question_parts.append(f"{item.text}: {JUDGE_TYPE_DELIMITER}likert")

        question_text = QUESTION_DELIMITER.join(question_parts)

        rubric_data = RubricCreate(
            question=question_text,
            created_by=created_by,
            judge_type="likert",
        )
        return self.db_service.create_rubric(workshop_id, rubric_data)
```

Also add `Rubric` to the imports at the top of `discovery_service.py` if not already present — check the existing imports from `server.models`.

**Step 4: Run test to verify it passes**

Run: `just test-server -k TestCreateRubricFromDraft -v`
Expected: All 4 tests PASS

**Step 5: Commit**

```bash
git add server/services/discovery_service.py tests/unit/services/test_draft_rubric_items.py
git commit -m "feat: add create_rubric_from_draft service method"
```

---

### Task 2: Backend — Router endpoint

**Files:**
- Modify: `server/routers/discovery.py:505` (after `apply-groups` endpoint)
- Test: `tests/unit/services/test_draft_rubric_items.py` (or a new integration test)

**Step 1: Write the failing test**

Add an integration-level test in `tests/unit/services/test_draft_rubric_items.py` (or the existing test file — stays in unit because it uses the service directly but verifies the full chain):

```python
class TestCreateRubricFromDraftEndpoint:
    """@req DI-S3-RUBRIC-SEED: Endpoint creates rubric from draft items."""

    @pytest.mark.req("Endpoint returns rubric")
    def test_endpoint_returns_rubric(self, db_service, workshop):
        """@req DI-S3-ENDPOINT: POST create-rubric-from-draft returns Rubric."""
        item = db_service.add_draft_rubric_item(
            workshop.id,
            DraftRubricItemCreate(text="Test criterion", source_type="finding"),
            promoted_by="facilitator",
        )

        svc = DiscoveryService(db_service.db)
        rubric = svc.create_rubric_from_draft(workshop.id, created_by="facilitator")

        assert rubric.workshop_id == workshop.id
        assert rubric.created_by == "facilitator"
        assert "Test criterion" in rubric.question
```

**Step 2: Run test to verify it passes** (should pass from Task 1)

Run: `just test-server -k TestCreateRubricFromDraftEndpoint -v`
Expected: PASS

**Step 3: Add the router endpoint**

Add to `server/routers/discovery.py` after the `apply-groups` endpoint (line ~506):

```python
class CreateRubricFromDraftRequest(BaseModel):
    """Request to create a rubric from draft items."""
    created_by: str


@router.post("/{workshop_id}/draft-rubric-items/create-rubric", response_model=Rubric)
async def create_rubric_from_draft(
    workshop_id: str,
    request: CreateRubricFromDraftRequest,
    db: Session = Depends(get_db),
) -> Rubric:
    """Create a rubric from draft rubric items.

    Groups become rubric questions (group_name → title, item texts → description).
    Ungrouped items each become their own question. All default to LIKERT judge type.
    """
    svc = DiscoveryService(db)
    return svc.create_rubric_from_draft(workshop_id, created_by=request.created_by)
```

Add `Rubric` to the imports at the top of `discovery.py`:

```python
from server.models import (
    ...
    Rubric,
    ...
)
```

**Step 4: Run full test suite**

Run: `just test-server -k "draft_rubric" -v`
Expected: All tests PASS

**Step 5: Commit**

```bash
git add server/routers/discovery.py
git commit -m "feat: add create-rubric-from-draft endpoint"
```

---

### Task 3: Frontend — Mutation hook

**Files:**
- Modify: `client/src/hooks/useWorkshopApi.ts:1030` (after `useCreateDraftRubricItem`)
- Test: No separate test needed — covered by integration in Task 4

**Step 1: Add the mutation hook**

Add to `client/src/hooks/useWorkshopApi.ts` after the existing draft rubric hooks (around line 1050):

```typescript
export function useCreateRubricFromDraft(workshopId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (createdBy: string) => {
      const response = await fetch(`/api/workshops/${workshopId}/draft-rubric-items/create-rubric`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ created_by: createdBy }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to create rubric' }));
        throw new Error(error.detail || 'Failed to create rubric');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rubric(workshopId) });
    },
  });
}
```

**Step 2: Verify lint passes**

Run: `just ui-lint`
Expected: No errors

**Step 3: Commit**

```bash
git add client/src/hooks/useWorkshopApi.ts
git commit -m "feat: add useCreateRubricFromDraft mutation hook"
```

---

### Task 4: Frontend — Wire up "Create Rubric" button

**Files:**
- Modify: `client/src/components/discovery/FacilitatorDiscoveryWorkspace.tsx:1-255`

**Step 1: Update the component**

In `FacilitatorDiscoveryWorkspace.tsx`:

1. Add `useCreateRubricFromDraft` to the imports (line ~10):

```typescript
import {
  useAllTraces,
  useFacilitatorDiscoveryFeedback,
  useDiscoveryAnalyses,
  useRunDiscoveryAnalysis,
  useDraftRubricItems,
  useCreateDraftRubricItem,
  useDeleteDraftRubricItem,
  useCreateRubricFromDraft,
  useWorkshop,
  useMLflowConfig,
  useUpdateDiscoveryModel,
} from '@/hooks/useWorkshopApi';
```

2. Add the mutation (after `deleteDraftItem` around line 46):

```typescript
const createRubricFromDraft = useCreateRubricFromDraft(workshopId!);
```

3. Create a handler and replace the `onCreateRubric` prop (replace line 249):

```typescript
const handleCreateRubric = useCallback(async () => {
  try {
    await createRubricFromDraft.mutateAsync(user?.id || '');
    onNavigate('rubric');
  } catch (error) {
    toast.error(error instanceof Error ? error.message : 'Failed to create rubric from draft');
  }
}, [createRubricFromDraft, user?.id, onNavigate]);
```

4. Pass the handler to the sidebar (replace line 249):

```tsx
onCreateRubric={handleCreateRubric}
```

**Step 2: Verify lint passes**

Run: `just ui-lint`
Expected: No errors

**Step 3: Verify unit tests pass**

Run: `just ui-test-unit`
Expected: All pass (existing tests should still work since `onCreateRubric` is still called the same way)

**Step 4: Commit**

```bash
git add client/src/components/discovery/FacilitatorDiscoveryWorkspace.tsx
git commit -m "feat: wire Create Rubric button to create-rubric-from-draft endpoint"
```

---

### Task 5: Vitest — Unit test for the button behavior

**Files:**
- Create or modify: `client/src/components/discovery/DraftRubricSidebar.test.tsx`

**Step 1: Verify existing tests pass**

Run: `just ui-test-unit -- --reporter=verbose`
Expected: All pass

**Step 2: No new test needed if existing "renders Create Rubric button" test still passes**

The existing test in `DraftRubricSidebar.test.tsx:48` already verifies the button renders. The actual API call logic lives in `FacilitatorDiscoveryWorkspace` which calls `handleCreateRubric` — that's integration-level and best tested via E2E.

**Step 3: Commit** (if any test changes were made)

```bash
git add client/src/components/discovery/DraftRubricSidebar.test.tsx
git commit -m "test: verify Create Rubric button behavior"
```

---

### Task 6: E2E — End-to-end test for draft → rubric flow

**Files:**
- Modify: `client/tests/e2e/discovery-draft-rubric-grouping.spec.ts` (add a new test case)

**Step 1: Add E2E test**

Add a new test to the existing spec file:

```typescript
test('Create Rubric from grouped draft items creates rubric with group-based questions', async ({
  page,
}) => {
  const scenario = new TestScenario(page);
  await scenario.createWorkshop();
  await scenario.loginAs(scenario.facilitator);
  await scenario.beginDiscovery(2);

  const api = draftRubricApi(scenario.page, scenario.workshop.id);
  const traceIds = scenario.traces.map((t) => t.id);

  // Pre-create items and apply groups
  const item1 = await api.create({
    text: 'Accuracy is important',
    source_type: 'finding',
    source_trace_ids: [traceIds[0]],
    promoted_by: scenario.facilitator.id,
  });
  const item2 = await api.create({
    text: 'Completeness matters',
    source_type: 'finding',
    source_trace_ids: [traceIds[1]],
    promoted_by: scenario.facilitator.id,
  });

  // Apply groups
  await page.request.post(
    `${API_URL}/workshops/${scenario.workshop.id}/draft-rubric-items/apply-groups`,
    { data: { groups: [{ name: 'Response Quality', item_ids: [item1.id, item2.id] }] } },
  );

  // Create rubric from draft
  const rubricResp = await page.request.post(
    `${API_URL}/workshops/${scenario.workshop.id}/draft-rubric-items/create-rubric`,
    { data: { created_by: scenario.facilitator.id } },
  );
  expect(rubricResp.ok()).toBe(true);

  const rubric = await rubricResp.json();
  expect(rubric.question).toContain('Response Quality');
  expect(rubric.question).toContain('Accuracy is important');
  expect(rubric.question).toContain('Completeness matters');
});
```

**Step 2: Run E2E test**

Run: `just e2e headless --grep "Create Rubric from grouped"`
Expected: PASS

**Step 3: Commit**

```bash
git add client/tests/e2e/discovery-draft-rubric-grouping.spec.ts
git commit -m "test(e2e): verify create-rubric-from-draft endpoint"
```
