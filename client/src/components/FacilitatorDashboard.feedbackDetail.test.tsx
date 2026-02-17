// @spec DISCOVERY_SPEC
// @req Facilitator can view participant feedback details (label, comment, follow-up Q&A)
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, within, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { FacilitatorDashboard } from './FacilitatorDashboard';

// --- Mutable mock return values -------------------------------------------

const mockDiscoveryFeedback = {
  data: [] as Array<{
    id: string;
    workshop_id: string;
    trace_id: string;
    user_id: string;
    feedback_label: 'good' | 'bad';
    comment: string;
    followup_qna: Array<{ question: string; answer: string }>;
    created_at: string;
    updated_at: string;
  }>,
  isLoading: false,
};

vi.mock('@/hooks/useWorkshopApi', () => ({
  useWorkshop: () => ({
    data: {
      id: 'test-ws',
      current_phase: 'discovery',
      completed_phases: [],
      active_discovery_trace_ids: ['t1'],
    },
  }),
  useFacilitatorFindings: () => ({ data: [] }),
  useFacilitatorFindingsWithUserDetails: () => ({ data: [] }),
  useAllTraces: () => ({ data: [{ id: 't1', input: 'hi' }] }),
  useRubric: () => ({ data: null }),
  useFacilitatorAnnotations: () => ({ data: [] }),
  useFacilitatorAnnotationsWithUserDetails: () => ({ data: [] }),
  useDiscoveryFeedback: () => mockDiscoveryFeedback,
  useMLflowConfig: () => ({ data: null }),
  useUpdateDiscoveryModel: () => ({ mutate: vi.fn() }),
}));

vi.mock('@/context/WorkshopContext', () => ({
  useWorkshopContext: () => ({ workshopId: 'test-ws' }),
}));

vi.mock('@/context/WorkflowContext', () => ({
  useWorkflowContext: () => ({ currentPhase: 'discovery', setCurrentPhase: vi.fn() }),
}));

vi.mock('@/context/UserContext', () => ({
  useUser: () => ({
    user: { id: 'facilitator-1', name: 'Facilitator', role: 'facilitator' },
  }),
  useRoleCheck: () => ({
    isFacilitator: true,
    isSME: false,
    isParticipant: false,
    canManageWorkshop: true,
    canViewAllFindings: true,
    canViewAllAnnotations: true,
    canViewResults: true,
  }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn(), refetchQueries: vi.fn() }),
}));

vi.mock('./PhaseControlButton', () => ({
  PhaseControlButton: () => <div data-testid="mock-phase-control" />,
}));

vi.mock('./JsonPathSettings', () => ({
  JsonPathSettings: () => <div data-testid="mock-jsonpath-settings" />,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn(), success: vi.fn() },
}));

vi.mock('@/utils/rubricUtils', () => ({
  parseRubricQuestions: () => [],
}));

// Helper: switch to the Feedback Detail tab
async function switchToFeedbackTab() {
  const tab = screen.getByRole('tab', { name: /Feedback Detail/i });
  await userEvent.click(tab);
}

describe('@spec:DISCOVERY_SPEC FeedbackDetailPanel in FacilitatorDashboard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockDiscoveryFeedback.data = [];
    mockDiscoveryFeedback.isLoading = false;

    // Stub fetch calls made by FacilitatorDashboard (e.g. add-traces, reorder)
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({}), { status: 200 }),
    );
  });

  it('shows empty state when no feedback', async () => {
    mockDiscoveryFeedback.data = [];

    render(<FacilitatorDashboard onNavigate={vi.fn()} focusPhase="discovery" />);
    await switchToFeedbackTab();

    expect(screen.getByTestId('feedback-empty-state')).toBeInTheDocument();
    expect(screen.getByText('No feedback submitted yet')).toBeInTheDocument();
  });

  it('renders feedback grouped by trace', async () => {
    mockDiscoveryFeedback.data = [
      {
        id: 'fb-1',
        workshop_id: 'test-ws',
        trace_id: 'trace-abc',
        user_id: 'alice',
        feedback_label: 'good',
        comment: 'Looks great',
        followup_qna: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
      {
        id: 'fb-2',
        workshop_id: 'test-ws',
        trace_id: 'trace-abc',
        user_id: 'bob',
        feedback_label: 'bad',
        comment: 'Not good',
        followup_qna: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];

    render(<FacilitatorDashboard onNavigate={vi.fn()} focusPhase="discovery" />);
    await switchToFeedbackTab();

    // Both feedbacks share the same trace, so there should be exactly 1 trace group
    const traceGroups = screen.getAllByTestId('feedback-trace-group');
    expect(traceGroups).toHaveLength(1);

    // The badge on the trace group header should indicate 2 responses
    expect(screen.getByText('2 responses')).toBeInTheDocument();
  });

  it('shows label badge and comment per participant', async () => {
    mockDiscoveryFeedback.data = [
      {
        id: 'fb-3',
        workshop_id: 'test-ws',
        trace_id: 'trace-xyz',
        user_id: 'charlie',
        feedback_label: 'good',
        comment: 'Very helpful answer',
        followup_qna: [],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];

    render(<FacilitatorDashboard onNavigate={vi.fn()} focusPhase="discovery" />);
    await switchToFeedbackTab();

    // Expand the trace group to reveal participant rows
    const traceGroup = screen.getByTestId('feedback-trace-group');
    const expandButton = within(traceGroup).getByRole('button');
    await userEvent.click(expandButton);

    // Verify participant row is rendered
    const participantRow = screen.getByTestId('feedback-participant-row');
    expect(participantRow).toBeInTheDocument();

    // Badge should show the label in uppercase
    const badge = screen.getByTestId('feedback-label-badge');
    expect(badge).toHaveTextContent('GOOD');

    // Comment should be visible
    const comment = screen.getByTestId('feedback-comment');
    expect(comment).toHaveTextContent('Very helpful answer');
  });

  it('shows follow-up Q&A when expanded', async () => {
    mockDiscoveryFeedback.data = [
      {
        id: 'fb-4',
        workshop_id: 'test-ws',
        trace_id: 'trace-qna',
        user_id: 'diana',
        feedback_label: 'bad',
        comment: 'Incomplete',
        followup_qna: [
          { question: 'Why was the response incomplete?', answer: 'It skipped step 2.' },
          { question: 'What would you expect instead?', answer: 'A full walkthrough.' },
        ],
        created_at: '2026-01-01T00:00:00Z',
        updated_at: '2026-01-01T00:00:00Z',
      },
    ];

    render(<FacilitatorDashboard onNavigate={vi.fn()} focusPhase="discovery" />);
    await switchToFeedbackTab();

    // Expand trace group
    const traceGroup = screen.getByTestId('feedback-trace-group');
    const expandTraceBtn = within(traceGroup).getByRole('button');
    await userEvent.click(expandTraceBtn);

    // Click the "2 follow-up Q&A" toggle to expand the Q&A list
    const qnaToggle = screen.getByText('2 follow-up Q&A');
    await userEvent.click(qnaToggle);

    // The Q&A list should now be visible
    const qnaList = screen.getByTestId('feedback-qna-list');
    expect(qnaList).toBeInTheDocument();

    // Verify the questions and answers are rendered
    expect(within(qnaList).getByText(/Why was the response incomplete\?/)).toBeInTheDocument();
    expect(within(qnaList).getByText(/It skipped step 2\./)).toBeInTheDocument();
    expect(within(qnaList).getByText(/What would you expect instead\?/)).toBeInTheDocument();
    expect(within(qnaList).getByText(/A full walkthrough\./)).toBeInTheDocument();
  });
});
