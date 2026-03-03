# Finding-to-Draft Transition Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** When clicking "Add to Draft" on a discovery finding, the finding collapses out of the feed with animation, a sonner undo toast appears, and the new sidebar item highlights on arrival.

**Architecture:** CSS-only transitions handle the collapse (max-height/opacity) and arrival highlight (@keyframes). State managed in `FacilitatorDiscoveryWorkspace` via `promotedKeys` Set (already exists). Undo via sonner toast action that deletes the newly created draft item and removes the key.

**Tech Stack:** React, TypeScript, Tailwind CSS, sonner (already installed)

---

### Task 1: Add CSS transition classes to index.css

**Files:**
- Modify: `client/src/index.css` (append after line 200)

**Step 1: Add the finding-item transition and draft-arrive keyframes**

Append to `client/src/index.css` after the scrollbar-thin styles:

```css
/* Discovery: finding collapse-out transition */
.finding-item {
  max-height: 500px;
  opacity: 1;
  transition: max-height 300ms ease-out, opacity 200ms ease-out,
              padding 300ms ease-out, margin 300ms ease-out;
  overflow: hidden;
}
.finding-item.promoted-collapsing {
  max-height: 0;
  opacity: 0;
  padding-top: 0;
  padding-bottom: 0;
  margin-top: 0;
  margin-bottom: 0;
}

/* Discovery: draft sidebar item arrival highlight */
@keyframes draft-arrive {
  0% { background-color: rgb(219 234 254); }
  100% { background-color: transparent; }
}
.draft-item-new {
  animation: draft-arrive 1.2s ease-out;
}
```

**Step 2: Verify lint passes**

Run: `just ui-lint`
Expected: PASS (no errors)

**Step 3: Commit**

```bash
git add client/src/index.css
git commit -m "feat: add CSS transition classes for finding-to-draft animation"
```

---

### Task 2: Upgrade promotedKeys state and handlePromote in FacilitatorDiscoveryWorkspace

**Files:**
- Modify: `client/src/components/discovery/FacilitatorDiscoveryWorkspace.tsx`

**Step 1: Change promotedKeys from static Set to useState + add delete hook + undo ref**

In `FacilitatorDiscoveryWorkspace.tsx`, make these changes:

1. Add `useRef` and `useCallback` to the React import (line 1):
```typescript
import React, { useState, useMemo, useRef, useCallback } from 'react';
```

2. Add `useDeleteDraftRubricItem` to the hook import (line 10, between `useCreateDraftRubricItem` and `useWorkshop`):
```typescript
  useDeleteDraftRubricItem,
```

3. Replace the static Set on line 47:
```typescript
// OLD:
const [promotedKeys] = useState<Set<string>>(new Set());

// NEW:
const [promotedKeys, setPromotedKeys] = useState<Set<string>>(new Set());
```

4. Add the delete mutation and undo ref after the `updateModelMutation` line (after line 44):
```typescript
const deleteDraftItem = useDeleteDraftRubricItem(workshopId!);
const undoItemRef = useRef<Map<string, string>>(new Map()); // key → draft item id
```

**Step 2: Rewrite handlePromote to add key, call API, show undo toast**

Replace `handlePromote` (lines 130-145) with:

```typescript
const handlePromote = useCallback((payload: PromotePayload & { key: string }) => {
  // 1. Add key to promoted set → triggers CSS collapse
  setPromotedKeys((prev) => new Set(prev).add(payload.key));

  // 2. Create draft item via API
  createDraftItem.mutate(
    {
      text: payload.text,
      source_type: payload.source_type,
      source_trace_ids: payload.source_trace_ids,
      promoted_by: user?.id || '',
    },
    {
      onSuccess: (newItem) => {
        // Track the mapping for undo
        undoItemRef.current.set(payload.key, newItem.id);

        // 3. Show toast with undo action
        toast('Added to draft rubric', {
          action: {
            label: 'Undo',
            onClick: () => {
              // Remove from promoted keys → finding re-expands
              setPromotedKeys((prev) => {
                const next = new Set(prev);
                next.delete(payload.key);
                return next;
              });
              // Delete the draft item
              deleteDraftItem.mutate(newItem.id);
              undoItemRef.current.delete(payload.key);
            },
          },
          duration: 5000,
        });
      },
      onError: (err) => {
        // Revert on failure — remove from promoted keys
        setPromotedKeys((prev) => {
          const next = new Set(prev);
          next.delete(payload.key);
          return next;
        });
        toast.error(err.message || 'Failed to promote');
      },
    }
  );
}, [createDraftItem, deleteDraftItem, user?.id]);
```

**Step 3: Verify lint passes**

Run: `just ui-lint`
Expected: PASS

**Step 4: Commit**

```bash
git add client/src/components/discovery/FacilitatorDiscoveryWorkspace.tsx
git commit -m "feat: upgrade promotedKeys to stateful with undo toast support"
```

---

### Task 3: Add key to PromotePayload and apply finding-item class in DiscoveryTraceCard

**Files:**
- Modify: `client/src/components/discovery/DiscoveryTraceCard.tsx`

**Step 1: Add `key` to PromotePayload interface**

Change the `PromotePayload` interface (lines 23-27) to:

```typescript
export interface PromotePayload {
  key: string;
  text: string;
  source_type: 'finding' | 'disagreement';
  source_trace_ids: string[];
}
```

**Step 2: Add finding-item class and pass key in onPromote calls for disagreements**

For each disagreement div (line 158), add the `finding-item` class and the promoted-collapsing conditional:

```typescript
{disagreements?.map((d, i) => {
  const key = `disagreement-${trace.id}-${i}`;
  return (
    <div
      key={key}
      className={`finding-item rounded-lg border border-red-200 bg-red-50 p-3${promotedKeys.has(key) ? ' promoted-collapsing' : ''}`}
    >
      <div className="flex items-center gap-2 mb-1">
        <AlertTriangle className="w-4 h-4 text-red-600" />
        <span className="text-xs font-semibold uppercase text-red-700">High Disagreement</span>
      </div>
      <p className="text-sm text-slate-800 font-medium">{d.summary}</p>
      <p className="text-xs text-slate-600 mt-1">Theme: {d.underlying_theme}</p>
      {d.followup_questions?.length > 0 && (
        <div className="mt-2">
          <span className="text-xs font-semibold text-slate-600">Follow-up Questions</span>
          <ul className="mt-0.5 space-y-0.5">
            {d.followup_questions.map((q, qi) => (
              <li key={qi} className="text-xs text-slate-700 pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-slate-400">{q}</li>
            ))}
          </ul>
        </div>
      )}
      {d.facilitator_suggestions?.length > 0 && (
        <div className="mt-2">
          <span className="text-xs font-semibold text-blue-700">Facilitator Suggestions</span>
          <ul className="mt-0.5 space-y-0.5">
            {d.facilitator_suggestions.map((s, si) => (
              <li key={si} className="text-xs text-blue-800 pl-3 relative before:content-['→'] before:absolute before:left-0 before:text-blue-400">{s}</li>
            ))}
          </ul>
        </div>
      )}
      <Button
        variant="outline"
        size="sm"
        className="mt-2 text-xs"
        disabled={promotedKeys.has(key)}
        onClick={() => onPromote({ key, text: d.summary, source_type: 'disagreement', source_trace_ids: [d.trace_id] })}
      >
        <ArrowUpRight className="w-3 h-3 mr-1" />
        {promotedKeys.has(key) ? 'Added' : 'Add to Draft'}
      </Button>
    </div>
  );
})}
```

**Step 3: Add finding-item class and pass key in onPromote calls for findings**

For each finding div (line 202), add the `finding-item` class and the promoted-collapsing conditional:

```typescript
{findings?.map((f, i) => {
  const key = `finding-${trace.id}-${i}`;
  const priorityColor = f.priority === 'high' ? 'border-amber-200 bg-amber-50' : 'border-blue-200 bg-blue-50';
  return (
    <div
      key={key}
      className={`finding-item rounded-lg border ${priorityColor} p-3${promotedKeys.has(key) ? ' promoted-collapsing' : ''}`}
    >
      <p className="text-sm text-slate-800 font-medium">{f.text}</p>
      <Button
        variant="outline"
        size="sm"
        className="mt-2 text-xs"
        disabled={promotedKeys.has(key)}
        onClick={() => onPromote({ key, text: f.text, source_type: 'finding', source_trace_ids: f.evidence_trace_ids })}
      >
        <ArrowUpRight className="w-3 h-3 mr-1" />
        {promotedKeys.has(key) ? 'Added' : 'Add to Draft'}
      </Button>
    </div>
  );
})}
```

**Step 4: Verify lint passes**

Run: `just ui-lint`
Expected: PASS

**Step 5: Commit**

```bash
git add client/src/components/discovery/DiscoveryTraceCard.tsx
git commit -m "feat: apply finding-item collapse class and pass key in promote payload"
```

---

### Task 4: Apply finding-item class in CrossTraceAnalysisSummary

**Files:**
- Modify: `client/src/components/discovery/CrossTraceAnalysisSummary.tsx`

**Step 1: Add finding-item class to cross-trace finding divs and pass key**

Change the cross-trace findings map (lines 75-99). For each finding div (line 78), add the `finding-item` class and pass `key` in onPromote:

```typescript
{crossTraceFindings.map((f, i) => {
  const key = `cross-finding-${analysis.id}-${i}`;
  return (
    <div
      key={key}
      className={`finding-item flex items-start justify-between rounded-lg bg-slate-50 p-3${promotedKeys.has(key) ? ' promoted-collapsing' : ''}`}
    >
      <div>
        <p className="text-sm text-slate-800 font-medium">{f.text}</p>
        <span className="text-xs text-slate-500">
          Linked to {f.evidence_trace_ids.length} traces
        </span>
      </div>
      <Button
        variant="outline"
        size="sm"
        className="text-xs shrink-0 ml-3"
        disabled={promotedKeys.has(key)}
        onClick={() =>
          onPromote({ key, text: f.text, source_type: 'finding', source_trace_ids: f.evidence_trace_ids })
        }
      >
        <ArrowUpRight className="w-3 h-3 mr-1" />
        {promotedKeys.has(key) ? 'Added' : 'Add to Draft'}
      </Button>
    </div>
  );
})}
```

**Step 2: Verify lint passes**

Run: `just ui-lint`
Expected: PASS

**Step 3: Commit**

```bash
git add client/src/components/discovery/CrossTraceAnalysisSummary.tsx
git commit -m "feat: apply finding-item collapse class to cross-trace findings"
```

---

### Task 5: Add arrival highlight to DraftRubricSidebar

**Files:**
- Modify: `client/src/components/discovery/DraftRubricSidebar.tsx`

**Step 1: Add newItemIds prop and apply draft-item-new class**

1. Add a `newItemIds` prop to the interface (line 15-20):

```typescript
interface DraftRubricSidebarProps {
  items: DraftRubricItem[];
  workshopId: string;
  userId: string;
  onCreateRubric: () => void;
  newItemIds?: Set<string>;
}
```

2. Destructure it in the component (line 24-29):

```typescript
export const DraftRubricSidebar: React.FC<DraftRubricSidebarProps> = ({
  items,
  workshopId,
  userId,
  onCreateRubric,
  newItemIds = new Set(),
}) => {
```

3. In `renderItem` (line 204), add the `draft-item-new` class conditionally:

Change line 204-207 from:
```typescript
<div
  key={item.id}
  className="border rounded p-3 bg-white hover:shadow-sm transition-shadow"
>
```
To:
```typescript
<div
  key={item.id}
  className={`border rounded p-3 bg-white hover:shadow-sm transition-shadow${newItemIds.has(item.id) ? ' draft-item-new' : ''}`}
>
```

**Step 2: Pass newItemIds from FacilitatorDiscoveryWorkspace**

In `FacilitatorDiscoveryWorkspace.tsx`, add state tracking for new item IDs and pass it to the sidebar.

1. Add state after `undoItemRef`:
```typescript
const [newItemIds, setNewItemIds] = useState<Set<string>>(new Set());
```

2. In the `handlePromote` `onSuccess` callback, after `undoItemRef.current.set(...)`, add:
```typescript
// Track as new for sidebar highlight
setNewItemIds((prev) => new Set(prev).add(newItem.id));
// Clear highlight after animation completes
setTimeout(() => {
  setNewItemIds((prev) => {
    const next = new Set(prev);
    next.delete(newItem.id);
    return next;
  });
}, 1200);
```

3. Pass `newItemIds` to `DraftRubricSidebar` (around line 202-208):
```typescript
<DraftRubricSidebar
  items={draftItems}
  workshopId={workshopId!}
  userId={user?.id || ''}
  onCreateRubric={() => onNavigate('rubric')}
  newItemIds={newItemIds}
/>
```

**Step 3: Verify lint passes**

Run: `just ui-lint`
Expected: PASS

**Step 4: Commit**

```bash
git add client/src/components/discovery/DraftRubricSidebar.tsx client/src/components/discovery/FacilitatorDiscoveryWorkspace.tsx
git commit -m "feat: add arrival highlight animation to newly promoted draft items"
```

---

### Task 6: Manual visual verification

**Step 1: Start the dev server**

Run: `just dev`

**Step 2: Test the promotion flow**

1. Navigate to a workshop with discovery analysis results
2. Click "Add to Draft" on a finding → verify finding collapses out of feed
3. Verify toast appears with "Undo" button
4. Verify sidebar item highlights blue briefly
5. Click "Undo" on a different finding → verify finding re-expands in feed and draft item is removed

**Step 3: Test edge cases**

1. Promote multiple findings rapidly → each should collapse independently
2. Promote a cross-trace finding from the summary → collapses correctly
3. Promote a disagreement → collapses correctly
4. Click undo after finding is fully collapsed → re-expands smoothly

---

### Task 7: Final lint check and commit

**Step 1: Run full lint**

Run: `just ui-lint`
Expected: PASS

**Step 2: Squash or verify all commits are clean**

Run: `git log --oneline -7` to verify commit history looks correct.
