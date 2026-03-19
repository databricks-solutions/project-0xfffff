# Facilitator Discovery Workspace Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the fragmented facilitator discovery flow (FacilitatorDashboard discovery mode + FindingsReviewPage + DiscoveryAnalysisTab) with a single two-panel workspace: trace feed with co-located analysis findings on the left, persistent draft rubric sidebar on the right.

**Architecture:** New `FacilitatorDiscoveryWorkspace` page component composed of small, focused sub-components. Reuses all existing hooks and API endpoints — no backend changes. The workspace is wired into the existing routing in `WorkshopDemoLanding.tsx` as a replacement for the `discovery-monitor` and `findings-review` views.

**Tech Stack:** React, TypeScript, Tailwind CSS, shadcn/ui components, TanStack Query (existing hooks from `useWorkshopApi.ts`)

**Design doc:** `docs/plans/2026-02-27-facilitator-discovery-workspace-design.md`
**Spec:** `specs/DISCOVERY_SPEC.md` (updated with Facilitator Discovery Workspace section)

---

### Task 1: Create DiscoveryTraceCard component

The standard trace card that shows trace content, co-located analysis findings, and participant feedback. This is the core building block.

**Files:**
- Create: `client/src/components/discovery/DiscoveryTraceCard.tsx`
- Test: `client/src/components/discovery/DiscoveryTraceCard.test.tsx`

**Step 1: Write the failing test**

```tsx
// client/src/components/discovery/DiscoveryTraceCard.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { DiscoveryTraceCard } from './DiscoveryTraceCard';

const mockTrace = {
  id: 'trace-1',
  workshop_id: 'ws-1',
  input: '{"messages":[{"role":"user","content":"What is the capital of France?"}]}',
  output: '{"choices":[{"message":{"content":"The capital of France is Paris."}}]}',
};

const mockFeedback = [
  {
    id: 'fb-1',
    workshop_id: 'ws-1',
    trace_id: 'trace-1',
    user_id: 'user-1',
    user_name: 'Alice',
    user_email: 'alice@test.com',
    user_role: 'sme',
    feedback_label: 'good' as const,
    comment: 'Clear and accurate response',
    followup_qna: [{ question: 'What made it good?', answer: 'Concise and correct' }],
    created_at: '2026-02-27T00:00:00Z',
    updated_at: '2026-02-27T00:00:00Z',
  },
  {
    id: 'fb-2',
    workshop_id: 'ws-1',
    trace_id: 'trace-1',
    user_id: 'user-2',
    user_name: 'Bob',
    user_email: 'bob@test.com',
    user_role: 'participant',
    feedback_label: 'bad' as const,
    comment: 'Too terse, no context provided',
    followup_qna: [],
    created_at: '2026-02-27T00:00:00Z',
    updated_at: '2026-02-27T00:00:00Z',
  },
];

const mockFindings = [
  {
    text: 'Brevity tolerance varies across reviewers',
    evidence_trace_ids: ['trace-1'],
    priority: 'high',
  },
];

const mockDisagreements = [
  {
    trace_id: 'trace-1',
    summary: 'Opposite ratings on accuracy vs completeness',
    underlying_theme: 'Brevity vs thoroughness',
    followup_questions: ['What level of detail is expected?'],
    facilitator_suggestions: ['Clarify completeness expectations'],
  },
];

// @req DISCOVERY_SPEC.facilitator-workspace.trace-card
describe('DiscoveryTraceCard', () => {
  it('renders trace input and output content', () => {
    render(
      <DiscoveryTraceCard
        trace={mockTrace}
        feedback={mockFeedback}
        onPromote={vi.fn()}
      />
    );
    // Should show actual content, not trace IDs
    expect(screen.getByText(/What is the capital of France/)).toBeInTheDocument();
    expect(screen.getByText(/capital of France is Paris/)).toBeInTheDocument();
  });

  it('renders participant feedback with names and labels', () => {
    render(
      <DiscoveryTraceCard
        trace={mockTrace}
        feedback={mockFeedback}
        onPromote={vi.fn()}
      />
    );
    expect(screen.getByText('Alice')).toBeInTheDocument();
    expect(screen.getByText('Bob')).toBeInTheDocument();
    expect(screen.getByText(/Clear and accurate/)).toBeInTheDocument();
    expect(screen.getByText(/Too terse/)).toBeInTheDocument();
  });

  it('renders analysis findings pinned above feedback when provided', () => {
    render(
      <DiscoveryTraceCard
        trace={mockTrace}
        feedback={mockFeedback}
        findings={mockFindings}
        disagreements={mockDisagreements}
        onPromote={vi.fn()}
      />
    );
    expect(screen.getByText(/Brevity tolerance varies/)).toBeInTheDocument();
    expect(screen.getByText(/Opposite ratings/)).toBeInTheDocument();
  });

  it('calls onPromote with finding text when promote button clicked', async () => {
    const onPromote = vi.fn();
    render(
      <DiscoveryTraceCard
        trace={mockTrace}
        feedback={mockFeedback}
        findings={mockFindings}
        disagreements={mockDisagreements}
        onPromote={onPromote}
      />
    );
    const promoteButtons = screen.getAllByRole('button', { name: /add to draft/i });
    await userEvent.click(promoteButtons[0]);
    expect(onPromote).toHaveBeenCalledWith(
      expect.objectContaining({ text: mockFindings[0].text })
    );
  });

  it('does not render analysis section when no findings provided', () => {
    render(
      <DiscoveryTraceCard
        trace={mockTrace}
        feedback={mockFeedback}
        onPromote={vi.fn()}
      />
    );
    expect(screen.queryByText(/Analysis Findings/i)).not.toBeInTheDocument();
  });

  it('renders follow-up Q&A as collapsible', async () => {
    render(
      <DiscoveryTraceCard
        trace={mockTrace}
        feedback={mockFeedback}
        onPromote={vi.fn()}
      />
    );
    // Q&A should be collapsed by default
    expect(screen.queryByText('What made it good?')).not.toBeInTheDocument();
    // Click to expand
    const toggle = screen.getByText(/1 follow-up/i);
    await userEvent.click(toggle);
    expect(screen.getByText('What made it good?')).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/discovery/DiscoveryTraceCard.test.tsx`
Expected: FAIL — module not found

**Step 3: Write the implementation**

```tsx
// client/src/components/discovery/DiscoveryTraceCard.tsx
import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, AlertTriangle, ArrowUpRight } from 'lucide-react';
import type { Trace } from '@/client';
import type { DiscoveryFeedbackWithUser } from '@/client';

interface Finding {
  text: string;
  evidence_trace_ids: string[];
  priority: string;
}

interface Disagreement {
  trace_id: string;
  summary: string;
  underlying_theme: string;
  followup_questions: string[];
  facilitator_suggestions: string[];
}

export interface PromotePayload {
  text: string;
  source_type: 'finding' | 'disagreement';
  source_trace_ids: string[];
}

interface DiscoveryTraceCardProps {
  trace: Trace;
  feedback: DiscoveryFeedbackWithUser[];
  findings?: Finding[];
  disagreements?: Disagreement[];
  onPromote: (payload: PromotePayload) => void;
  promotedKeys?: Set<string>;
}

function tryParseContent(raw: string): string {
  // Try to extract content from JSON message format, fall back to raw
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.messages?.[0]?.content) return parsed.messages[0].content;
    if (parsed?.choices?.[0]?.message?.content) return parsed.choices[0].message.content;
    if (typeof parsed === 'string') return parsed;
  } catch {
    // not JSON, use raw
  }
  return raw;
}

function FeedbackRow({ fb }: { fb: DiscoveryFeedbackWithUser }) {
  const [qnaOpen, setQnaOpen] = useState(false);
  const qnaCount = fb.followup_qna?.length ?? 0;

  return (
    <div className="py-3 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium text-slate-800">{fb.user_name}</span>
        <Badge
          className={
            fb.feedback_label === 'good'
              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
              : 'bg-red-100 text-red-800 border-red-200'
          }
        >
          {fb.feedback_label.toUpperCase()}
        </Badge>
      </div>
      <p className="text-sm text-slate-700">{fb.comment}</p>
      {qnaCount > 0 && (
        <button
          type="button"
          className="flex items-center gap-1 mt-1.5 text-xs text-slate-500 hover:text-slate-700"
          onClick={() => setQnaOpen(!qnaOpen)}
        >
          {qnaOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {qnaCount} follow-up Q&A{qnaCount !== 1 ? 's' : ''}
        </button>
      )}
      {qnaOpen && fb.followup_qna && (
        <div className="mt-1.5 pl-4 border-l-2 border-slate-200 space-y-1.5">
          {fb.followup_qna.map((pair, i) => (
            <div key={i} className="text-xs">
              <span className="font-medium text-slate-600">Q: </span>
              <span className="text-slate-700">{pair.question}</span>
              <br />
              <span className="font-medium text-slate-600">A: </span>
              <span className="text-slate-700">{pair.answer}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const DiscoveryTraceCard: React.FC<DiscoveryTraceCardProps> = ({
  trace,
  feedback,
  findings,
  disagreements,
  onPromote,
  promotedKeys = new Set(),
}) => {
  const [contentExpanded, setContentExpanded] = useState(false);
  const [findingsOpen, setFindingsOpen] = useState(true);

  const inputText = tryParseContent(trace.input);
  const outputText = tryParseContent(trace.output);
  const truncateAt = 200;

  const hasAnalysis = (findings && findings.length > 0) || (disagreements && disagreements.length > 0);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        {/* Trace content */}
        <div className="mb-4 rounded-lg bg-slate-50 p-4 space-y-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">User</span>
            <p className="text-sm text-slate-800 mt-0.5">{inputText}</p>
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Assistant</span>
            <p className="text-sm text-slate-800 mt-0.5">
              {contentExpanded || outputText.length <= truncateAt
                ? outputText
                : outputText.slice(0, truncateAt) + '...'}
            </p>
            {outputText.length > truncateAt && (
              <button
                type="button"
                className="text-xs text-blue-600 hover:text-blue-800 mt-1"
                onClick={() => setContentExpanded(!contentExpanded)}
              >
                {contentExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        </div>

        {/* Analysis findings — pinned above feedback */}
        {hasAnalysis && (
          <div className="mb-4">
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-2"
              onClick={() => setFindingsOpen(!findingsOpen)}
            >
              {findingsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              Analysis Findings
            </button>
            {findingsOpen && (
              <div className="space-y-2">
                {disagreements?.map((d, i) => {
                  const key = `disagreement-${trace.id}-${i}`;
                  return (
                    <div key={key} className="rounded-lg border border-red-200 bg-red-50 p-3">
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                        <span className="text-xs font-semibold uppercase text-red-700">High Disagreement</span>
                      </div>
                      <p className="text-sm text-slate-800 font-medium">{d.summary}</p>
                      <p className="text-xs text-slate-600 mt-1">Theme: {d.underlying_theme}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 text-xs"
                        disabled={promotedKeys.has(key)}
                        onClick={() => onPromote({ text: d.summary, source_type: 'disagreement', source_trace_ids: [d.trace_id] })}
                      >
                        <ArrowUpRight className="w-3 h-3 mr-1" />
                        {promotedKeys.has(key) ? 'Added' : 'Add to Draft'}
                      </Button>
                    </div>
                  );
                })}
                {findings?.map((f, i) => {
                  const key = `finding-${trace.id}-${i}`;
                  const priorityColor = f.priority === 'high' ? 'border-amber-200 bg-amber-50' : 'border-blue-200 bg-blue-50';
                  return (
                    <div key={key} className={`rounded-lg border ${priorityColor} p-3`}>
                      <p className="text-sm text-slate-800 font-medium">{f.text}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 text-xs"
                        disabled={promotedKeys.has(key)}
                        onClick={() => onPromote({ text: f.text, source_type: 'finding', source_trace_ids: f.evidence_trace_ids })}
                      >
                        <ArrowUpRight className="w-3 h-3 mr-1" />
                        {promotedKeys.has(key) ? 'Added' : 'Add to Draft'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Participant feedback */}
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-1">
            Feedback ({feedback.length})
          </h4>
          <div className="divide-y divide-slate-100">
            {feedback.map((fb) => (
              <FeedbackRow key={fb.id} fb={fb} />
            ))}
          </div>
          {feedback.length === 0 && (
            <p className="text-sm text-slate-500 italic py-2">No feedback yet</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
```

**Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/discovery/DiscoveryTraceCard.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add client/src/components/discovery/DiscoveryTraceCard.tsx client/src/components/discovery/DiscoveryTraceCard.test.tsx
git commit -m "feat: add DiscoveryTraceCard component with co-located findings"
```

---

### Task 2: Create DiscoveryOverviewBar component

Compact stats + controls bar replacing the "quick actions" card.

**Files:**
- Create: `client/src/components/discovery/DiscoveryOverviewBar.tsx`
- Test: `client/src/components/discovery/DiscoveryOverviewBar.test.tsx`

**Step 1: Write the failing test**

```tsx
// client/src/components/discovery/DiscoveryOverviewBar.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { DiscoveryOverviewBar } from './DiscoveryOverviewBar';

// @req DISCOVERY_SPEC.facilitator-workspace.overview-bar
describe('DiscoveryOverviewBar', () => {
  const defaultProps = {
    participantCount: 4,
    traceCount: 10,
    feedbackCount: 28,
    currentModel: 'Claude Sonnet 4.5',
    modelOptions: [
      { value: 'Claude Sonnet 4.5', label: 'Claude Sonnet 4.5', disabled: false },
      { value: 'demo', label: 'Demo Mode', disabled: false },
    ],
    onRunAnalysis: vi.fn(),
    onModelChange: vi.fn(),
    onPauseToggle: vi.fn(),
    onAddTraces: vi.fn(),
    isPaused: false,
    isAnalysisRunning: false,
    hasMlflowConfig: true,
  };

  it('renders inline stats', () => {
    render(<DiscoveryOverviewBar {...defaultProps} />);
    expect(screen.getByText(/4 participants/)).toBeInTheDocument();
    expect(screen.getByText(/10 traces/)).toBeInTheDocument();
    expect(screen.getByText(/28 findings/)).toBeInTheDocument();
  });

  it('renders Run Analysis button', () => {
    render(<DiscoveryOverviewBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /run analysis/i })).toBeInTheDocument();
  });

  it('disables Run Analysis when mlflow not configured', () => {
    render(<DiscoveryOverviewBar {...defaultProps} hasMlflowConfig={false} />);
    expect(screen.getByRole('button', { name: /run analysis/i })).toBeDisabled();
  });

  it('shows Pause/Resume toggle', () => {
    render(<DiscoveryOverviewBar {...defaultProps} />);
    expect(screen.getByRole('button', { name: /pause/i })).toBeInTheDocument();
  });
});
```

**Step 2: Run test to verify it fails**

Run: `cd client && npx vitest run src/components/discovery/DiscoveryOverviewBar.test.tsx`
Expected: FAIL

**Step 3: Write the implementation**

```tsx
// client/src/components/discovery/DiscoveryOverviewBar.tsx
import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Pause, Plus, Loader2 } from 'lucide-react';
import type { ModelOption } from '@/utils/modelMapping';

interface DiscoveryOverviewBarProps {
  participantCount: number;
  traceCount: number;
  feedbackCount: number;
  currentModel: string;
  modelOptions: ModelOption[];
  onRunAnalysis: (template: string) => void;
  onModelChange: (model: string) => void;
  onPauseToggle: () => void;
  onAddTraces: () => void;
  isPaused: boolean;
  isAnalysisRunning: boolean;
  hasMlflowConfig: boolean;
}

export const DiscoveryOverviewBar: React.FC<DiscoveryOverviewBarProps> = ({
  participantCount,
  traceCount,
  feedbackCount,
  currentModel,
  modelOptions,
  onRunAnalysis,
  onModelChange,
  onPauseToggle,
  onAddTraces,
  isPaused,
  isAnalysisRunning,
  hasMlflowConfig,
}) => {
  const [template, setTemplate] = useState('evaluation_criteria');

  return (
    <div className="rounded-lg border bg-white px-5 py-3 space-y-2">
      <div className="flex items-center gap-3 text-sm text-slate-600">
        <span className="font-semibold text-slate-900">Discovery</span>
        <span className="text-slate-400">&middot;</span>
        <span>{participantCount} participants</span>
        <span className="text-slate-400">&middot;</span>
        <span>{traceCount} traces</span>
        <span className="text-slate-400">&middot;</span>
        <span>{feedbackCount} findings</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={template} onValueChange={setTemplate}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="evaluation_criteria">Eval Criteria</SelectItem>
            <SelectItem value="themes_patterns">Themes &amp; Patterns</SelectItem>
          </SelectContent>
        </Select>

        <Button
          size="sm"
          className="h-8 text-xs"
          disabled={isAnalysisRunning || !hasMlflowConfig}
          onClick={() => onRunAnalysis(template)}
        >
          {isAnalysisRunning ? (
            <>
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Play className="w-3 h-3 mr-1" />
              Run Analysis
            </>
          )}
        </Button>

        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onAddTraces}>
          <Plus className="w-3 h-3 mr-1" />
          Add Traces
        </Button>

        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onPauseToggle}>
          {isPaused ? <Play className="w-3 h-3 mr-1" /> : <Pause className="w-3 h-3 mr-1" />}
          {isPaused ? 'Resume' : 'Pause'}
        </Button>

        <Select value={currentModel} onValueChange={onModelChange}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue placeholder="Model" />
          </SelectTrigger>
          <SelectContent>
            {modelOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
```

**Step 4: Run test to verify it passes**

Run: `cd client && npx vitest run src/components/discovery/DiscoveryOverviewBar.test.tsx`
Expected: PASS

**Step 5: Commit**

```bash
git add client/src/components/discovery/DiscoveryOverviewBar.tsx client/src/components/discovery/DiscoveryOverviewBar.test.tsx
git commit -m "feat: add DiscoveryOverviewBar with compact stats and controls"
```

---

### Task 3: Create CrossTraceAnalysisSummary component

Collapsible section showing global/cross-trace analysis findings with promote buttons.

**Files:**
- Create: `client/src/components/discovery/CrossTraceAnalysisSummary.tsx`
- Test: `client/src/components/discovery/CrossTraceAnalysisSummary.test.tsx`

**Step 1: Write the failing test**

```tsx
// client/src/components/discovery/CrossTraceAnalysisSummary.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { CrossTraceAnalysisSummary } from './CrossTraceAnalysisSummary';

const mockAnalysis = {
  id: 'analysis-1',
  workshop_id: 'ws-1',
  template_used: 'evaluation_criteria',
  analysis_data: 'Reviewers consistently disagree about brevity vs completeness.',
  findings: [
    { text: 'Brevity tolerance varies', evidence_trace_ids: ['t1', 't2', 't3', 't4'], priority: 'high' },
    { text: 'Factual accuracy universally valued', evidence_trace_ids: ['t1', 't2', 't3', 't5', 't6', 't7', 't8'], priority: 'high' },
    { text: 'Trace-specific finding', evidence_trace_ids: ['t1'], priority: 'medium' },
  ],
  disagreements: { high: [], medium: [], lower: [] },
  participant_count: 4,
  model_used: 'claude-sonnet-4.5',
  created_at: '2026-02-27T00:00:00Z',
  updated_at: '2026-02-27T00:00:00Z',
};

// @req DISCOVERY_SPEC.facilitator-workspace.cross-trace-summary
describe('CrossTraceAnalysisSummary', () => {
  it('renders summary text', () => {
    render(
      <CrossTraceAnalysisSummary analysis={mockAnalysis} onPromote={vi.fn()} />
    );
    expect(screen.getByText(/consistently disagree/)).toBeInTheDocument();
  });

  it('shows only cross-trace findings (multi-trace references)', () => {
    render(
      <CrossTraceAnalysisSummary analysis={mockAnalysis} onPromote={vi.fn()} />
    );
    // Cross-trace findings (2+ trace references) should appear
    expect(screen.getByText(/Brevity tolerance varies/)).toBeInTheDocument();
    expect(screen.getByText(/Factual accuracy/)).toBeInTheDocument();
    // Single-trace finding should NOT appear here
    expect(screen.queryByText('Trace-specific finding')).not.toBeInTheDocument();
  });

  it('shows "Linked to N traces" for cross-trace findings', () => {
    render(
      <CrossTraceAnalysisSummary analysis={mockAnalysis} onPromote={vi.fn()} />
    );
    expect(screen.getByText(/Linked to 4 traces/)).toBeInTheDocument();
    expect(screen.getByText(/Linked to 7 traces/)).toBeInTheDocument();
  });

  it('is collapsible', async () => {
    render(
      <CrossTraceAnalysisSummary analysis={mockAnalysis} onPromote={vi.fn()} />
    );
    const collapseButton = screen.getByRole('button', { name: /collapse/i });
    await userEvent.click(collapseButton);
    expect(screen.queryByText(/consistently disagree/)).not.toBeInTheDocument();
  });
});
```

**Step 2: Run test, verify fail**

Run: `cd client && npx vitest run src/components/discovery/CrossTraceAnalysisSummary.test.tsx`

**Step 3: Write the implementation**

```tsx
// client/src/components/discovery/CrossTraceAnalysisSummary.tsx
import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, ArrowUpRight, Clock, FileText, Users } from 'lucide-react';
import type { DiscoveryAnalysis } from '@/hooks/useWorkshopApi';
import type { PromotePayload } from './DiscoveryTraceCard';

interface CrossTraceAnalysisSummaryProps {
  analysis: DiscoveryAnalysis;
  onPromote: (payload: PromotePayload) => void;
  promotedKeys?: Set<string>;
}

export const CrossTraceAnalysisSummary: React.FC<CrossTraceAnalysisSummaryProps> = ({
  analysis,
  onPromote,
  promotedKeys = new Set(),
}) => {
  const [collapsed, setCollapsed] = useState(false);

  // Cross-trace findings = those referencing 2+ traces
  const crossTraceFindings = analysis.findings.filter(
    (f) => f.evidence_trace_ids.length >= 2
  );
  const traceSpecificCount = analysis.findings.length - crossTraceFindings.length;

  if (crossTraceFindings.length === 0 && !analysis.analysis_data) return null;

  return (
    <Card className="border-slate-200">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-800">Analysis Summary</h3>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {analysis.participant_count} participants
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(analysis.created_at).toLocaleString()}
              </span>
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {analysis.template_used === 'evaluation_criteria' ? 'Eval Criteria' : 'Themes & Patterns'}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? 'Expand' : 'Collapse'}
            >
              {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {!collapsed && (
          <div className="space-y-3">
            {analysis.analysis_data && (
              <p className="text-sm text-slate-700">{analysis.analysis_data}</p>
            )}

            {crossTraceFindings.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-slate-500">Cross-Trace Findings</h4>
                {crossTraceFindings.map((f, i) => {
                  const key = `cross-finding-${analysis.id}-${i}`;
                  return (
                    <div key={key} className="flex items-start justify-between rounded-lg bg-slate-50 p-3">
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
                          onPromote({ text: f.text, source_type: 'finding', source_trace_ids: f.evidence_trace_ids })
                        }
                      >
                        <ArrowUpRight className="w-3 h-3 mr-1" />
                        {promotedKeys.has(key) ? 'Added' : 'Add to Draft'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {traceSpecificCount > 0 && (
              <p className="text-xs text-slate-500 italic">
                {traceSpecificCount} trace-specific finding{traceSpecificCount !== 1 ? 's' : ''} shown on trace cards below
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
```

**Step 4: Run test, verify pass**

Run: `cd client && npx vitest run src/components/discovery/CrossTraceAnalysisSummary.test.tsx`

**Step 5: Commit**

```bash
git add client/src/components/discovery/CrossTraceAnalysisSummary.tsx client/src/components/discovery/CrossTraceAnalysisSummary.test.tsx
git commit -m "feat: add CrossTraceAnalysisSummary component"
```

---

### Task 4: Create DraftRubricSidebar component

Refactored draft rubric panel for persistent sidebar layout. Removes source-type badges, keeps trace reference badges.

**Files:**
- Create: `client/src/components/discovery/DraftRubricSidebar.tsx`
- Test: `client/src/components/discovery/DraftRubricSidebar.test.tsx`

**Step 1: Write the failing test**

```tsx
// client/src/components/discovery/DraftRubricSidebar.test.tsx
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { DraftRubricSidebar } from './DraftRubricSidebar';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
const wrap = (ui: React.ReactElement) => (
  <QueryClientProvider client={qc}>{ui}</QueryClientProvider>
);

// @req DISCOVERY_SPEC.facilitator-workspace.draft-rubric-sidebar
describe('DraftRubricSidebar', () => {
  const mockItems = [
    { id: 'item-1', workshop_id: 'ws-1', text: 'Accuracy matters', source_type: 'finding', source_trace_ids: ['t1'], group_id: 'g1', group_name: 'Response Quality', promoted_by: 'user-1', promoted_at: '2026-02-27T00:00:00Z' },
    { id: 'item-2', workshop_id: 'ws-1', text: 'Brevity tolerance', source_type: 'disagreement', source_trace_ids: ['t2'], group_id: null, group_name: null, promoted_by: 'user-1', promoted_at: '2026-02-27T00:00:00Z' },
  ];

  it('renders items with text but NOT source-type badges', () => {
    render(wrap(
      <DraftRubricSidebar items={mockItems} workshopId="ws-1" userId="user-1" onCreateRubric={vi.fn()} />
    ));
    expect(screen.getByText('Accuracy matters')).toBeInTheDocument();
    expect(screen.getByText('Brevity tolerance')).toBeInTheDocument();
    // Source-type badges should NOT be present
    expect(screen.queryByText('Analysis')).not.toBeInTheDocument();
    expect(screen.queryByText('Disagreement')).not.toBeInTheDocument();
    expect(screen.queryByText('Finding')).not.toBeInTheDocument();
  });

  it('renders trace reference badges', () => {
    render(wrap(
      <DraftRubricSidebar items={mockItems} workshopId="ws-1" userId="user-1" onCreateRubric={vi.fn()} />
    ));
    // Trace IDs should be shown as compact badges
    expect(screen.getByText(/t1/)).toBeInTheDocument();
    expect(screen.getByText(/t2/)).toBeInTheDocument();
  });

  it('shows grouped items under group names', () => {
    render(wrap(
      <DraftRubricSidebar items={mockItems} workshopId="ws-1" userId="user-1" onCreateRubric={vi.fn()} />
    ));
    expect(screen.getByText('Response Quality')).toBeInTheDocument();
  });

  it('renders Create Rubric button', () => {
    render(wrap(
      <DraftRubricSidebar items={mockItems} workshopId="ws-1" userId="user-1" onCreateRubric={vi.fn()} />
    ));
    expect(screen.getByRole('button', { name: /create rubric/i })).toBeInTheDocument();
  });

  it('shows item count and group count', () => {
    render(wrap(
      <DraftRubricSidebar items={mockItems} workshopId="ws-1" userId="user-1" onCreateRubric={vi.fn()} />
    ));
    expect(screen.getByText(/2 items/)).toBeInTheDocument();
    expect(screen.getByText(/1 group/)).toBeInTheDocument();
  });
});
```

**Step 2: Run test, verify fail**

Run: `cd client && npx vitest run src/components/discovery/DraftRubricSidebar.test.tsx`

**Step 3: Write the implementation**

This component is a simplified refactor of `DraftRubricPanel.tsx`. Key changes:
- Removes source-type badges (`SOURCE_TYPE_STYLES` map)
- Keeps trace reference badges
- Adds "Create Rubric" CTA at bottom
- Sidebar-friendly layout (narrower, scrollable)
- Reuses the same hooks: `useCreateDraftRubricItem`, `useUpdateDraftRubricItem`, `useDeleteDraftRubricItem`, `useSuggestGroups`, `useApplyGroups`

The implementation follows the same grouping logic from `DraftRubricPanel.tsx` (lines 167-184) — group by `group_name`, render grouped then ungrouped. Remove the `renderSourceBadge` function and its `SOURCE_TYPE_STYLES` constant. Keep `renderTraceBadges`. Add a footer with "Create Rubric →" button that calls `onCreateRubric`.

Full implementation: refactor `DraftRubricPanel.tsx` into sidebar layout. The code is substantial (~300 lines) — the implementing agent should base it on `DraftRubricPanel.tsx` at `client/src/components/DraftRubricPanel.tsx` with these diffs:
- Remove `SOURCE_TYPE_STYLES` and all `renderSourceBadge` calls
- Replace card-based layout with a sidebar-friendly scrollable column
- Add `onCreateRubric` prop and render a sticky footer button
- Add item + group count summary at top
- Keep all existing mutation hooks and grouping logic

**Step 4: Run test, verify pass**

Run: `cd client && npx vitest run src/components/discovery/DraftRubricSidebar.test.tsx`

**Step 5: Commit**

```bash
git add client/src/components/discovery/DraftRubricSidebar.tsx client/src/components/discovery/DraftRubricSidebar.test.tsx
git commit -m "feat: add DraftRubricSidebar without source-type badges"
```

---

### Task 5: Create FacilitatorDiscoveryWorkspace page component

The top-level page that composes all sub-components into the two-panel layout. Wires up data fetching and state management.

**Files:**
- Create: `client/src/components/discovery/FacilitatorDiscoveryWorkspace.tsx`
- Test: `client/src/components/discovery/FacilitatorDiscoveryWorkspace.test.tsx`

**Step 1: Write the failing test**

```tsx
// client/src/components/discovery/FacilitatorDiscoveryWorkspace.test.tsx
import { render, screen } from '@testing-library/react';
import { describe, it, expect, vi } from 'vitest';
import { FacilitatorDiscoveryWorkspace } from './FacilitatorDiscoveryWorkspace';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock the hooks
vi.mock('@/hooks/useWorkshopApi', () => ({
  useAllTraces: () => ({ data: [
    { id: 't1', workshop_id: 'ws-1', input: 'User question 1', output: 'Answer 1' },
    { id: 't2', workshop_id: 'ws-1', input: 'User question 2', output: 'Answer 2' },
  ] }),
  useFacilitatorDiscoveryFeedback: () => ({ data: [
    { id: 'fb-1', trace_id: 't1', user_id: 'u1', user_name: 'Alice', user_email: 'a@t.com', user_role: 'sme', feedback_label: 'good', comment: 'Great', followup_qna: [], created_at: '', updated_at: '' },
  ] }),
  useDiscoveryAnalyses: () => ({ data: [] }),
  useRunDiscoveryAnalysis: () => ({ mutate: vi.fn(), isPending: false }),
  useDraftRubricItems: () => ({ data: [] }),
  useCreateDraftRubricItem: () => ({ mutate: vi.fn(), isPending: false }),
  useWorkshop: () => ({ data: { id: 'ws-1', current_phase: 'discovery', discovery_started: true, active_discovery_trace_ids: ['t1', 't2'] } }),
  useMLflowConfig: () => ({ data: null }),
  useUpdateDiscoveryModel: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/context/WorkshopContext', () => ({
  useWorkshopContext: () => ({ workshopId: 'ws-1' }),
}));

vi.mock('@/context/UserContext', () => ({
  useUser: () => ({ user: { id: 'facilitator-1', role: 'facilitator' } }),
  useRoleCheck: () => ({ isFacilitator: true }),
}));

const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });

// @req DISCOVERY_SPEC.facilitator-workspace.layout
describe('FacilitatorDiscoveryWorkspace', () => {
  it('renders the two-panel layout with trace feed and sidebar', () => {
    render(
      <QueryClientProvider client={qc}>
        <FacilitatorDiscoveryWorkspace onNavigate={vi.fn()} />
      </QueryClientProvider>
    );
    // Overview bar stats
    expect(screen.getByText(/1 participants/)).toBeInTheDocument();
    expect(screen.getByText(/2 traces/)).toBeInTheDocument();

    // Trace content shown (not IDs)
    expect(screen.getByText(/User question 1/)).toBeInTheDocument();
    expect(screen.getByText(/User question 2/)).toBeInTheDocument();

    // Feedback shown on trace card
    expect(screen.getByText('Alice')).toBeInTheDocument();

    // Draft Rubric sidebar
    expect(screen.getByText(/Draft Rubric/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /create rubric/i })).toBeInTheDocument();
  });
});
```

**Step 2: Run test, verify fail**

Run: `cd client && npx vitest run src/components/discovery/FacilitatorDiscoveryWorkspace.test.tsx`

**Step 3: Write the implementation**

```tsx
// client/src/components/discovery/FacilitatorDiscoveryWorkspace.tsx
import React, { useState, useMemo } from 'react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useUser } from '@/context/UserContext';
import {
  useAllTraces,
  useFacilitatorDiscoveryFeedback,
  useDiscoveryAnalyses,
  useRunDiscoveryAnalysis,
  useDraftRubricItems,
  useCreateDraftRubricItem,
  useWorkshop,
  useMLflowConfig,
  useUpdateDiscoveryModel,
} from '@/hooks/useWorkshopApi';
import { getModelOptions, getBackendModelName, getFrontendModelName } from '@/utils/modelMapping';
import { toast } from 'sonner';

import { DiscoveryOverviewBar } from './DiscoveryOverviewBar';
import { CrossTraceAnalysisSummary } from './CrossTraceAnalysisSummary';
import { DiscoveryTraceCard, type PromotePayload } from './DiscoveryTraceCard';
import { DraftRubricSidebar } from './DraftRubricSidebar';

interface FacilitatorDiscoveryWorkspaceProps {
  onNavigate: (phase: string) => void;
}

export const FacilitatorDiscoveryWorkspace: React.FC<FacilitatorDiscoveryWorkspaceProps> = ({
  onNavigate,
}) => {
  const { workshopId } = useWorkshopContext();
  const { user } = useUser();

  // Data
  const { data: workshop } = useWorkshop(workshopId!);
  const { data: traces } = useAllTraces(workshopId!);
  const { data: allFeedback } = useFacilitatorDiscoveryFeedback(workshopId!);
  const { data: analyses } = useDiscoveryAnalyses(workshopId!);
  const { data: draftItems = [] } = useDraftRubricItems(workshopId!);
  const { data: mlflowConfig } = useMLflowConfig(workshopId!);

  // Mutations
  const runAnalysis = useRunDiscoveryAnalysis(workshopId!);
  const createDraftItem = useCreateDraftRubricItem(workshopId!);
  const updateModelMutation = useUpdateDiscoveryModel(workshopId!);

  // State
  const [promotedKeys, setPromotedKeys] = useState<Set<string>>(new Set());

  const hasMlflowConfig = !!mlflowConfig;
  const modelOptions = getModelOptions(hasMlflowConfig);
  const currentModel = useMemo(() => {
    const backendName = workshop?.discovery_questions_model_name || 'demo';
    if (backendName === 'demo' || backendName === 'custom') return backendName;
    return getFrontendModelName(backendName);
  }, [workshop?.discovery_questions_model_name]);

  const currentAnalysis = analyses?.[0] ?? null;

  // Group feedback by trace
  const feedbackByTrace = useMemo(() => {
    const map = new Map<string, typeof allFeedback>();
    if (!allFeedback) return map;
    for (const fb of allFeedback) {
      if (!map.has(fb.trace_id)) map.set(fb.trace_id, []);
      map.get(fb.trace_id)!.push(fb);
    }
    return map;
  }, [allFeedback]);

  // Filter traces to active discovery traces
  const activeTraces = useMemo(() => {
    if (!traces) return [];
    const activeIds = workshop?.active_discovery_trace_ids;
    if (activeIds?.length) {
      return traces.filter((t) => activeIds.includes(t.id));
    }
    return traces;
  }, [traces, workshop?.active_discovery_trace_ids]);

  // Split analysis findings: trace-specific vs cross-trace
  const findingsByTrace = useMemo(() => {
    if (!currentAnalysis) return new Map<string, typeof currentAnalysis.findings>();
    const map = new Map<string, typeof currentAnalysis.findings>();
    for (const f of currentAnalysis.findings) {
      if (f.evidence_trace_ids.length === 1) {
        const tid = f.evidence_trace_ids[0];
        if (!map.has(tid)) map.set(tid, []);
        map.get(tid)!.push(f);
      }
    }
    return map;
  }, [currentAnalysis]);

  // Disagreements by trace
  const disagreementsByTrace = useMemo(() => {
    if (!currentAnalysis) return new Map();
    const map = new Map();
    const allDisagreements = [
      ...(currentAnalysis.disagreements?.high ?? []),
      ...(currentAnalysis.disagreements?.medium ?? []),
      ...(currentAnalysis.disagreements?.lower ?? []),
    ];
    for (const d of allDisagreements) {
      if (d.trace_id) {
        if (!map.has(d.trace_id)) map.set(d.trace_id, []);
        map.get(d.trace_id)!.push(d);
      }
    }
    return map;
  }, [currentAnalysis]);

  // Stats
  const participantCount = allFeedback
    ? new Set(allFeedback.map((f) => f.user_id)).size
    : 0;
  const feedbackCount = allFeedback?.length ?? 0;

  // Handlers
  const handleRunAnalysis = (template: string) => {
    const backendModel = getBackendModelName(currentModel);
    runAnalysis.mutate(
      { template, model: backendModel },
      {
        onSuccess: () => toast.success('Analysis completed'),
        onError: (err) => toast.error(err.message || 'Analysis failed'),
      }
    );
  };

  const handlePromote = (payload: PromotePayload) => {
    createDraftItem.mutate(
      {
        text: payload.text,
        source_type: payload.source_type,
        source_trace_ids: payload.source_trace_ids,
        promoted_by: user?.id || '',
      },
      {
        onSuccess: () => {
          toast.success('Added to draft rubric');
        },
        onError: (err) => toast.error(err.message || 'Failed to promote'),
      }
    );
  };

  const handleModelChange = (value: string) => {
    const backendName = value === 'demo' || value === 'custom' ? value : getBackendModelName(value);
    updateModelMutation.mutate({ model_name: backendName });
  };

  const isPaused = workshop?.completed_phases?.includes('discovery') ?? false;

  return (
    <div className="flex h-full">
      {/* Main content — scrollable trace feed */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <DiscoveryOverviewBar
          participantCount={participantCount}
          traceCount={activeTraces.length}
          feedbackCount={feedbackCount}
          currentModel={currentModel}
          modelOptions={modelOptions}
          onRunAnalysis={handleRunAnalysis}
          onModelChange={handleModelChange}
          onPauseToggle={() => {/* wire to phase control */}}
          onAddTraces={() => {/* wire to add traces */}}
          isPaused={isPaused}
          isAnalysisRunning={runAnalysis.isPending}
          hasMlflowConfig={hasMlflowConfig}
        />

        {currentAnalysis && (
          <CrossTraceAnalysisSummary
            analysis={currentAnalysis}
            onPromote={handlePromote}
            promotedKeys={promotedKeys}
          />
        )}

        {activeTraces.map((trace) => (
          <DiscoveryTraceCard
            key={trace.id}
            trace={trace}
            feedback={feedbackByTrace.get(trace.id) ?? []}
            findings={findingsByTrace.get(trace.id)}
            disagreements={disagreementsByTrace.get(trace.id)}
            onPromote={handlePromote}
            promotedKeys={promotedKeys}
          />
        ))}

        {activeTraces.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <p className="text-sm">No discovery traces yet. Add traces to get started.</p>
          </div>
        )}
      </div>

      {/* Draft Rubric Sidebar */}
      <div className="w-80 border-l bg-slate-50 overflow-y-auto shrink-0">
        <DraftRubricSidebar
          items={draftItems}
          workshopId={workshopId!}
          userId={user?.id || ''}
          onCreateRubric={() => onNavigate('rubric')}
        />
      </div>
    </div>
  );
};
```

**Step 4: Run test, verify pass**

Run: `cd client && npx vitest run src/components/discovery/FacilitatorDiscoveryWorkspace.test.tsx`

**Step 5: Commit**

```bash
git add client/src/components/discovery/FacilitatorDiscoveryWorkspace.tsx client/src/components/discovery/FacilitatorDiscoveryWorkspace.test.tsx
git commit -m "feat: add FacilitatorDiscoveryWorkspace two-panel layout"
```

---

### Task 6: Wire workspace into routing

Replace the `discovery-monitor` and `findings-review` views in `WorkshopDemoLanding.tsx` with the new workspace.

**Files:**
- Modify: `client/src/pages/WorkshopDemoLanding.tsx`

**Step 1: Update the import**

At the top of `WorkshopDemoLanding.tsx`, add:
```tsx
import { FacilitatorDiscoveryWorkspace } from '@/components/discovery/FacilitatorDiscoveryWorkspace';
```

**Step 2: Replace the `discovery-monitor` case**

In `renderCurrentView()`, change:
```tsx
case 'discovery-monitor':
  return <FacilitatorDashboard onNavigate={handleNavigation} focusPhase={'discovery'} />;
```
to:
```tsx
case 'discovery-monitor':
  return <FacilitatorDiscoveryWorkspace onNavigate={handleNavigation} />;
```

**Step 3: Remove the `findings-review` case**

The `findings-review` view is no longer needed — findings are co-located on trace cards. Remove:
```tsx
case 'findings-review':
  return <FindingsReviewPage onBack={() => setCurrentView('discovery-monitor')} />;
```

Also remove the `view-all-findings` → `findings-review` mapping in `getViewForPhaseWithState`:
```tsx
case 'view-all-findings': return 'findings-review';
```
Replace with:
```tsx
case 'view-all-findings': return 'discovery-monitor';
```
(So any remaining references to `view-all-findings` just go to the workspace.)

**Step 4: Verify lint passes**

Run: `cd client && npx tsc --noEmit`
Run: `just ui-lint`

**Step 5: Commit**

```bash
git add client/src/pages/WorkshopDemoLanding.tsx
git commit -m "feat: wire FacilitatorDiscoveryWorkspace into routing"
```

---

### Task 7: Create barrel export and clean up imports

**Files:**
- Create: `client/src/components/discovery/index.ts`

**Step 1: Create barrel export**

```ts
// client/src/components/discovery/index.ts
export { FacilitatorDiscoveryWorkspace } from './FacilitatorDiscoveryWorkspace';
export { DiscoveryTraceCard } from './DiscoveryTraceCard';
export { DiscoveryOverviewBar } from './DiscoveryOverviewBar';
export { CrossTraceAnalysisSummary } from './CrossTraceAnalysisSummary';
export { DraftRubricSidebar } from './DraftRubricSidebar';
```

**Step 2: Verify all tests pass**

Run: `just ui-test-unit`

**Step 3: Verify lint passes**

Run: `just ui-lint`

**Step 4: Commit**

```bash
git add client/src/components/discovery/index.ts
git commit -m "chore: add barrel export for discovery workspace components"
```

---

### Task 8: Run full test suite and fix any regressions

Existing tests for `DiscoveryAnalysisTab`, `DraftRubricPanel`, and `FacilitatorDashboard` should still pass since we haven't deleted those components — they're just not used in the discovery-monitor route anymore.

**Step 1: Run all frontend unit tests**

Run: `just ui-test-unit`

**Step 2: Run lint**

Run: `just ui-lint`

**Step 3: Fix any failures**

Common issues to watch for:
- Import path changes if any component imported `FindingsReviewPage` directly
- TypeScript errors from new components needing stricter types
- Test mocking mismatches

**Step 4: Commit fixes if needed**

```bash
git add -A
git commit -m "fix: resolve test regressions from workspace integration"
```

---

## Notes for Implementing Agent

### Key files to reference:
- **Existing hooks:** `client/src/hooks/useWorkshopApi.ts` — all data fetching is already implemented
- **Types:** `client/src/client/models/` — generated API types
- **Model mapping:** `client/src/utils/modelMapping.ts` — `getModelOptions`, `getBackendModelName`, `getFrontendModelName`
- **Existing component to base DraftRubricSidebar on:** `client/src/components/DraftRubricPanel.tsx`
- **Spec:** `specs/DISCOVERY_SPEC.md` — Facilitator Discovery Workspace section

### What NOT to change:
- No backend changes needed
- No API endpoint changes
- Don't delete `FacilitatorDashboard.tsx` — it's still used for annotation monitoring
- Don't delete `FindingsReviewPage.tsx` or `DiscoveryAnalysisTab.tsx` yet — clean up in a follow-up PR after workspace is validated
- Don't modify `DraftRubricPanel.tsx` — the new sidebar is a fresh component

### Test commands:
- `just ui-test-unit` — all frontend unit tests
- `just ui-lint` — TypeScript + ESLint
- `cd client && npx vitest run src/components/discovery/` — just workspace tests
