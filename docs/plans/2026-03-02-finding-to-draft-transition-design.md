# Finding-to-Draft Transition Design

## Problem

When clicking "Add to Draft" on analysis findings, the finding stays in place in the feed with only a button label change. The spec says items should "visibly move from the trace feed into the sidebar" (DISCOVERY_SPEC.md line 240).

## Design

CSS-only approach: findings collapse out of the feed with a smooth animation, an undo toast appears, and the new sidebar item highlights on arrival. No new dependencies.

### State Model

- `promotedKeys: Set<string>` — tracks which findings have been promoted (already exists, currently only disables buttons)
- Expand role: promoted findings collapse out of the feed via CSS transitions
- Track newly created draft item IDs for undo capability

### Promotion Flow

1. User clicks "Add to Draft" on a finding/disagreement
2. Key added to `promotedKeys` → triggers CSS collapse animation (300ms)
3. API call creates draft rubric item
4. Sonner toast appears with "Undo" action (5s duration)
5. Sidebar item highlights with arrival animation (1.2s)

### Undo Flow

1. User clicks "Undo" on toast within 5s
2. Key removed from `promotedKeys` → finding re-expands in feed
3. Draft item deleted via API

### Component Changes

**FacilitatorDiscoveryWorkspace** — `promotedKeys` becomes stateful with add/remove helpers. `handlePromote` orchestrates: add key → API call → toast with undo → track new item ID.

**DiscoveryTraceCard** / **CrossTraceAnalysisSummary** — Each finding/disagreement div gets `promoted-collapsing` class when its key is in `promotedKeys`, triggering CSS collapse.

**DraftRubricSidebar** — New items get `draft-item-new` class for arrival highlight animation.

### CSS Transitions

```css
.finding-item {
  max-height: 500px; opacity: 1;
  transition: max-height 300ms ease-out, opacity 200ms ease-out,
              padding 300ms ease-out, margin 300ms ease-out;
  overflow: hidden;
}
.finding-item.promoted-collapsing {
  max-height: 0; opacity: 0;
  padding-top: 0; padding-bottom: 0;
  margin-top: 0; margin-bottom: 0;
}

@keyframes draft-arrive {
  0% { background-color: rgb(219 234 254); }
  100% { background-color: transparent; }
}
.draft-item-new { animation: draft-arrive 1.2s ease-out; }
```
