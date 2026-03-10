// @spec DISCOVERY_SPEC
// @req Single two-panel workspace replaces multi-page flow (no FacilitatorDashboard discovery tabs, no FindingsReviewPage)
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
  useUpdateDraftRubricItem: () => ({ mutate: vi.fn(), isPending: false }),
  useDeleteDraftRubricItem: () => ({ mutate: vi.fn(), isPending: false }),
  useSuggestGroups: () => ({ mutate: vi.fn(), isPending: false }),
  useApplyGroups: () => ({ mutate: vi.fn(), isPending: false }),
  useCreateRubricFromDraft: () => ({ mutate: vi.fn(), isPending: false }),
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
