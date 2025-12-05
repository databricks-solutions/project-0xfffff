/**
 * AnnotationDemo Component
 * 
 * Demonstrates the annotation interface where SMEs and participants
 * rate traces using the rubric questions with 1-5 Likert scale.
 */

import React, { useState, useEffect, useRef } from 'react';
import { TraceViewer, TraceData } from '@/components/TraceViewer';
import { TraceDataViewer } from '@/components/TraceDataViewer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { 
  Star, 
  ChevronLeft, 
  ChevronRight, 
  User,
  CheckCircle,
  Clock,
  Send,
  AlertCircle,
  Table,
  RefreshCw
} from 'lucide-react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useUser, useRoleCheck } from '@/context/UserContext';
import { useTraces, useRubric, useUserAnnotations, useSubmitAnnotation, useMLflowConfig, refetchAllWorkshopQueries } from '@/hooks/useWorkshopApi';
import { useQueryClient } from '@tanstack/react-query';
import type { Trace, Rubric, Annotation } from '@/client';
import { parseRubricQuestions as parseQuestions } from '@/utils/rubricUtils';
import { toast } from 'sonner';

// Convert API trace to TraceData format
const convertTraceToTraceData = (trace: Trace): TraceData => ({
  id: trace.id,
  input: trace.input,
  output: trace.output,
  context: trace.context || undefined,
  mlflow_trace_id: trace.mlflow_trace_id || undefined,
  mlflow_url: trace.mlflow_url || undefined,
  mlflow_host: trace.mlflow_host || undefined,
  mlflow_experiment_id: trace.mlflow_experiment_id || undefined
});

// Parse rubric question from API format
const parseRubricQuestions = (rubric: Rubric) => {
  if (!rubric || !rubric.question) return [];
  
  return parseQuestions(rubric.question).map((q, index) => ({
    id: `${rubric.id}_${index}`,
    title: q.title,
    description: q.description
  }));
};

interface Rating {
  questionId: string;
  value: number;
}

interface TraceRating {
  traceId: string;
  ratings: Rating[];
  completed: boolean;
}

export function AnnotationDemo() {
  const { workshopId } = useWorkshopContext();
  const [currentTraceIndex, setCurrentTraceIndex] = useState(0);
  const [currentRatings, setCurrentRatings] = useState<Record<string, number>>({});
  const [comment, setComment] = useState<string>('');
  const [submittedAnnotations, setSubmittedAnnotations] = useState<Set<string>>(new Set());
  const [hasNavigatedManually, setHasNavigatedManually] = useState(false);
  const [showTableView, setShowTableView] = useState(false);
  const previousTraceId = useRef<string | null>(null);
  
  // Track original annotation values to detect changes
  const [originalRatings, setOriginalRatings] = useState<Record<string, number>>({});
  const [originalComment, setOriginalComment] = useState<string>('');
  
  // Get current user and permissions
  const { user } = useUser();
  const { canAnnotate } = useRoleCheck();
  const currentUserId = user?.id || 'demo_user';


  // Check if user is logged in
  if (!user || !user.id) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <div className="text-lg font-medium text-gray-900 mb-2">
            Please Log In
          </div>
          <div className="text-sm text-gray-500">
            You must be logged in to annotate traces.
          </div>
        </div>
      </div>
    );
  }

  // Fetch data - pass user ID for personalized trace ordering
  // User is guaranteed to have an ID at this point
  const { data: traces, isLoading: tracesLoading, error: tracesError } = useTraces(workshopId!, user.id);
  const { data: rubric, isLoading: rubricLoading } = useRubric(workshopId!);
  const { data: existingAnnotations } = useUserAnnotations(workshopId!, user);
  const { data: mlflowConfig } = useMLflowConfig(workshopId!);
  const submitAnnotation = useSubmitAnnotation(workshopId!);
  const queryClient = useQueryClient();



  // Convert traces to TraceData format
  const traceData = traces?.map(convertTraceToTraceData) || [];
  const currentTrace = traceData[currentTraceIndex];
  const rubricQuestions = rubric ? parseRubricQuestions(rubric) : [];

  // Helper function to check if annotation values have changed
  const hasAnnotationChanged = () => {
    // Check if ratings changed
    const ratingKeys = Object.keys(currentRatings);
    const originalRatingKeys = Object.keys(originalRatings);
    
    // If originalRatings is empty, this might be a newly created annotation
    // being navigated away from, or we haven't loaded the original yet
    // In this case, consider it as having changes if currentRatings exist
    if (originalRatingKeys.length === 0 && ratingKeys.length > 0) {
      // Check if this is actually a submitted annotation
      // If it's submitted and originalRatings is empty, it means we haven't
      // loaded the original values yet, so we should NOT consider it changed
      if (submittedAnnotations.has(currentTrace?.id || '')) {
        return false; // Don't save if it's already submitted and we haven't loaded original
      }
      return true; // New annotation, has changes
    }
    
    if (ratingKeys.length !== originalRatingKeys.length) {
      return true;
    }
    
    for (const key of ratingKeys) {
      if (currentRatings[key] !== originalRatings[key]) {
        return true;
      }
    }
    
    // Check if comment changed
    const currentCommentTrimmed = comment.trim();
    const originalCommentTrimmed = originalComment.trim();
    if (currentCommentTrimmed !== originalCommentTrimmed) {
      return true;
    }
    
    return false;
  };




  // Reset annotation state when user changes
  useEffect(() => {
    // Clear all submitted annotations state when user switches
    setSubmittedAnnotations(new Set());
    setCurrentRatings({});
    setComment('');
    setCurrentTraceIndex(0);
    setHasNavigatedManually(false);
    previousTraceId.current = null;
    hasInitialized.current = false;
  }, [currentUserId]);

  // Initialize annotation state for current trace
  useEffect(() => {
    if (currentTrace?.id && currentTrace.id !== previousTraceId.current) {
      
      
      
      
      // Reset form for each trace
      setCurrentRatings({});
      setComment('');
      setOriginalRatings({});
      setOriginalComment('');
      previousTraceId.current = currentTrace.id;
      
      // Check if this trace already has an annotation from existing data
      const existingAnnotation = existingAnnotations?.find(
        a => a.trace_id === currentTrace.id && a.user_id === currentUserId
      );
      
      if (existingAnnotation) {
        
        
        // Load existing annotation data into the form
        // Use the new 'ratings' field if available (multiple questions), otherwise fall back to legacy 'rating' field
        let loadedRatings = {};
        if (existingAnnotation.ratings && Object.keys(existingAnnotation.ratings).length > 0) {
          // New format: multiple ratings
          
          loadedRatings = existingAnnotation.ratings;
        } else {
          // Legacy format: single rating - map it to the first question
          const firstQuestionId = rubricQuestions.length > 0 ? rubricQuestions[0].id : 'accuracy';
          
          loadedRatings = { [firstQuestionId]: existingAnnotation.rating };
        }
        const loadedComment = existingAnnotation.comment || '';
        
        setCurrentRatings(loadedRatings);
        setComment(loadedComment);
        
        // Store original values for comparison
        setOriginalRatings(loadedRatings);
        setOriginalComment(loadedComment);
        
        // Mark it as submitted
        setSubmittedAnnotations(prev => {
          if (!prev.has(currentTrace.id)) {
            return new Set([...prev, currentTrace.id]);
          }
          return prev;
        });
      } else {
        
      }
    }
  }, [currentTrace?.id, existingAnnotations, currentUserId]);

  // Navigate to first incomplete trace on initial load
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (existingAnnotations && traceData.length > 0 && !hasNavigatedManually && !hasInitialized.current) {
      // Only count annotations for traces that currently exist in traceData
      const validTraceIds = new Set(traceData.map(t => t.id));
      const completedTraceIds = new Set(
        existingAnnotations
          .filter(a => validTraceIds.has(a.trace_id))
          .map(a => a.trace_id)
      );
      setSubmittedAnnotations(completedTraceIds);
      
      // Load existing annotation data for the current trace if it exists
      const currentTraceAnnotation = existingAnnotations.find(
        a => a.trace_id === currentTrace?.id && a.user_id === currentUserId
      );
      
      if (currentTraceAnnotation) {
        
        
        // Use the new 'ratings' field if available (multiple questions), otherwise fall back to legacy 'rating' field
        let loadedRatings = {};
        if (currentTraceAnnotation.ratings && Object.keys(currentTraceAnnotation.ratings).length > 0) {
          // New format: multiple ratings
          
          loadedRatings = currentTraceAnnotation.ratings;
        } else {
          // Legacy format: single rating - map it to the first question
          const firstQuestionId = rubricQuestions.length > 0 ? rubricQuestions[0].id : 'accuracy';
          
          loadedRatings = { [firstQuestionId]: currentTraceAnnotation.rating };
        }
        const loadedComment = currentTraceAnnotation.comment || '';
        
        setCurrentRatings(loadedRatings);
        setComment(loadedComment);
        
        // Store original values for comparison
        setOriginalRatings(loadedRatings);
        setOriginalComment(loadedComment);
      }
      
      // Find first incomplete trace
      const firstIncompleteIndex = traceData.findIndex(trace => !completedTraceIds.has(trace.id));
      if (firstIncompleteIndex !== -1) {
        setCurrentTraceIndex(firstIncompleteIndex);
      } else if (completedTraceIds.size === traceData.length) {
        // All traces completed, show last trace (workflow completion behavior)
        setCurrentTraceIndex(traceData.length - 1);
      } else {
        // Default to first trace
        setCurrentTraceIndex(0);
      }
      
      hasInitialized.current = true;
    }
  }, [existingAnnotations, traceData, hasNavigatedManually]);

  const handleSubmitAnnotation = async () => {
    if (!currentTrace || Object.keys(currentRatings).length === 0) return;

    try {
      // Submit all ratings for multiple questions
      // Use the first rating as the legacy 'rating' field for backward compatibility
      const firstRating = Object.values(currentRatings)[0];
      
      const annotationData = {
        trace_id: currentTrace.id,
        user_id: currentUserId,
        rating: firstRating,  // Legacy field (backward compatibility)
        ratings: currentRatings,  // New field: all ratings for all questions
        comment: comment.trim() || null
      };
      
      await submitAnnotation.mutateAsync(annotationData);
      
      // Mark as submitted
      setSubmittedAnnotations(prev => new Set([...prev, currentTrace.id]));
    } catch (error) {
      
    }
  };

  const handleRefresh = async () => {
    if (workshopId) {
      refetchAllWorkshopQueries(queryClient, workshopId);
    }
  };

  const nextTrace = async () => {
    
    if (!currentTrace) {
      return;
    }
    
    // Auto-submit annotation if rating is provided
    if (Object.keys(currentRatings).length > 0) {
      try {
        const isExistingAnnotation = submittedAnnotations.has(currentTrace.id);
        const hasChanges = hasAnnotationChanged();
        
        // Only save if it's new OR if it has changes
        if (!isExistingAnnotation || hasChanges) {
          // Submit all ratings for multiple questions
          // Use the first rating as the legacy 'rating' field for backward compatibility
          const firstRating = Object.values(currentRatings)[0];
          const annotationData = {
            trace_id: currentTrace.id,
            user_id: currentUserId,
            rating: firstRating,  // Legacy field (backward compatibility)
            ratings: currentRatings,  // New field: all ratings for all questions
            comment: comment.trim() || null
          };
          
          await submitAnnotation.mutateAsync(annotationData);
          
          setSubmittedAnnotations(prev => new Set([...prev, currentTrace.id]));
          
          // Show appropriate success message
          if (isExistingAnnotation && hasChanges) {
            toast.success('Annotation updated!');
          } else if (!isExistingAnnotation) {
            toast.success('Annotation saved!');
          }
        }
        // If no changes, don't show any toast
      } catch (error) {
        toast.error('Failed to save annotation. Please try again.');
        return; // Don't navigate if submission failed
      }
    }
    
    // Navigate to next trace
    if (currentTraceIndex < traceData.length - 1) {
      
      setHasNavigatedManually(true);
      setCurrentTraceIndex(prev => prev + 1);
      // Reset form for next trace
      setCurrentRatings({});
      setComment('');
    } else {
      
    }
  };

  const prevTrace = async () => {
    if (!currentTrace) {
      return;
    }
    // Auto-submit annotation if rating is provided
    if (Object.keys(currentRatings).length > 0) {
      try {
        const isExistingAnnotation = submittedAnnotations.has(currentTrace.id);
        const hasChanges = hasAnnotationChanged();
        
        // Only save if it's new OR if it has changes
        if (!isExistingAnnotation || hasChanges) {
          // Submit all ratings for multiple questions
          const firstRating = Object.values(currentRatings)[0];
          await submitAnnotation.mutateAsync({
            trace_id: currentTrace.id,
            user_id: currentUserId,
            rating: firstRating,  // Legacy field (backward compatibility)
            ratings: currentRatings,  // New field: all ratings for all questions
            comment: comment.trim() || null
          });
          
          setSubmittedAnnotations(prev => new Set([...prev, currentTrace.id]));
          
          // Show appropriate success message
          if (isExistingAnnotation && hasChanges) {
            toast.success('Annotation updated!');
          } else if (!isExistingAnnotation) {
            toast.success('Annotation saved!');
          }
        }
        // If no changes, don't show any toast
      } catch (error) {
        toast.error('Failed to save annotation. Please try again.');
        return; // Don't navigate if submission failed
      }
    }
    
    // Navigate to previous trace
    if (currentTraceIndex > 0) {
      
      setHasNavigatedManually(true);
      setCurrentTraceIndex(prev => prev - 1);
    } else {
      
    }
  };

  const completedCount = submittedAnnotations.size;
  const hasRated = Object.keys(currentRatings).length > 0;
  
  // Next button should only be disabled if user hasn't provided any ratings
  // Allow navigation even if already submitted (to enable editing)
  const isNextDisabled = !canAnnotate || Object.keys(currentRatings).length === 0;
  
  if (tracesLoading || rubricLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium text-gray-600 mb-2">Loading annotation interface...</div>
          <div className="text-sm text-gray-500">Fetching traces and rubric from API</div>
        </div>
      </div>
    );
  }

  if (tracesError || !traceData.length) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <div className="text-lg font-medium text-gray-900 mb-2">
            {tracesError ? 'Failed to load traces' : 'No traces available'}
          </div>
          <div className="text-sm text-gray-500">
            {tracesError ? 'Please check your connection and try again' : 'Upload some traces to get started'}
          </div>
        </div>
      </div>
    );
  }

  if (!rubricQuestions || rubricQuestions.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <div className="text-lg font-medium text-gray-900 mb-2">No rubric available</div>
          <div className="text-sm text-gray-500">A rubric must be created before annotations can begin</div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Progress Header */}
        <div>
          <h2 className="text-2xl font-bold text-gray-900 mb-2">Annotation Phase</h2>
          <p className="text-gray-600 mb-4">Rate LLM responses using the evaluation rubric</p>
          
          {/* Progress Bar */}
          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm text-gray-600">Progress</span>
              <span className="text-sm text-gray-600">{completedCount} of {traceData.length} complete</span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div
                className="bg-blue-500 h-2 rounded-full transition-all duration-300"
                style={{ width: `${(completedCount / traceData.length) * 100}%` }}
              />
            </div>
          </div>
          
          {/* Current Trace Info */}
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <Badge variant="outline">
                Trace {currentTraceIndex + 1} of {traceData.length}
              </Badge>
              {submittedAnnotations.has(currentTrace.id) && (
                <Badge className="bg-green-500">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Annotation Submitted
                </Badge>
              )}
            </div>
          </div>
        </div>


        {/* Current Trace Display */}
        <TraceViewer trace={currentTrace} />
        
        {/* Trace Data Table View Toggle */}
        <Card className="mt-4">
          <CardHeader className="pb-3">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">Trace Data Analysis</CardTitle>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setShowTableView(!showTableView)}
                className="flex items-center gap-2"
              >
                <Table className="h-4 w-4" />
                {showTableView ? 'Hide' : 'Show'} Data Table
              </Button>
            </div>
          </CardHeader>
          {showTableView && (
            <CardContent>
              <TraceDataViewer 
                trace={currentTrace}
                showContext={false}
                className="border-0 shadow-none"
              />
            </CardContent>
          )}
        </Card>

        {/* Rubric Questions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>Rate this Response</span>
              {currentTrace?.mlflow_trace_id && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => {
                    if (currentTrace.mlflow_url) {
                      // Use the pre-generated MLflow URL from the trace
                      window.open(currentTrace.mlflow_url, '_blank');
                    } else if (mlflowConfig) {
                      // Fallback: construct URL using mlflowConfig
                      const host = mlflowConfig.databricks_host;
                      const experiment_id = mlflowConfig.experiment_id;
                      const trace_id = currentTrace.mlflow_trace_id;
                      const mlflowUrl = `${host}/ml/experiments/${experiment_id}/traces?selectedEvaluationId=${trace_id}`;
                      window.open(mlflowUrl, '_blank');
                    } else {
                      
                    }
                  }}
                  className="flex items-center gap-2 text-xs"
                >
                  <AlertCircle className="h-3 w-3" />
                  View Full Context
                </Button>
              )}
              {/* Debug info */}
              {currentTrace?.mlflow_trace_id && !mlflowConfig && (
                <div className="text-xs text-orange-600">
                  ⚠️ MLflow config not loaded
                </div>
              )}
              {!currentTrace?.mlflow_trace_id && (
                <div className="text-xs text-gray-500">
                  No MLflow trace ID
                </div>
              )}
            </CardTitle>
            {!canAnnotate && (
              <p className="text-sm text-red-600 mt-2">
                <AlertCircle className="h-4 w-4 inline mr-1" />
                You don't have permission to submit annotations. You can view the traces but cannot provide ratings.
              </p>
            )}
          </CardHeader>
          <CardContent className="space-y-6">
            {rubricQuestions.map((question, questionIndex) => (
              <div key={question.id} className="border rounded-lg p-4 bg-white">
                <div className="mb-4">
                  <Label className="text-base font-medium">
                    {question.title}
                  </Label>
                  <p className="text-sm text-gray-600 mt-1">
                    {question.description}
                  </p>
                </div>
                
                <div className="space-y-4">
                  <div className="flex items-center justify-between">
                    {[1, 2, 3, 4, 5].map((value) => {
                      const labels = [
                        '', // placeholder for value 0
                        'Strongly Disagree',
                        'Disagree', 
                        'Neutral',
                        'Agree',
                        'Strongly Agree'
                      ];
                      
                      return (
                        <div key={value} className="flex flex-col items-center gap-2">
                          <label className={canAnnotate ? "cursor-pointer" : "cursor-not-allowed opacity-50"}>
                            <input
                              type="radio"
                              name={`rating-${question.id}`}
                              value={value}
                              checked={currentRatings[question.id] === value}
                              onChange={(e) => {
                                setCurrentRatings(prev => ({
                                  ...prev,
                                  [question.id]: parseInt(e.target.value)
                                }));
                              }}
                              className="w-4 h-4"
                              disabled={!canAnnotate}
                            />
                          </label>
                          <span className="text-xs text-center text-gray-700 leading-tight max-w-[80px]">
                            {labels[value]}
                          </span>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            ))}
            
            {rubricQuestions.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                <p>No evaluation criteria available. Please wait for the facilitator to create the rubric.</p>
              </div>
            )}

            {/* Comment Field - Feedback for Judge Alignment */}
            <div className="space-y-2">
              <Label htmlFor="comment" className="text-sm font-medium">
                Feedback for Judge Alignment
                <span className="text-gray-500 font-normal ml-2">(Optional)</span>
              </Label>
              <p className="text-xs text-gray-600 mb-2">
                <strong>Important:</strong> Your feedback here will be used to train and align the AI judge. 
                Focus on explaining <em>why</em> you gave this rating - what specific aspects of the response 
                influenced your score? This helps the AI judge learn to evaluate similarly.
              </p>
              <textarea
                id="comment"
                placeholder={canAnnotate ? "Explain your reasoning for this rating. What made this response good or poor? What criteria did you focus on? This feedback will be used to train the AI judge..." : "You don't have permission to submit annotations"}
                value={comment}
                onChange={(e) => {
                  setComment(e.target.value);
                }}
                className="w-full min-h-[100px] p-2 border rounded whitespace-pre-wrap"
                disabled={!canAnnotate}
                style={{ whiteSpace: 'pre-wrap' }}
              />
            </div>

            {/* Status indicator */}
            {submittedAnnotations.has(currentTrace.id) && (
              <div className="flex items-center justify-between bg-green-50 border border-green-200 rounded-lg p-3">
                <div className="flex items-center gap-2">
                  <CheckCircle className="h-4 w-4 text-green-600" />
                  <span className="text-sm text-green-800 font-medium">Annotation Saved</span>
                </div>
                <span className="text-xs text-green-700">
                  Edit and click Next/Previous to save changes
                </span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={prevTrace}
                disabled={currentTraceIndex === 0}
                className="flex items-center gap-2"
              >
                <ChevronLeft className="h-4 w-4" />
                Previous
              </Button>
              
              <Button
                onClick={nextTrace}
                disabled={isNextDisabled}
                className="flex items-center gap-2"
              >
                {currentTraceIndex === traceData.length - 1 ? (
                  <>
                    <Send className="h-4 w-4" />
                    Complete
                  </>
                ) : (
                  <>
                    Next
                    <ChevronRight className="h-4 w-4" />
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}