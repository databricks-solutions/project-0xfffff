// @spec DISCOVERY_SPEC
// @req Loading spinner during LLM generation (1-3s)
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiscoveryFeedbackView } from './DiscoveryFeedbackView';

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

describe('@spec:DISCOVERY_SPEC Loading spinner during generation', () => {
  const defaultProps = {
    workshopId: 'ws-1',
    traceId: 'trace-1',
    userId: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateQuestion.isError = false;
  });

  it('shows loading spinner and message during question generation', () => {
    // Never-resolving promise keeps component in generating state
    mockGenerateQuestion.mutateAsync.mockReturnValue(new Promise(() => {}));

    render(
      <DiscoveryFeedbackView
        {...defaultProps}
        existingFeedback={{
          feedback_label: 'good',
          comment: 'Nice response',
          followup_qna: [],
        } as any}
      />,
    );

    expect(screen.getByText('Generating follow-up question...')).toBeInTheDocument();
  });

  it('renders spinner with animate-spin class', () => {
    mockGenerateQuestion.mutateAsync.mockReturnValue(new Promise(() => {}));

    const { container } = render(
      <DiscoveryFeedbackView
        {...defaultProps}
        existingFeedback={{
          feedback_label: 'bad',
          comment: 'Bad response',
          followup_qna: [],
        } as any}
      />,
    );

    const spinner = container.querySelector('.animate-spin');
    expect(spinner).toBeInTheDocument();
  });

  it('hides feedback form while generating', () => {
    mockGenerateQuestion.mutateAsync.mockReturnValue(new Promise(() => {}));

    render(
      <DiscoveryFeedbackView
        {...defaultProps}
        existingFeedback={{
          feedback_label: 'good',
          comment: 'Good',
          followup_qna: [],
        } as any}
      />,
    );

    expect(screen.queryByText('Submit Feedback')).not.toBeInTheDocument();
    expect(screen.queryByText('Submit Answer')).not.toBeInTheDocument();
  });
});
