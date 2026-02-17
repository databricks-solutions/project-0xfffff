// @spec DISCOVERY_SPEC
// @req Progressive disclosure (one question at a time)
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
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

describe('@spec:DISCOVERY_SPEC Progressive disclosure', () => {
  const defaultProps = {
    workshopId: 'ws-1',
    traceId: 'trace-1',
    userId: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateQuestion.isError = false;
  });

  it('shows only feedback form in initial state', () => {
    render(<DiscoveryFeedbackView {...defaultProps} />);

    expect(screen.getByText('How would you rate this response?')).toBeInTheDocument();
    expect(screen.getByText('Submit Feedback')).toBeInTheDocument();
    // No question or answer UI yet
    expect(screen.queryByText('Generating follow-up question...')).not.toBeInTheDocument();
    expect(screen.queryByText('Submit Answer')).not.toBeInTheDocument();
  });

  it('shows exactly one question at a time when answering', async () => {
    mockGenerateQuestion.mutateAsync.mockResolvedValue({
      question: 'First follow-up question?',
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
      expect(screen.getByText('First follow-up question?')).toBeInTheDocument();
    });

    // One answer form visible, no feedback form
    expect(screen.getByText('Submit Answer')).toBeInTheDocument();
    expect(screen.queryByText('Submit Feedback')).not.toBeInTheDocument();
    // Only Question 1 label visible (no Question 2 or 3)
    expect(screen.getByText('Question 1')).toBeInTheDocument();
    expect(screen.queryByText('Question 2')).not.toBeInTheDocument();
  });

  it('hides feedback form after feedback is submitted', async () => {
    mockGenerateQuestion.mutateAsync.mockResolvedValue({
      question: 'Follow-up?',
    });

    render(
      <DiscoveryFeedbackView
        {...defaultProps}
        existingFeedback={{
          feedback_label: 'bad',
          comment: 'Not good',
          followup_qna: [],
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Follow-up?')).toBeInTheDocument();
    });

    expect(screen.queryByText('How would you rate this response?')).not.toBeInTheDocument();
  });

  it('shows completion state after all questions', () => {
    mockGenerateQuestion.mutateAsync.mockResolvedValue({ question: 'Q?' });

    render(
      <DiscoveryFeedbackView
        {...defaultProps}
        existingFeedback={{
          feedback_label: 'good',
          comment: 'Great',
          followup_qna: [
            { question: 'Q1?', answer: 'A1' },
            { question: 'Q2?', answer: 'A2' },
            { question: 'Q3?', answer: 'A3' },
          ],
        }}
      />,
    );

    expect(screen.getByText('Feedback complete for this trace')).toBeInTheDocument();
    expect(screen.queryByText('Submit Feedback')).not.toBeInTheDocument();
    expect(screen.queryByText('Submit Answer')).not.toBeInTheDocument();
  });
});
