import React, { useState, useCallback, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Loader2, ThumbsUp, ThumbsDown, CheckCircle2, AlertCircle, RotateCcw, AlertTriangle } from 'lucide-react';
import { toast } from 'sonner';
import {
  useSubmitDiscoveryFeedback,
  useGenerateFollowUpQuestion,
  useSubmitFollowUpAnswer,
  type DiscoveryFeedbackData,
} from '@/hooks/useWorkshopApi';

type FeedbackState =
  | 'feedback'
  | 'generating_q1'
  | 'answering_q1'
  | 'generating_q2'
  | 'answering_q2'
  | 'generating_q3'
  | 'answering_q3'
  | 'complete';

interface Props {
  workshopId: string;
  traceId: string;
  userId: string;
  existingFeedback?: DiscoveryFeedbackData | null;
  onComplete?: () => void;
  isFacilitator?: boolean;
}

export const DiscoveryFeedbackView: React.FC<Props> = ({
  workshopId,
  traceId,
  userId,
  existingFeedback,
  onComplete,
  isFacilitator = false,
}) => {
  // State machine
  const [state, setState] = useState<FeedbackState>('feedback');
  const [feedbackLabel, setFeedbackLabel] = useState<'good' | 'bad' | null>(null);
  const [comment, setComment] = useState('');
  const [currentQuestion, setCurrentQuestion] = useState('');
  const [currentAnswer, setCurrentAnswer] = useState('');
  const [qnaPairs, setQnaPairs] = useState<Array<{ question: string; answer: string }>>([]);
  const [retryCount, setRetryCount] = useState(0);
  const [usingFallback, setUsingFallback] = useState(false);

  // Mutations
  const submitFeedback = useSubmitDiscoveryFeedback(workshopId);
  const generateQuestion = useGenerateFollowUpQuestion(workshopId);
  const submitAnswer = useSubmitFollowUpAnswer(workshopId);

  // Restore state from existing feedback when trace changes
  useEffect(() => {
    if (existingFeedback) {
      const qna = existingFeedback.followup_qna || [];
      setFeedbackLabel(existingFeedback.feedback_label);
      setComment(existingFeedback.comment);
      setQnaPairs(qna);

      if (qna.length >= 3) {
        setState('complete');
      } else if (qna.length === 2) {
        setState('generating_q3');
      } else if (qna.length === 1) {
        setState('generating_q2');
      } else {
        setState('generating_q1');
      }
    } else {
      setState('feedback');
      setFeedbackLabel(null);
      setComment('');
      setCurrentQuestion('');
      setCurrentAnswer('');
      setQnaPairs([]);
      setRetryCount(0);
      setUsingFallback(false);
    }
  }, [traceId, existingFeedback]);

  // Auto-generate question when entering a generating state
  useEffect(() => {
    if (state === 'generating_q1' || state === 'generating_q2' || state === 'generating_q3') {
      const qNum = state === 'generating_q1' ? 1 : state === 'generating_q2' ? 2 : 3;
      generateQuestionForNumber(qNum);
    }
  }, [state]);

  const generateQuestionForNumber = useCallback(
    async (questionNumber: number) => {
      setRetryCount(0);
      try {
        const result = await generateQuestion.mutateAsync({
          trace_id: traceId,
          user_id: userId,
          question_number: questionNumber,
        });
        setCurrentQuestion(result.question);
        setCurrentAnswer('');
        if (result.is_fallback) {
          setUsingFallback(true);
        }
        setState(`answering_q${questionNumber}` as FeedbackState);
      } catch (err) {
        setRetryCount((prev) => prev + 1);
        if (retryCount >= 2) {
          // Fallback after 3 total attempts
          setCurrentQuestion(
            `Could you elaborate more on your ${feedbackLabel === 'good' ? 'positive' : 'negative'} assessment?`,
          );
          setCurrentAnswer('');
          setUsingFallback(true);
          setState(`answering_q${questionNumber}` as FeedbackState);
          toast.error('Question generation failed', {
            description: 'Using a fallback question. You can continue.',
          });
        } else {
          toast.error('Failed to generate question', {
            description: 'Click retry to try again.',
          });
        }
      }
    },
    [traceId, userId, generateQuestion, retryCount, feedbackLabel],
  );

  const handleSubmitFeedback = useCallback(async () => {
    if (!feedbackLabel || !comment.trim()) return;

    try {
      await submitFeedback.mutateAsync({
        trace_id: traceId,
        user_id: userId,
        feedback_label: feedbackLabel,
        comment: comment.trim(),
      });
      setState('generating_q1');
    } catch (err) {
      toast.error('Failed to submit feedback', {
        description: 'Please try again.',
      });
    }
  }, [feedbackLabel, comment, traceId, userId, submitFeedback]);

  const handleSubmitAnswer = useCallback(async () => {
    if (!currentAnswer.trim() || !currentQuestion) return;

    const qNum = state === 'answering_q1' ? 1 : state === 'answering_q2' ? 2 : 3;

    try {
      const result = await submitAnswer.mutateAsync({
        trace_id: traceId,
        user_id: userId,
        question: currentQuestion,
        answer: currentAnswer.trim(),
      });

      const newPair = { question: currentQuestion, answer: currentAnswer.trim() };
      setQnaPairs((prev) => [...prev, newPair]);
      setCurrentAnswer('');
      setCurrentQuestion('');

      if (result.complete || qNum >= 3) {
        setState('complete');
      } else {
        setState(`generating_q${qNum + 1}` as FeedbackState);
      }
    } catch (err) {
      toast.error('Failed to submit answer', {
        description: 'Please try again.',
      });
    }
  }, [currentAnswer, currentQuestion, state, traceId, userId, submitAnswer]);

  const isGenerating = state.startsWith('generating_');
  const isAnswering = state.startsWith('answering_');

  return (
    <Card className="border-l-4 border-blue-500">
      <CardContent className="p-4 space-y-4">
        <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
          Feedback
        </h3>

        {/* Feedback Form */}
        {state === 'feedback' && (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label className="text-xs font-medium text-gray-600">
                How would you rate this response?
              </Label>
              <div className="flex gap-3">
                <Button
                  variant={feedbackLabel === 'good' ? 'default' : 'outline'}
                  className={feedbackLabel === 'good' ? 'bg-green-600 hover:bg-green-700' : ''}
                  onClick={() => setFeedbackLabel('good')}
                  size="sm"
                >
                  <ThumbsUp className="w-4 h-4 mr-1" />
                  Good
                </Button>
                <Button
                  variant={feedbackLabel === 'bad' ? 'default' : 'outline'}
                  className={feedbackLabel === 'bad' ? 'bg-red-600 hover:bg-red-700' : ''}
                  onClick={() => setFeedbackLabel('bad')}
                  size="sm"
                >
                  <ThumbsDown className="w-4 h-4 mr-1" />
                  Bad
                </Button>
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback-comment" className="text-xs font-medium text-gray-600">
                Explain your reasoning
              </Label>
              <Textarea
                id="feedback-comment"
                placeholder="What specifically about this response influenced your rating?"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                className="min-h-[100px]"
              />
            </div>

            <Button
              onClick={handleSubmitFeedback}
              disabled={!feedbackLabel || !comment.trim() || submitFeedback.isPending}
              className="w-full"
            >
              {submitFeedback.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Feedback'
              )}
            </Button>
          </div>
        )}

        {/* Fallback warning — facilitator-only */}
        {isFacilitator && usingFallback && (state.startsWith('answering_') || state === 'complete') && (
          <div className="flex items-start gap-2 p-2.5 bg-amber-50 border border-amber-200 rounded-md">
            <AlertTriangle className="w-4 h-4 text-amber-500 mt-0.5 flex-shrink-0" />
            <p className="text-xs text-amber-700">
              Using default questions — LLM generation unavailable. Check that the Databricks token is configured and the model endpoint is reachable.
            </p>
          </div>
        )}

        {/* Loading Spinner */}
        {isGenerating && (
          <div className="flex flex-col items-center py-8 space-y-3">
            <Loader2 className="w-8 h-8 text-blue-500 animate-spin" />
            <p className="text-sm text-gray-500">Generating follow-up question...</p>
            {generateQuestion.isError && (
              <Button
                variant="outline"
                size="sm"
                onClick={() => {
                  const qNum = state === 'generating_q1' ? 1 : state === 'generating_q2' ? 2 : 3;
                  generateQuestionForNumber(qNum);
                }}
              >
                <RotateCcw className="w-4 h-4 mr-1" />
                Retry
              </Button>
            )}
          </div>
        )}

        {/* Previous Q&A pairs (read-only) */}
        {(isAnswering || state === 'complete') && qnaPairs.length > 0 && (
          <div className="space-y-3">
            {qnaPairs.map((pair, i) => (
              <div key={i} className="bg-gray-50 rounded-lg p-3 space-y-1">
                <p className="text-xs font-medium text-gray-500">Question {i + 1}</p>
                <p className="text-sm text-gray-700">{pair.question}</p>
                <p className="text-xs font-medium text-gray-500 mt-2">Your answer</p>
                <p className="text-sm text-gray-600">{pair.answer}</p>
              </div>
            ))}
          </div>
        )}

        {/* Current Question + Answer Form */}
        {isAnswering && (
          <div className="space-y-3 border-t pt-3">
            <div className="bg-blue-50 rounded-lg p-3">
              <p className="text-xs font-medium text-blue-600 mb-1">
                Question {state === 'answering_q1' ? 1 : state === 'answering_q2' ? 2 : 3}
              </p>
              <p className="text-sm text-gray-800">{currentQuestion}</p>
            </div>

            <Textarea
              placeholder="Type your answer..."
              value={currentAnswer}
              onChange={(e) => setCurrentAnswer(e.target.value)}
              className="min-h-[80px]"
            />

            <Button
              onClick={handleSubmitAnswer}
              disabled={!currentAnswer.trim() || submitAnswer.isPending}
              className="w-full"
            >
              {submitAnswer.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Submitting...
                </>
              ) : (
                'Submit Answer'
              )}
            </Button>
          </div>
        )}

        {/* Complete State */}
        {state === 'complete' && (
          <div className="flex flex-col items-center py-4 space-y-3 border-t">
            <CheckCircle2 className="w-8 h-8 text-green-500" />
            <p className="text-sm font-medium text-green-700">Feedback complete for this trace</p>
            {onComplete && (
              <Button onClick={onComplete} className="mt-2">
                Next Trace
              </Button>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
