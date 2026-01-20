/**
 * AnnotationDemo Component
 * 
 * Demonstrates the annotation interface where SMEs and participants
 * rate traces using the rubric questions with 1-5 Likert scale.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
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

// Parse rubric question from API format - includes judgeType for each question
const parseRubricQuestions = (rubric: Rubric) => {
  if (!rubric || !rubric.question) return [];
  
  return parseQuestions(rubric.question).map((q, index) => ({
    id: `${rubric.id}_${index}`,
    title: q.title,
    description: q.description,
    judgeType: q.judgeType || 'likert' // Include judge type from parsed question
  }));
};

type JudgeType = 'likert' | 'binary' | 'freeform';

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
  const [freeformResponses, setFreeformResponses] = useState<Record<string, string>>({});
  const [comment, setComment] = useState<string>('');
  const [submittedAnnotations, setSubmittedAnnotations] = useState<Set<string>>(new Set());
  const [hasNavigatedManually, setHasNavigatedManually] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [isNavigating, setIsNavigating] = useState(false);
  const [showTableView, setShowTableView] = useState(false);
  const previousTraceId = useRef<string | null>(null);
  
  // Track saved state per trace (better than global state)
  interface SavedAnnotationState {
    ratings: Record<string, number>;
    freeformResponses: Record<string, string>;
    comment: string;
  }
  const savedStateRef = useRef<Map<string, SavedAnnotationState>>(new Map());
  const savingTracesRef = useRef<Set<string>>(new Set()); // Track which traces are currently saving
  const isSavingRef = useRef(false); // Track if any user-initiated save is in progress
  
  // Retry utility with exponential backoff
  const retryWithBackoff = useCallback(async <T,>(
    fn: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> => {
    let lastError: any;
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await fn();
      } catch (error) {
        lastError = error;
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt); // Exponential backoff: 1s, 2s, 4s
          console.log(`Save attempt ${attempt + 1} failed, retrying in ${delay}ms...`);
          await new Promise(resolve => setTimeout(resolve, delay));
        }
      }
    }
    throw lastError;
  }, []);
  
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

  // Helper function to get legacy rating (first likert rating between 1-5, or default to 3)
  const getLegacyRating = (ratingsOverride?: Record<string, number>): number => {
    const ratings = ratingsOverride || currentRatings;
    // Find the first likert question and get its rating
    for (const question of rubricQuestions) {
      if (question.judgeType === 'likert') {
        const rating = ratings[question.id];
        if (typeof rating === 'number' && rating >= 1 && rating <= 5) {
          return rating;
        }
      }
    }
    // If no likert rating found, default to 3 (neutral)
    return 3;
  };
  
  // Helper function to get only numeric ratings for the ratings field
  const getNumericRatings = (ratingsOverride?: Record<string, number>): Record<string, number> => {
    const ratings = ratingsOverride || currentRatings;
    const numericRatings: Record<string, number> = {};
    for (const [key, value] of Object.entries(ratings)) {
      if (typeof value === 'number') {
        numericRatings[key] = value;
      }
    }
    return numericRatings;
  };
  
  // Helper function to build combined comment with freeform responses
  // Uses JSON for freeform to preserve multi-line content
  const buildCombinedComment = (
    commentOverride?: string,
    freeformOverride?: Record<string, string>
  ) => {
    const commentToUse = commentOverride !== undefined ? commentOverride : comment;
    const freeformToUse = freeformOverride || freeformResponses;
    let combined = commentToUse.trim();
    
    // Add freeform responses to comment as JSON to preserve multi-line content
    const freeformEntries = Object.entries(freeformToUse).filter(([_, v]) => v.trim());
    if (freeformEntries.length > 0) {
      // Build a map of title -> response for human readability
      const freeformMap: Record<string, string> = {};
      for (const [questionId, response] of freeformEntries) {
        const question = rubricQuestions.find(q => q.id === questionId);
        freeformMap[question?.title || questionId] = response.trim();
      }
      
      const freeformJson = JSON.stringify(freeformMap);
      
      if (combined) {
        combined = `${combined}\n\n|||FREEFORM_JSON|||${freeformJson}|||END_FREEFORM|||`;
      } else {
        combined = `|||FREEFORM_JSON|||${freeformJson}|||END_FREEFORM|||`;
      }
    }
    
    return combined || null;
  };
  
  // Helper function to parse combined comment back into separate parts
  const parseLoadedComment = (loadedComment: string): { userComment: string; freeformData: Record<string, string> } => {
    const freeformData: Record<string, string> = {};
    let userComment = loadedComment;
    
    // Check for new JSON format first
    const jsonStartMarker = '|||FREEFORM_JSON|||';
    const jsonEndMarker = '|||END_FREEFORM|||';
    const jsonStartIndex = loadedComment.indexOf(jsonStartMarker);
    const jsonEndIndex = loadedComment.indexOf(jsonEndMarker);
    
    if (jsonStartIndex !== -1 && jsonEndIndex !== -1) {
      // Extract user comment (before the marker)
      userComment = loadedComment.substring(0, jsonStartIndex).trim();
      
      // Extract and parse JSON
      const jsonStr = loadedComment.substring(jsonStartIndex + jsonStartMarker.length, jsonEndIndex);
      try {
        const freeformMap = JSON.parse(jsonStr) as Record<string, string>;
        // Map titles back to question IDs
        for (const [title, response] of Object.entries(freeformMap)) {
          const question = rubricQuestions.find(q => q.title === title);
          if (question) {
            freeformData[question.id] = response;
          }
        }
      } catch (e) {
        // JSON parse failed, ignore freeform data
      }
    } else {
      // Check for old format (backward compatibility)
      const freeformMarker = '--- Free-form Responses ---';
      const markerIndex = loadedComment.indexOf(freeformMarker);
      
      if (markerIndex !== -1) {
        // Extract user comment (before the marker)
        userComment = loadedComment.substring(0, markerIndex).trim();
        
        // Extract freeform section - old format was single-line only
        const freeformSection = loadedComment.substring(markerIndex + freeformMarker.length).trim();
        
        // Parse each freeform response: [Title]: Response (single line)
        const lines = freeformSection.split('\n');
        for (const line of lines) {
          const match = line.match(/^\[([^\]]+)\]:\s*(.*)$/);
          if (match) {
            const title = match[1];
            const response = match[2];
            const question = rubricQuestions.find(q => q.title === title);
            if (question) {
              freeformData[question.id] = response;
            }
          }
        }
      }
    }
    
    return { userComment, freeformData };
  };




  // Reset annotation state when user changes
  useEffect(() => {
    // Clear all submitted annotations state when user switches
    setSubmittedAnnotations(new Set());
    setCurrentRatings({});
    setFreeformResponses({});
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
      setFreeformResponses({});
      setComment('');
      previousTraceId.current = currentTrace.id;
      
      // Check if this trace already has an annotation from existing data
      const existingAnnotation = existingAnnotations?.find(
        a => a.trace_id === currentTrace.id && a.user_id === currentUserId
      );
      
      if (existingAnnotation) {
        
        
        // Load existing annotation data into the form
        // Use the new 'ratings' field if available (multiple questions), otherwise fall back to legacy 'rating' field
        let loadedRatings: Record<string, number> = {};
        if (existingAnnotation.ratings && typeof existingAnnotation.ratings === 'object') {
          // New format: multiple ratings
          // Check if ratings object has any keys (including 0 values)
          const ratingKeys = Object.keys(existingAnnotation.ratings);
          if (ratingKeys.length > 0) {
            // Deep copy to ensure we capture all values including 0
            loadedRatings = { ...existingAnnotation.ratings };
            // Explicitly check for 0 values to ensure they're included
            for (const key of ratingKeys) {
              const value = existingAnnotation.ratings[key];
              if (typeof value === 'number') {
                loadedRatings[key] = value; // Include 0 values
              }
            }
          } else if (existingAnnotation.rating !== undefined && existingAnnotation.rating !== null) {
            // Fallback: if ratings object is empty but rating field exists, use it
            const firstQuestionId = rubricQuestions.length > 0 ? rubricQuestions[0].id : 'accuracy';
            loadedRatings = { [firstQuestionId]: existingAnnotation.rating };
          }
        } else if (existingAnnotation.rating !== undefined && existingAnnotation.rating !== null) {
          // Legacy format: single rating - map it to the first question
          const firstQuestionId = rubricQuestions.length > 0 ? rubricQuestions[0].id : 'accuracy';
          loadedRatings = { [firstQuestionId]: existingAnnotation.rating };
        }
        
        // Debug: Log what we're loading
        console.debug('Loading annotation:', {
          traceId: currentTrace.id,
          loadedRatings,
          existingAnnotationRatings: existingAnnotation.ratings,
          existingAnnotationRating: existingAnnotation.rating
        });
        
        // Parse comment to separate user comment from freeform responses
        const rawComment = existingAnnotation.comment || '';
        const { userComment, freeformData } = parseLoadedComment(rawComment);
        
        setCurrentRatings(loadedRatings);
        setComment(userComment);
        setFreeformResponses(freeformData);
        
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

  // Initialize saved state from all existing annotations (runs once)
  useEffect(() => {
    if (existingAnnotations && existingAnnotations.length > 0 && rubricQuestions.length > 0) {
      existingAnnotations.forEach(annotation => {
        // Use the new 'ratings' field if available, otherwise fall back to legacy 'rating' field
        let loadedRatings: Record<string, number> = {};
        if (annotation.ratings && Object.keys(annotation.ratings).length > 0) {
          loadedRatings = annotation.ratings;
        } else {
          // Legacy format: single rating - map it to the first question
          const firstQuestionId = rubricQuestions.length > 0 ? rubricQuestions[0].id : 'accuracy';
          loadedRatings = { [firstQuestionId]: annotation.rating };
        }
        
        // Parse comment to separate user comment from freeform responses
        const rawComment = annotation.comment || '';
        const { userComment: loadedComment, freeformData } = parseLoadedComment(rawComment);
        
        savedStateRef.current.set(annotation.trace_id, {
          ratings: loadedRatings,
          freeformResponses: freeformData,
          comment: loadedComment
        });
      });
    }
  }, [existingAnnotations?.length, rubricQuestions.length]); // Only run when counts change

  // Navigate to first incomplete trace on initial load
  const hasInitialized = useRef(false);
  useEffect(() => {
    if (existingAnnotations && traceData.length > 0 && !hasNavigatedManually && !hasInitialized.current) {
      // Only count annotations for traces that currently exist in traceData
      const validTraceIds = new Set(traceData.map((t: any) => t.id));
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
        let loadedRatings: Record<string, number> = {};
        if (currentTraceAnnotation.ratings && Object.keys(currentTraceAnnotation.ratings).length > 0) {
          // New format: multiple ratings
          loadedRatings = currentTraceAnnotation.ratings;
        } else {
          // Legacy format: single rating - map it to the first question
          const firstQuestionId = rubricQuestions.length > 0 ? rubricQuestions[0].id : 'accuracy';
          loadedRatings = { [firstQuestionId]: currentTraceAnnotation.rating };
        }
        
        // Parse comment to separate user comment from freeform responses
        const rawComment = currentTraceAnnotation.comment || '';
        const { userComment: loadedComment, freeformData } = parseLoadedComment(rawComment);
        setFreeformResponses(freeformData);
        setCurrentRatings(loadedRatings);
        setComment(loadedComment);
      }
      
      // Find first incomplete trace
      const firstIncompleteIndex = traceData.findIndex((trace: any) => !completedTraceIds.has(trace.id));
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

  // Save annotation function - can be called synchronously or asynchronously
  const saveAnnotation = async (
    traceId?: string, 
    isBackground: boolean = false,
    ratingsOverride?: Record<string, number>,
    freeformOverride?: Record<string, string>,
    commentOverride?: string
  ): Promise<boolean> => {
    const targetTraceId = traceId || currentTrace?.id;
    if (!targetTraceId) {
      return true; // No trace, return success (nothing to save)
    }

    // Use override values if provided (for background saves), otherwise use current state
    const ratingsToSave = ratingsOverride || currentRatings;
    const freeformToSave = freeformOverride || freeformResponses;
    const commentToSave = commentOverride !== undefined ? commentOverride : comment;

    // Check if there are any ratings to save (including 0 values for binary Fail)
    const hasRatings = Object.keys(ratingsToSave).length > 0;
    if (!hasRatings) {
      return true; // No ratings to save, return success
    }

    // Check if this trace is already being saved (prevent duplicate saves)
    if (savingTracesRef.current.has(targetTraceId)) {
      console.warn(`Save already in progress for trace ${targetTraceId}, skipping duplicate save`);
      return false;
    }

    // For user-initiated saves, check if content has changed
    if (!isBackground) {
      // Prevent concurrent user-initiated saves
      if (isSavingRef.current) {
        console.warn('User-initiated save already in progress, skipping duplicate save');
        return false;
      }
      
      // Check for changes using the actual values we're about to save (not just currentRatings state)
      const savedState = savedStateRef.current.get(targetTraceId);
      if (savedState) {
        // Compare using ratingsToSave (the override values), not currentRatings (React state)
        const ratingKeys = Object.keys(ratingsToSave);
        let hasChanges = false;
        
        if (ratingKeys.length > 0) {
          for (const key of ratingKeys) {
            if (!(key in savedState.ratings) || ratingsToSave[key] !== savedState.ratings[key]) {
              hasChanges = true;
              break;
            }
          }
          // Also check if saved state has keys that ratingsToSave doesn't (rating was removed)
          if (!hasChanges) {
            for (const key of Object.keys(savedState.ratings)) {
              if (!(key in ratingsToSave)) {
                hasChanges = true;
                break;
              }
            }
          }
        }
        
        // Also check comment changes
        if (!hasChanges && commentToSave !== savedState.comment) {
          hasChanges = true;
        }
        
        if (!hasChanges) {
          console.log(`No changes detected for trace ${targetTraceId}, skipping save`);
          // Even though we skip the save, ensure the trace is marked as submitted
          // This fixes the issue where "Complete" doesn't record the last trace
          setSubmittedAnnotations(prev => new Set([...prev, targetTraceId]));
          return true; // No change needed, return success
        }
      }
      
      // Set saving flag for user-initiated saves
      isSavingRef.current = true;
      setIsSaving(true);
    }
    
    // Mark this trace as being saved
    savingTracesRef.current.add(targetTraceId);
    
    try {
      // Submit all ratings for multiple questions (including 0 values)
      const numericRatings = getNumericRatings(ratingsToSave);
      const annotationData = {
        trace_id: targetTraceId,
        user_id: currentUserId,
        rating: getLegacyRating(ratingsToSave),  // Legacy field: first likert rating (1-5)
        ratings: numericRatings,  // New field: all numeric ratings (including 0 for binary Fail)
        comment: buildCombinedComment(commentToSave, freeformToSave)
      };
      
      console.log('Saving annotation:', {
        traceId: targetTraceId,
        ratings: numericRatings,
        isBackground
      });
      
      // Use retry logic for background saves, direct call for user-initiated saves
      if (isBackground) {
        await retryWithBackoff(() => submitAnnotation.mutateAsync(annotationData), 3, 1000); // 3 retries with exponential backoff
      } else {
        await submitAnnotation.mutateAsync(annotationData);
      }
      
      setSubmittedAnnotations(prev => new Set([...prev, targetTraceId]));
      
      // Update saved state for this trace AFTER successful save
      savedStateRef.current.set(targetTraceId, {
        ratings: { ...ratingsToSave },
        freeformResponses: { ...freeformToSave },
        comment: commentToSave
      });
      
      console.log('Successfully saved annotation for trace:', targetTraceId);
      return true;
    } catch (error: any) {
      console.error('Failed to save annotation after retries:', error);
      console.error('Error details:', {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
        traceId: targetTraceId,
        isBackground
      });
      // Only show toast for user-initiated saves
      if (!isBackground) {
        toast.error('Failed to save annotation. Please try again.');
      }
      return false;
    } finally {
      // Clear saving flags
      savingTracesRef.current.delete(targetTraceId);
      if (!isBackground) {
        isSavingRef.current = false;
        setIsSaving(false);
      }
    }
  };

  const handleSubmitAnnotation = async () => {
    await saveAnnotation();
  };

  const handleRefresh = async () => {
    if (workshopId) {
      refetchAllWorkshopQueries(queryClient, workshopId);
    }
  };

  const nextTrace = async () => {
    if (!currentTrace) {
      console.warn('nextTrace: No current trace');
      return;
    }
    if (isNavigating) {
      console.warn('nextTrace: Already navigating', { isNavigating });
      return; // Prevent concurrent navigation
    }
    
    // Store current trace data for save
    const currentTraceId = currentTrace.id;
    const ratingsToSave = { ...currentRatings };
    const freeformToSave = { ...freeformResponses };
    const commentToSave = comment;
    const hasRatings = Object.keys(ratingsToSave).length > 0;
    
    // Check if we're on the last trace
    if (currentTraceIndex >= traceData.length - 1) {
      // On the last trace, MUST await the save to ensure it completes
      // This fixes the issue where the last trace annotation is not recorded
      setIsNavigating(true);
      try {
        if (hasRatings) {
          console.log('nextTrace: Saving final annotation (awaiting)', { traceId: currentTraceId });
          const success = await saveAnnotation(currentTraceId, false, ratingsToSave, freeformToSave, commentToSave);
          if (success) {
            console.log('nextTrace: Final annotation saved successfully');
            toast.success('All traces annotated! Great work.');
          } else {
            toast.error('Failed to save annotation. Please try again.');
          }
        } else {
          // No ratings but still mark as submitted to update progress
          setSubmittedAnnotations(prev => new Set([...prev, currentTraceId]));
          toast.success('All traces annotated! Great work.');
        }
      } catch (error) {
        console.error('nextTrace: Error saving final annotation:', error);
        toast.error('Failed to save annotation. Please try again.');
      } finally {
        setIsNavigating(false);
      }
      return;
    }
    
    console.log('nextTrace: Starting optimistic navigation', { currentTraceIndex, nextIndex: currentTraceIndex + 1 });
    setIsNavigating(true);
    
    // Navigate immediately (optimistic)
    const nextIndex = currentTraceIndex + 1;
    console.log('nextTrace: Navigating to index', nextIndex);
    
    setHasNavigatedManually(true);
    setCurrentTraceIndex(nextIndex);
    // Reset form for next trace
    setCurrentRatings({});
    setFreeformResponses({});
    setComment('');
    
    // Clear navigating flag immediately after state update
    setIsNavigating(false);
    
    // Save in background (async, non-blocking)
    if (hasRatings) {
      console.log('nextTrace: Saving annotation in background', { traceId: currentTraceId });
      // Save with the stored values (before form was cleared)
      saveAnnotation(currentTraceId, true, ratingsToSave, freeformToSave, commentToSave)
        .then((success) => {
          if (success) {
            console.log('nextTrace: Background save successful for trace:', currentTraceId);
          } else {
            // Save failed after retries - log but don't show intrusive toast
            // The retry logic should handle most transient failures
            console.warn('nextTrace: Background save failed after retries for trace:', currentTraceId);
          }
        })
        .catch((error) => {
          // This shouldn't happen as saveAnnotation catches errors, but log just in case
          console.error('nextTrace: Unexpected background save error:', error);
        });
    } else {
      console.log('nextTrace: No ratings to save');
    }
  };

  const prevTrace = () => {
    if (!currentTrace) {
      console.warn('prevTrace: No current trace');
      return;
    }
    if (isNavigating) {
      console.warn('prevTrace: Already navigating', { isNavigating });
      return; // Prevent concurrent navigation
    }
    
    // Check if we can navigate
    if (currentTraceIndex <= 0) {
      console.log('prevTrace: Already at first trace');
      return;
    }
    
    console.log('prevTrace: Starting optimistic navigation', { currentTraceIndex, prevIndex: currentTraceIndex - 1 });
    setIsNavigating(true);
    
    // Store current trace data for background save
    const currentTraceId = currentTrace.id;
    const ratingsToSave = { ...currentRatings };
    const freeformToSave = { ...freeformResponses };
    const commentToSave = comment;
    const hasRatings = Object.keys(ratingsToSave).length > 0;
    
    // Navigate immediately (optimistic)
    const prevIndex = currentTraceIndex - 1;
    console.log('prevTrace: Navigating to index', prevIndex);
    
    setHasNavigatedManually(true);
    setCurrentTraceIndex(prevIndex);
    
    // Clear navigating flag immediately after state update
    setIsNavigating(false);
    
    // Save in background (async, non-blocking)
    if (hasRatings) {
      console.log('prevTrace: Saving annotation in background', { traceId: currentTraceId });
      // Save with the stored values (before navigation)
      saveAnnotation(currentTraceId, true, ratingsToSave, freeformToSave, commentToSave)
        .then((success) => {
          if (success) {
            console.log('prevTrace: Background save successful for trace:', currentTraceId);
          } else {
            // Save failed after retries - log but don't show intrusive toast
            console.warn('prevTrace: Background save failed after retries for trace:', currentTraceId);
          }
        })
        .catch((error) => {
          // This shouldn't happen as saveAnnotation catches errors, but log just in case
          console.error('prevTrace: Unexpected background save error:', error);
        });
    } else {
      console.log('prevTrace: No ratings to save');
    }
  };

  const completedCount = submittedAnnotations.size;
  const hasRated = Object.keys(currentRatings).length > 0;
  
  // Next button should only be disabled if user hasn't provided any ratings or is navigating
  // Allow navigation even if already submitted (to enable editing)
  // Navigation is now optimistic, so we don't block on isSaving
  const isNextDisabled = !canAnnotate || Object.keys(currentRatings).length === 0 || isNavigating;
  
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
                  <div className="flex items-center gap-2">
                    <Label className="text-base font-medium">
                      {question.title}
                    </Label>
                    <Badge variant="outline" className={`text-xs ${
                      question.judgeType === 'likert' ? 'bg-green-50 text-green-700 border-green-200' :
                      question.judgeType === 'binary' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                      'bg-purple-50 text-purple-700 border-purple-200'
                    }`}>
                      {question.judgeType === 'likert' ? 'Likert' : 
                       question.judgeType === 'binary' ? 'Binary' : 'Free-form'}
                    </Badge>
                  </div>
                  <p className="text-sm text-gray-600 mt-1">
                    {question.description}
                  </p>
                </div>
                
                <div className="space-y-4">
                  {/* Likert Scale (1-5) */}
                  {question.judgeType === 'likert' && (
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
                                disabled={!canAnnotate || isSaving}
                              />
                            </label>
                            <span className="text-xs text-center text-gray-700 leading-tight max-w-[80px]">
                              {labels[value]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  
                  {/* Binary (Pass/Fail) */}
                  {question.judgeType === 'binary' && (
                    <div className="flex justify-center gap-8">
                      <div 
                        className={`flex flex-col items-center gap-2 ${canAnnotate && !isSaving ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                        onClick={() => canAnnotate && !isSaving && setCurrentRatings(prev => ({ ...prev, [question.id]: 1 }))}
                        role="button"
                        tabIndex={canAnnotate && !isSaving ? 0 : -1}
                        onKeyDown={(e) => e.key === 'Enter' && canAnnotate && !isSaving && setCurrentRatings(prev => ({ ...prev, [question.id]: 1 }))}
                      >
                        <div className={`w-16 h-16 rounded-xl border-2 flex items-center justify-center transition-all duration-200 ${
                          currentRatings[question.id] === 1
                            ? 'border-emerald-500 bg-emerald-50 shadow-md scale-105 ring-2 ring-emerald-200'
                            : 'border-gray-300 bg-white hover:border-emerald-300 hover:bg-emerald-50/50'
                        }`}>
                          <CheckCircle className={`w-8 h-8 ${currentRatings[question.id] === 1 ? 'text-emerald-600' : 'text-gray-400'}`} />
                        </div>
                        <span className={`text-sm font-semibold ${currentRatings[question.id] === 1 ? 'text-emerald-700' : 'text-gray-500'}`}>Pass</span>
                      </div>
                      <div 
                        className={`flex flex-col items-center gap-2 ${canAnnotate && !isSaving ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                        onClick={() => canAnnotate && !isSaving && setCurrentRatings(prev => ({ ...prev, [question.id]: 0 }))}
                        role="button"
                        tabIndex={canAnnotate && !isSaving ? 0 : -1}
                        onKeyDown={(e) => e.key === 'Enter' && canAnnotate && !isSaving && setCurrentRatings(prev => ({ ...prev, [question.id]: 0 }))}
                      >
                        <div className={`w-16 h-16 rounded-xl border-2 flex items-center justify-center transition-all duration-200 ${
                          currentRatings[question.id] === 0
                            ? 'border-rose-400 bg-rose-50 shadow-md scale-105 ring-2 ring-rose-200'
                            : 'border-gray-300 bg-white hover:border-rose-300 hover:bg-rose-50/50'
                        }`}>
                          <AlertCircle className={`w-8 h-8 ${currentRatings[question.id] === 0 ? 'text-rose-500' : 'text-gray-400'}`} />
                        </div>
                        <span className={`text-sm font-semibold ${currentRatings[question.id] === 0 ? 'text-rose-600' : 'text-gray-500'}`}>Fail</span>
                      </div>
                    </div>
                  )}
                  
                  {/* Free-form Text */}
                  {question.judgeType === 'freeform' && (
                    <div>
                      <Textarea
                        placeholder="Provide your detailed feedback for this criterion..."
                        value={freeformResponses[question.id] || ''}
                        onChange={(e) => setFreeformResponses(prev => ({ ...prev, [question.id]: e.target.value }))}
                        className="min-h-[100px]"
                        disabled={!canAnnotate || isSaving}
                      />
                      <p className="text-xs text-gray-500 mt-1">
                        Provide detailed written feedback for this evaluation criterion.
                      </p>
                    </div>
                  )}
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
                disabled={!canAnnotate || isSaving}
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
          <CardContent className="py-4">
            <div className="flex items-center justify-between">
              <Button
                variant="outline"
                onClick={prevTrace}
                disabled={currentTraceIndex === 0 || isNavigating}
                className="flex items-center gap-2"
              >
                {isNavigating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-gray-400/30 border-t-gray-600 rounded-full animate-spin" />
                    Navigating...
                  </>
                ) : (
                  <>
                    <ChevronLeft className="h-4 w-4" />
                    Previous
                  </>
                )}
              </Button>
              
              <Button
                onClick={nextTrace}
                disabled={isNextDisabled}
                className="flex items-center gap-2"
                data-testid={currentTraceIndex === traceData.length - 1 ? "complete-annotation-button" : "next-trace-button"}
              >
                {isNavigating ? (
                  <>
                    <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                    Navigating...
                  </>
                ) : currentTraceIndex === traceData.length - 1 ? (
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