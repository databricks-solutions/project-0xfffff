# Facilitator Discovery Workspace Redesign

## Problem

The facilitator's discovery-to-rubric workflow is fragmented across 3+ pages with overlapping context, unclear badges, inconsistent data display, and no visibility into actual trace content. The "draft rubric" concept adds unnecessary indirection before rubric creation.

### Specific Issues

1. **Split-brain workflow** — Analysis lives in FindingsReviewPage, Draft Rubric lives in FacilitatorDashboard. Promoting findings requires navigating between them.
2. **No standard trace display** — Traces shown as truncated ID badges in some views, input previews in others, nothing in most.
3. **Quick actions are confusing** — Grab-bag of unrelated buttons (View Findings, Change Model, Add Traces, Pause, Reset).
4. **Badges are unclear** — Source-type badges (Finding, Disagreement, Feedback, Manual) and priority badges lack context.
5. **Facilitator can't see discovery traces** — Dashboard shows metrics ABOUT traces, not the actual traces with feedback.
6. **Too many nested tabs** — Dashboard tabs > FindingsReviewPage tabs > Analysis collapsible sections = 3 levels of nesting.

## Design

### Layout: Two-Panel Workspace

Replace FacilitatorDashboard (discovery mode) + FindingsReviewPage with a single **Facilitator Discovery Workspace**.

```
+-----------------------------------------------------+----------------------+
|  MAIN CONTENT (scrollable)                           |  DRAFT RUBRIC        |
|                                                      |  SIDEBAR             |
|  [Overview Bar]                                      |  (persistent)        |
|  [Cross-Trace Analysis Summary] (collapsible)        |                      |
|  [Trace Feed - cards with feedback + findings]       |                      |
|                                                      |                      |
+-----------------------------------------------------+----------------------+
```

- **Main content** (~70% width): Overview bar, cross-trace summary, trace feed
- **Right sidebar** (~30% width): Draft rubric items, grouping, "Create Rubric" action

### Component 1: Overview Bar

Compact bar replacing the "quick actions" card. All discovery controls in one row.

```
Discovery  ·  4 participants  ·  10 traces  ·  28 findings
[Run Analysis v]  [Add Traces]  [Pause]  [Model: v]
```

- Stats are inline text, not stat cards
- "Run Analysis" dropdown includes template selection (Evaluation Criteria / Themes & Patterns)
- Model selector is compact inline dropdown
- Pause/Resume is a toggle button

### Component 2: Cross-Trace Analysis Summary

Collapsible section above the trace feed. Shows global analysis findings that span multiple traces or have no specific trace reference.

- AI-generated summary text
- Cross-trace findings with "Linked to N traces" references and `[+ Add to Draft]` buttons
- Metadata: when run, which template, which model
- Note: "N trace-specific findings shown on trace cards below"
- Trace-specific findings are NOT repeated here

Only appears after analysis has been run. Collapsible so it can be minimized after review.

### Component 3: Trace Card (Standard Data Display)

The core building block. Every trace is displayed consistently:

```
+----------------------------------------------------------+
| Trace                                                     |
| USER: "What is the capital of France?"                    |
| ASSISTANT: "The capital of France is Paris. Paris is      |
|  the largest city..." [more]                              |
|                                                           |
| ANALYSIS FINDINGS (collapsible, pinned above feedback)    |
| ! HIGH DISAGREEMENT                                       |
| Opposite ratings on accuracy vs. completeness             |
| Theme: "Brevity tolerance varies"        [+ Add to Draft] |
|                                                           |
| FEEDBACK (3)                                              |
| Alice - GOOD - "Clear and accurate"                       |
|   > 3 follow-up Q&A (collapsible)                         |
| Bob - BAD - "Too terse, lacks context"                    |
|   > 3 follow-up Q&A (collapsible)                         |
| Carol - GOOD - "Correct but could mention history"        |
|   > 3 follow-up Q&A (collapsible)                         |
+----------------------------------------------------------+
```

**Information hierarchy within a trace card:**
1. Trace content (user input + assistant output, truncated with expand)
2. Analysis findings for this trace (collapsible, only after analysis run)
3. Raw participant feedback with labels and follow-up Q&A

**Standard display rules:**
- Always show actual conversation content, not trace IDs
- Feedback shows: reviewer name + colored label (GOOD/BAD) + comment + collapsible Q&A
- Analysis findings include priority level, summary, theme, and promote button
- Trace IDs are never the primary identifier shown to users

### Component 4: Draft Rubric Sidebar

Persistent right panel. Collects promoted items and allows grouping.

```
Draft Rubric
5 items - 2 groups

-- Response Quality --
  - Accuracy matters          [trace badge]
  - Completeness gap          [trace badge]
  - Context needed            [trace badge]

-- Tone & Style --
  - Brevity tolerance         [trace badge]
  - Formality level           [trace badge]

[Suggest Groups]
[+ Add manually]

---
[Create Rubric ->]
Groups become criteria
```

**Promotion flow:**
- Facilitator clicks `[+ Add to Draft]` on any finding (trace-specific or cross-trace)
- Item appears in the sidebar with a subtle arrival animation
- Item retains trace reference badges (compact, interactive — hover for trace preview, click to scroll to trace in feed)

**Grouping:**
- Items can be assigned to groups manually (dropdown per item)
- "Suggest Groups" uses AI to propose groupings
- Each group becomes one rubric criterion when "Create Rubric" is clicked

**What stays from current DraftRubricPanel:**
- Edit item text, delete items
- Group assignment (dropdown)
- Suggest Groups + Apply Groups
- Manual add

**What changes:**
- Remove source-type badges (Finding, Disagreement, etc.) — not useful to facilitator
- Keep trace reference badges (needed as example anchors for rubric criteria later)
- Rename from "Draft Rubric Panel" — it's just the sidebar of the workspace

### Component 5: Rubric Creation Transition

"Create Rubric" button at bottom of sidebar navigates to the existing RubricCreationDemo page. The page is pre-populated from draft groups:

- Each group name becomes a rubric criterion title
- Items within the group inform the criterion description
- Trace references from draft items can serve as examples in criterion details

This step is kept separate because rubric creation involves additional decisions (scale type, detailed descriptions, judge type) that don't belong in the discovery workspace.

## Pages Affected

| Current | After |
|---------|-------|
| FacilitatorDashboard (discovery mode) | Replaced by Facilitator Discovery Workspace |
| FindingsReviewPage | Replaced by Facilitator Discovery Workspace |
| DraftRubricPanel (component) | Refactored into workspace sidebar |
| DiscoveryAnalysisTab (component) | Decomposed — cross-trace findings go to summary, trace-specific to cards |
| RubricCreationDemo | Kept, receives pre-populated data from draft groups |

## Components to Build

1. **FacilitatorDiscoveryWorkspace** — new top-level page component
2. **DiscoveryOverviewBar** — compact stats + controls bar
3. **CrossTraceAnalysisSummary** — collapsible global findings section
4. **TraceCard** — standard trace display with feedback and findings
5. **DraftRubricSidebar** — refactored draft rubric panel for sidebar layout
6. **TraceReferenceBadge** — interactive compact trace reference (hover preview, click to scroll)

## What Gets Removed

- "Quick actions" card from FacilitatorDashboard
- Source-type badges (Finding, Disagreement, Feedback, Manual) from draft items
- Tabs in FindingsReviewPage (All Findings, By Trace, By User, Analysis)
- Dashboard tabs for Feedback and Draft Rubric (these become the main content and sidebar)
- Trace ID-only badges used as primary display

## What Gets Kept

- FacilitatorDashboard for annotation mode (unchanged)
- RubricCreationDemo page (receives draft groups as input)
- Suggest Groups / Apply Groups AI functionality
- Phase control (pause/resume) functionality
- Analysis run API and history
