// @spec DISCOVERY_SPEC
// @req Previous Q&A visible while answering new questions
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

describe('@spec:DISCOVERY_SPEC Previous Q&A visible while answering', () => {
  const defaultProps = {
    workshopId: 'ws-1',
    traceId: 'trace-1',
    userId: 'user-1',
  };

  beforeEach(() => {
    vi.clearAllMocks();
    mockGenerateQuestion.isError = false;
  });

  it('shows previous Q&A pairs when answering Q3', async () => {
    mockGenerateQuestion.mutateAsync.mockResolvedValue({
      question: 'Third follow-up question?',
    });

    render(
      <DiscoveryFeedbackView
        {...defaultProps}
        existingFeedback={{
          feedback_label: 'good',
          comment: 'Great response',
          followup_qna: [
            { question: 'First question?', answer: 'First answer' },
            { question: 'Second question?', answer: 'Second answer' },
          ],
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Third follow-up question?')).toBeInTheDocument();
    });

    // Previous Q&A pairs should be visible as read-only
    expect(screen.getByText('First question?')).toBeInTheDocument();
    expect(screen.getByText('First answer')).toBeInTheDocument();
    expect(screen.getByText('Second question?')).toBeInTheDocument();
    expect(screen.getByText('Second answer')).toBeInTheDocument();
  });

  it('labels previous Q&A with question numbers', async () => {
    mockGenerateQuestion.mutateAsync.mockResolvedValue({
      question: 'Follow-up Q3?',
    });

    render(
      <DiscoveryFeedbackView
        {...defaultProps}
        existingFeedback={{
          feedback_label: 'bad',
          comment: 'Poor response',
          followup_qna: [
            { question: 'Q1?', answer: 'A1' },
            { question: 'Q2?', answer: 'A2' },
          ],
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Follow-up Q3?')).toBeInTheDocument();
    });

    expect(screen.getByText('Question 1')).toBeInTheDocument();
    expect(screen.getByText('Question 2')).toBeInTheDocument();
  });

  it('shows single previous Q&A when answering Q2', async () => {
    mockGenerateQuestion.mutateAsync.mockResolvedValue({
      question: 'Second follow-up?',
    });

    render(
      <DiscoveryFeedbackView
        {...defaultProps}
        existingFeedback={{
          feedback_label: 'good',
          comment: 'Nice',
          followup_qna: [{ question: 'First Q?', answer: 'First A' }],
        }}
      />,
    );

    await waitFor(() => {
      expect(screen.getByText('Second follow-up?')).toBeInTheDocument();
    });

    expect(screen.getByText('First Q?')).toBeInTheDocument();
    expect(screen.getByText('First A')).toBeInTheDocument();
  });
});
