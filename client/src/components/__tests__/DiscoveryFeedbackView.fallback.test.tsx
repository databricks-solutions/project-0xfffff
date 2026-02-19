// @spec DISCOVERY_SPEC
// @req Fallback warning banner shown only to facilitators, never to participants/SMEs
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DiscoveryFeedbackView } from '../DiscoveryFeedbackView';

const mockSubmitFeedback = { mutateAsync: vi.fn(), isPending: false };
const mockGenerateQuestion = { mutateAsync: vi.fn(), isPending: false, isError: false };
const mockSubmitAnswer = { mutateAsync: vi.fn(), isPending: false };

vi.mock('@/hooks/useWorkshopApi', () => ({
  useSubmitDiscoveryFeedback: () => mockSubmitFeedback,
  useGenerateFollowUpQuestion: () => mockGenerateQuestion,
  useSubmitFollowUpAnswer: () => mockSubmitAnswer,
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

describe('@spec:DISCOVERY_SPEC Fallback warning banner visibility', () => {
  const defaultProps = {
    workshopId: 'ws-1',
    traceId: 'trace-1',
    userId: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateQuestion.isError = false;
  });

  it('does NOT show fallback warning banner for participants when fallback is active', async () => {
    // Generate question returns is_fallback: true
    mockGenerateQuestion.mutateAsync.mockResolvedValue({
      question: 'Fallback question for participant?',
      is_fallback: true,
    });

    render(
      <DiscoveryFeedbackView
        {...defaultProps}
        isFacilitator={false}
        existingFeedback={{
          feedback_label: 'good',
          comment: 'Nice response',
          followup_qna: [],
        } as any}
      />,
    );

    // Wait for the component to transition to answering_q1
    await waitFor(() => {
      expect(screen.getByText('Fallback question for participant?')).toBeInTheDocument();
    });

    // The amber fallback warning banner should NOT be shown to participants
    expect(screen.queryByText(/LLM generation unavailable/)).not.toBeInTheDocument();
  });

  it('shows fallback warning banner for facilitators when fallback is active', async () => {
    // Generate question returns is_fallback: true
    mockGenerateQuestion.mutateAsync.mockResolvedValue({
      question: 'Fallback question for facilitator?',
      is_fallback: true,
    });

    render(
      <DiscoveryFeedbackView
        {...defaultProps}
        isFacilitator={true}
        existingFeedback={{
          feedback_label: 'bad',
          comment: 'Poor response',
          followup_qna: [],
        } as any}
      />,
    );

    // Wait for the component to transition to answering_q1
    await waitFor(() => {
      expect(screen.getByText('Fallback question for facilitator?')).toBeInTheDocument();
    });

    // The amber fallback warning banner SHOULD be shown to facilitators
    expect(
      screen.getByText(/LLM generation unavailable/),
    ).toBeInTheDocument();
  });
});
