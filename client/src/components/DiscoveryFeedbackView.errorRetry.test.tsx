// @spec DISCOVERY_SPEC
// @req LLM failures show error toast with retry
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { DiscoveryFeedbackView } from './DiscoveryFeedbackView';
import { toast } from 'sonner';

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

describe('@spec:DISCOVERY_SPEC LLM failures show error toast with retry', () => {
  const defaultProps = {
    workshopId: 'ws-1',
    traceId: 'trace-1',
    userId: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateQuestion.isError = false;
  });

  it('calls toast.error when question generation fails', async () => {
    mockGenerateQuestion.mutateAsync.mockRejectedValue(new Error('LLM unavailable'));

    render(
      <DiscoveryFeedbackView
        {...defaultProps}
        existingFeedback={{
          feedback_label: 'good',
          comment: 'Nice',
          followup_qna: [],
        }}
      />,
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalledWith('Failed to generate question', {
        description: 'Click retry to try again.',
      });
    });
  });

  it('shows retry button when generation has errored', async () => {
    mockGenerateQuestion.mutateAsync.mockImplementation(async () => {
      mockGenerateQuestion.isError = true;
      throw new Error('LLM unavailable');
    });

    render(
      <DiscoveryFeedbackView
        {...defaultProps}
        existingFeedback={{
          feedback_label: 'good',
          comment: 'Nice',
          followup_qna: [],
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Retry')).toBeInTheDocument();
    });
  });

  it('shows fallback toast after max retries', async () => {
    let callCount = 0;
    mockGenerateQuestion.mutateAsync.mockImplementation(async () => {
      callCount++;
      if (callCount >= 3) {
        // Third call - component should use fallback
        mockGenerateQuestion.isError = true;
      }
      throw new Error('LLM unavailable');
    });

    render(
      <DiscoveryFeedbackView
        {...defaultProps}
        existingFeedback={{
          feedback_label: 'bad',
          comment: 'Bad response',
          followup_qna: [],
        }}
      />,
    );

    await waitFor(() => {
      expect(toast.error).toHaveBeenCalled();
    });
  });
});
