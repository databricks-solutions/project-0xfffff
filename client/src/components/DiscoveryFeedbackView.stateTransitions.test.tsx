// @spec DISCOVERY_SPEC
// @req Smooth transitions between feedback states
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor, fireEvent } from '@testing-library/react';
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

describe('@spec:DISCOVERY_SPEC Smooth transitions between feedback states', () => {
  const defaultProps = {
    workshopId: 'ws-1',
    traceId: 'trace-1',
    userId: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateQuestion.isError = false;
  });

  it('transitions from feedback to generating_q1 on submit (spinner replaces form)', async () => {
    mockSubmitFeedback.mutateAsync.mockResolvedValue({
      id: 'f1',
      feedback_label: 'good',
      comment: 'Good response',
      followup_qna: [],
    });
    // Never resolve so we stay in generating state
    mockGenerateQuestion.mutateAsync.mockReturnValue(new Promise(() => {}));

    render(<DiscoveryFeedbackView {...defaultProps} />);

    // Initial: feedback form visible
    expect(screen.getByText('Submit Feedback')).toBeInTheDocument();

    // Select "Good" and type comment
    fireEvent.click(screen.getByText('Good'));
    fireEvent.change(
      screen.getByPlaceholderText('What specifically about this response influenced your rating?'),
      { target: { value: 'Good response' } },
    );

    // Submit feedback
    fireEvent.click(screen.getByText('Submit Feedback'));

    // Spinner replaces form
    await waitFor(() => {
      expect(screen.getByText('Generating follow-up question...')).toBeInTheDocument();
    });
    expect(screen.queryByText('Submit Feedback')).not.toBeInTheDocument();
  });

  it('completes full Q&A cycle through all states (Q1 → Q2 → Q3 → done)', async () => {
    mockGenerateQuestion.mutateAsync
      .mockResolvedValueOnce({ question: 'Follow-up Q1?', question_number: 1 })
      .mockResolvedValueOnce({ question: 'Follow-up Q2?', question_number: 2 })
      .mockResolvedValueOnce({ question: 'Follow-up Q3?', question_number: 3 });

    mockSubmitAnswer.mutateAsync
      .mockResolvedValueOnce({ feedback_id: 'f1', qna_count: 1, complete: false })
      .mockResolvedValueOnce({ feedback_id: 'f1', qna_count: 2, complete: false })
      .mockResolvedValueOnce({ feedback_id: 'f1', qna_count: 3, complete: true });

    render(
      <DiscoveryFeedbackView
        {...defaultProps}
        existingFeedback={{
          feedback_label: 'good',
          comment: 'Nice',
          followup_qna: [],
        } as any}
      />,
    );

    // Q1 appears
    await waitFor(() => {
      expect(screen.getByText('Follow-up Q1?')).toBeInTheDocument();
    });
    expect(screen.getByText('Question 1')).toBeInTheDocument();

    // Answer Q1
    fireEvent.change(screen.getByPlaceholderText('Type your answer...'), {
      target: { value: 'Answer 1' },
    });
    fireEvent.click(screen.getByText('Submit Answer'));

    // Q2 appears
    await waitFor(() => {
      expect(screen.getByText('Follow-up Q2?')).toBeInTheDocument();
    });
    expect(screen.getByText('Question 2')).toBeInTheDocument();

    // Answer Q2
    fireEvent.change(screen.getByPlaceholderText('Type your answer...'), {
      target: { value: 'Answer 2' },
    });
    fireEvent.click(screen.getByText('Submit Answer'));

    // Q3 appears
    await waitFor(() => {
      expect(screen.getByText('Follow-up Q3?')).toBeInTheDocument();
    });
    expect(screen.getByText('Question 3')).toBeInTheDocument();

    // Answer Q3
    fireEvent.change(screen.getByPlaceholderText('Type your answer...'), {
      target: { value: 'Answer 3' },
    });
    fireEvent.click(screen.getByText('Submit Answer'));

    // Complete state
    await waitFor(() => {
      expect(screen.getByText('Feedback complete for this trace')).toBeInTheDocument();
    });
  });

  it('restores to answering_q2 when existingFeedback has 1 QA pair', async () => {
    mockGenerateQuestion.mutateAsync.mockResolvedValue({
      question: 'Generated Q2?',
      question_number: 2,
    });

    render(
      <DiscoveryFeedbackView
        {...defaultProps}
        existingFeedback={{
          feedback_label: 'good',
          comment: 'Nice',
          followup_qna: [{ question: 'Q1?', answer: 'A1' }],
        } as any}
      />,
    );

    // Transitions through generating_q2 → answering_q2
    await waitFor(() => {
      expect(screen.getByText('Question 2')).toBeInTheDocument();
    });
    expect(screen.getByText('Generated Q2?')).toBeInTheDocument();
    // Previous Q1 pair shown as read-only
    expect(screen.getByText('Q1?')).toBeInTheDocument();
    expect(screen.getByText('A1')).toBeInTheDocument();
  });

  it('restores to answering_q3 when existingFeedback has 2 QA pairs', async () => {
    mockGenerateQuestion.mutateAsync.mockResolvedValue({
      question: 'Generated Q3?',
      question_number: 3,
    });

    render(
      <DiscoveryFeedbackView
        {...defaultProps}
        existingFeedback={{
          feedback_label: 'bad',
          comment: 'Not great',
          followup_qna: [
            { question: 'Q1?', answer: 'A1' },
            { question: 'Q2?', answer: 'A2' },
          ],
        } as any}
      />,
    );

    // Transitions through generating_q3 → answering_q3
    await waitFor(() => {
      expect(screen.getByText('Question 3')).toBeInTheDocument();
    });
    expect(screen.getByText('Generated Q3?')).toBeInTheDocument();
    // Previous Q1 and Q2 pairs shown as read-only
    expect(screen.getByText('Q1?')).toBeInTheDocument();
    expect(screen.getByText('Q2?')).toBeInTheDocument();
  });

  it('restores to complete when existingFeedback has 3 QA pairs', () => {
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
        } as any}
      />,
    );

    expect(screen.getByText('Feedback complete for this trace')).toBeInTheDocument();
    // All 3 Q&A pairs visible
    expect(screen.getByText('Q1?')).toBeInTheDocument();
    expect(screen.getByText('Q2?')).toBeInTheDocument();
    expect(screen.getByText('Q3?')).toBeInTheDocument();
  });

  it('resets to feedback state when traceId changes with no existingFeedback', async () => {
    const { rerender } = render(
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
        } as any}
      />,
    );

    // Start in complete state
    expect(screen.getByText('Feedback complete for this trace')).toBeInTheDocument();

    // Change traceId with no existingFeedback
    rerender(
      <DiscoveryFeedbackView
        {...defaultProps}
        traceId="trace-2"
        existingFeedback={null}
      />,
    );

    // Should reset to feedback form
    await waitFor(() => {
      expect(screen.getByText('How would you rate this response?')).toBeInTheDocument();
    });
    expect(screen.getByText('Submit Feedback')).toBeInTheDocument();
    expect(screen.queryByText('Feedback complete for this trace')).not.toBeInTheDocument();
  });

  it('spinner has animate-spin class during generating states', () => {
    // Never resolve so we stay in generating state
    mockGenerateQuestion.mutateAsync.mockReturnValue(new Promise(() => {}));

    const { container } = render(
      <DiscoveryFeedbackView
        {...defaultProps}
        existingFeedback={{
          feedback_label: 'good',
          comment: 'Nice',
          followup_qna: [],
        } as any}
      />,
    );

    // In generating_q1 state
    expect(screen.getByText('Generating follow-up question...')).toBeInTheDocument();
    const spinner = container.querySelector('.animate-spin');
    expect(spinner).not.toBeNull();
  });

  it('onComplete fires via Next Trace button after completing Q3', () => {
    const onComplete = vi.fn();

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
        } as any}
        onComplete={onComplete}
      />,
    );

    // Complete state with Next Trace button
    expect(screen.getByText('Feedback complete for this trace')).toBeInTheDocument();

    fireEvent.click(screen.getByText('Next Trace'));
    expect(onComplete).toHaveBeenCalledOnce();
  });
});
