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
    // Group heading should be visible (use heading role to avoid matching dropdown options)
    expect(screen.getByRole('heading', { name: /Response Quality/ })).toBeInTheDocument();
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
