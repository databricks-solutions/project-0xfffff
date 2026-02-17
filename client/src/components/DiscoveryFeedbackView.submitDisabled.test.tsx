// @spec DISCOVERY_SPEC
// @req Submit buttons disabled until required fields filled
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
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

describe('@spec:DISCOVERY_SPEC Submit buttons disabled until fields filled', () => {
  const defaultProps = {
    workshopId: 'ws-1',
    traceId: 'trace-1',
    userId: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateQuestion.isError = false;
  });

  it('disables Submit Feedback when no label or comment provided', () => {
    render(<DiscoveryFeedbackView {...defaultProps} />);

    const submitBtn = screen.getByText('Submit Feedback');
    expect(submitBtn).toBeDisabled();
  });

  it('disables Submit Feedback when only label selected', () => {
    render(<DiscoveryFeedbackView {...defaultProps} />);

    fireEvent.click(screen.getByText('Good'));

    const submitBtn = screen.getByText('Submit Feedback');
    expect(submitBtn).toBeDisabled();
  });

  it('disables Submit Feedback when only comment filled', () => {
    render(<DiscoveryFeedbackView {...defaultProps} />);

    const textarea = screen.getByPlaceholderText(
      'What specifically about this response influenced your rating?',
    );
    fireEvent.change(textarea, { target: { value: 'Some comment' } });

    const submitBtn = screen.getByText('Submit Feedback');
    expect(submitBtn).toBeDisabled();
  });

  it('enables Submit Feedback when both label and comment provided', () => {
    render(<DiscoveryFeedbackView {...defaultProps} />);

    fireEvent.click(screen.getByText('Good'));
    const textarea = screen.getByPlaceholderText(
      'What specifically about this response influenced your rating?',
    );
    fireEvent.change(textarea, { target: { value: 'Nice response' } });

    const submitBtn = screen.getByText('Submit Feedback');
    expect(submitBtn).toBeEnabled();
  });

  it('disables Submit Answer when answer textarea is empty', async () => {
    mockGenerateQuestion.mutateAsync.mockResolvedValue({
      question: 'A follow-up question?',
    });

    render(
      <DiscoveryFeedbackView
        {...defaultProps}
        existingFeedback={{
          feedback_label: 'good',
          comment: 'Great',
          followup_qna: [],
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('A follow-up question?')).toBeInTheDocument();
    });

    const submitAnswerBtn = screen.getByText('Submit Answer');
    expect(submitAnswerBtn).toBeDisabled();
  });

  it('enables Submit Answer when answer is provided', async () => {
    mockGenerateQuestion.mutateAsync.mockResolvedValue({
      question: 'A follow-up question?',
    });

    render(
      <DiscoveryFeedbackView
        {...defaultProps}
        existingFeedback={{
          feedback_label: 'good',
          comment: 'Great',
          followup_qna: [],
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('A follow-up question?')).toBeInTheDocument();
    });

    const textarea = screen.getByPlaceholderText('Type your answer...');
    fireEvent.change(textarea, { target: { value: 'My answer' } });

    const submitAnswerBtn = screen.getByText('Submit Answer');
    expect(submitAnswerBtn).toBeEnabled();
  });
});
