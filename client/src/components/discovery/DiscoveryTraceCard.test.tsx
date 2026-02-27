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
    // promoteButtons[0] is the disagreement, [1] is the finding
    await userEvent.click(promoteButtons[1]);
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
