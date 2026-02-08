/**
 * AnnotationDemo Component
 * 
 * Demonstrates the annotation interface where SMEs and participants
 * rate traces using the rubric questions with 1-5 Likert scale.
 */

import React, { useState, useEffect, useRef, useCallback } from 'react';
import { TraceViewer, TraceData } from '@/components/TraceViewer';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import {
  Star,
  ChevronLeft,
  ChevronRight,
  CheckCircle,
  Send,
  AlertCircle,
  RefreshCw,
  NotebookPen,
  Trash2
} from 'lucide-react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useUser, useRoleCheck } from '@/context/UserContext';
import { useTraces, useRubric, useUserAnnotations, useSubmitAnnotation, useMLflowConfig, refetchAllWorkshopQueries, useWorkshop, useParticipantNotes, useSubmitParticipantNote, useDeleteParticipantNote } from '@/hooks/useWorkshopApi';
import { useQueryClient } from '@tanstack/react-query';
import type { Trace, Rubric, Annotation } from '@/client';
import { parseRubricQuestions as parseQuestions } from '@/utils/rubricUtils';
import { toast } from 'sonner';

/**
 * Render text with newlines preserved
 */
const TextWithNewlines: React.FC<{ text: string }> = ({ text }) => {
  if (!text.includes('\n')) {
    return <>{text}</>;
  }
  
  return (
    <>
      {text.split('\n').map((line, idx, arr) => (
        <React.Fragment key={idx}>
          {line}
          {idx < arr.length - 1 && <br />}
        </React.Fragment>
      ))}
    </>
  );
};

/**
 * Format rubric description with proper structure for readability
 * Splits on multiple patterns: newlines with bullets (•, -, *), or " - " inline
 * Collapses long lists (>2 items) with expand/collapse functionality
 * Preserves newlines within items
 */
const FormattedRubricDescription: React.FC<{ description: string }> = ({ description }) => {
  const [expanded, setExpanded] = useState(false);
  
  if (!description) return null;

  // Try multiple splitting strategies
  let items: string[] = [];
  
  // Strategy 1: Split on newlines with bullet markers (•, -, *)
  if (description.includes('\n')) {
    const lines = description.split('\n').map(line => line.trim()).filter(line => line.length > 0);
    // Check if lines start with bullet markers
    const bulletPattern = /^[•\-\*]\s*/;
    const hasBullets = lines.some(line => bulletPattern.test(line));
    
    if (hasBullets) {
      items = lines.map(line => line.replace(bulletPattern, '').trim()).filter(item => item.length > 0);
    } else {
      // Just use lines as items if there are multiple
      items = lines;
    }
  }
  
  // Strategy 2: If no newline splits worked, try " - " inline split
  if (items.length <= 1) {
    items = description.split(/\s+-\s+/).map(item => item.trim()).filter(item => item.length > 0);
  }
  
  if (items.length <= 1) {
    // Single item or no splits - show as plain text with newlines preserved
    return (
      <p className="text-sm text-gray-600 mt-2">
        <TextWithNewlines text={description} />
      </p>
    );
  }

  // Show first 2 items when collapsed, all when expanded
  const visibleItems = expanded ? items : items.slice(0, 2);
  const hasMore = items.length > 2;

  return (
    <div className="text-sm text-gray-600 mt-2">
      <ul className="space-y-1.5">
        {visibleItems.map((item, idx) => (
          <li key={idx} className="flex items-start gap-2">
            <span className="text-gray-400 mt-0.5 flex-shrink-0">•</span>
            <span><TextWithNewlines text={item} /></span>
          </li>
        ))}
      </ul>
      {hasMore && (
        <Button
          variant="link"
          size="sm"
          onClick={() => setExpanded(!expanded)}
          className="mt-2 text-xs text-blue-600 hover:text-blue-800 h-auto p-0"
        >
          {expanded ? 'Show less' : `Show ${items.length - 2} more...`}
        </Button>
      )}
    </div>
  );
};

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
  const lastNavigationTimeRef = useRef<number>(0); // Track last navigation to prevent rapid clicking
  const NAVIGATION_DEBOUNCE_MS = 300; // Minimum time between navigations
  
  // Failed save queue for retry mechanism
  interface FailedSaveData {
    traceId: string;
    ratings: Record<string, number>;
    freeformResponses: Record<string, string>;
    comment: string;
    attempts: number;
    lastAttempt: number;
  }
  const failedSaveQueueRef = useRef<Map<string, FailedSaveData>>(new Map());
  const [failedSaveCount, setFailedSaveCount] = useState(0);
  const retryIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
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

  // Workshop data (for show_participant_notes flag)
  const { data: workshopData } = useWorkshop(workshopId!);
  const notesEnabled = workshopData?.show_participant_notes ?? false;

  // Annotation notes (only fetch when enabled)
  const [noteContent, setNoteContent] = useState('');
  const { data: annotationNotes } = useParticipantNotes(workshopId!, user?.id, 'annotation');
  const submitNote = useSubmitParticipantNote(workshopId!);
  const deleteNote = useDeleteParticipantNote(workshopId!);

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
      // Check if this is a fresh start (user just started/reset annotation phase)
      const freshStartKey = `annotation-fresh-start-${workshopId}`;
      const isFreshStart = localStorage.getItem(freshStartKey) === 'true';
      
      if (isFreshStart) {
        // Clear the flag
        localStorage.removeItem(freshStartKey);
        // Start from the first trace regardless of existing annotations
        setCurrentTraceIndex(0);
        setSubmittedAnnotations(new Set());
        setCurrentRatings({});
        setFreeformResponses({});
        setComment('');
        hasInitialized.current = true;
        return;
      }
      
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
  }, [existingAnnotations, traceData, hasNavigatedManually, workshopId]);

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
      return false;
    }

    // For user-initiated saves, check if content has changed
    if (!isBackground) {
      // Prevent concurrent user-initiated saves
      if (isSavingRef.current) {
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
      
      // Queue for retry if this was a background save
      if (isBackground) {
        const existingEntry = failedSaveQueueRef.current.get(targetTraceId);
        const attempts = existingEntry ? existingEntry.attempts + 1 : 1;
        
        // Only add to queue if not already there (avoid duplicates from rapid clicking)
        if (!existingEntry) {
          failedSaveQueueRef.current.set(targetTraceId, {
            traceId: targetTraceId,
            ratings: { ...ratingsToSave },
            freeformResponses: { ...freeformToSave },
            comment: commentToSave,
            attempts,
            lastAttempt: Date.now()
          });
          setFailedSaveCount(failedSaveQueueRef.current.size);
          
          // Notify user once when save fails (only for new failures)
          toast.warning('Retrying save', {
            description: 'Your annotation will be saved automatically.',
            duration: 3000,
            id: `save-retry-${targetTraceId}`
          });
        } else {
          // Update existing entry with latest data
          failedSaveQueueRef.current.set(targetTraceId, {
            ...existingEntry,
            ratings: { ...ratingsToSave },
            freeformResponses: { ...freeformToSave },
            comment: commentToSave,
            attempts,
            lastAttempt: Date.now()
          });
        }
        
      } else {
        toast.error('Save failed', { description: 'Please try again.' });
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
  
  // Process failed save queue - retry one at a time
  const processFailedSaveQueue = useCallback(async () => {
    if (failedSaveQueueRef.current.size === 0) return;
    
    const now = Date.now();
    const entries = Array.from(failedSaveQueueRef.current.entries());
    
    for (const [traceId, data] of entries) {
      // Skip if attempted too recently (wait at least 5 seconds between retries)
      if (now - data.lastAttempt < 5000) continue;
      
      // Skip if max attempts reached (10 attempts max)
      if (data.attempts >= 10) {
        console.error(`Max retry attempts reached for trace ${traceId}, removing from queue`);
        failedSaveQueueRef.current.delete(traceId);
        setFailedSaveCount(failedSaveQueueRef.current.size);
        continue;
      }
      
      
      // Update last attempt time
      data.lastAttempt = now;
      data.attempts += 1;
      
      try {
        const numericRatings = Object.fromEntries(
          Object.entries(data.ratings).filter(([_, v]) => typeof v === 'number')
        );
        
        // Calculate legacy rating
        let legacyRating = 3;
        for (const question of rubricQuestions) {
          if (question.judgeType === 'likert') {
            const rating = data.ratings[question.id];
            if (typeof rating === 'number' && rating >= 1 && rating <= 5) {
              legacyRating = rating;
              break;
            }
          }
        }
        
        const annotationData = {
          trace_id: traceId,
          user_id: currentUserId,
          rating: legacyRating,
          ratings: numericRatings,
          comment: buildCombinedComment(data.comment, data.freeformResponses)
        };
        
        await submitAnnotation.mutateAsync(annotationData);
        
        // Success! Remove from queue
        failedSaveQueueRef.current.delete(traceId);
        setFailedSaveCount(failedSaveQueueRef.current.size);
        setSubmittedAnnotations(prev => new Set([...prev, traceId]));
        
        // Update saved state
        savedStateRef.current.set(traceId, {
          ratings: { ...data.ratings },
          freeformResponses: { ...data.freeformResponses },
          comment: data.comment
        });
        
        
        // Only process one at a time to avoid overwhelming the backend
        break;
      } catch (error) {
        console.error(`Retry failed for trace ${traceId}:`, error);
        // Will be retried on next interval
      }
    }
  }, [rubricQuestions, currentUserId, submitAnnotation, buildCombinedComment]);
  
  // Set up periodic retry for failed saves
  useEffect(() => {
    // Run retry every 5 seconds
    retryIntervalRef.current = setInterval(() => {
      processFailedSaveQueue();
    }, 5000);
    
    return () => {
      if (retryIntervalRef.current) {
        clearInterval(retryIntervalRef.current);
      }
    };
  }, [processFailedSaveQueue]);

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
      return;
    }
    if (isNavigating) {
      return; // Prevent concurrent navigation
    }
    
    // Debounce rapid clicks to prevent overwhelming the backend
    const now = Date.now();
    if (now - lastNavigationTimeRef.current < NAVIGATION_DEBOUNCE_MS) {
      return;
    }
    lastNavigationTimeRef.current = now;
    
    // Validate that all required questions have been answered
    const unansweredQuestions = rubricQuestions.filter(q => {
      // Freeform questions are optional for navigation
      if (q.judgeType === 'freeform') return false;
      // Likert and binary questions must have a rating
      return currentRatings[q.id] === undefined;
    });
    
    if (unansweredQuestions.length > 0) {
      toast.error('Missing ratings', { description: `Please rate: ${unansweredQuestions.map(q => q.title).join(', ')}` });
      return;
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
          const success = await saveAnnotation(currentTraceId, false, ratingsToSave, freeformToSave, commentToSave);
          if (success) {
            toast.success('All complete', { description: 'All traces annotated successfully!' });
          } else {
            toast.error('Save failed', { description: 'Please try again.' });
          }
        } else {
          // No ratings but still mark as submitted to update progress
          setSubmittedAnnotations(prev => new Set([...prev, currentTraceId]));
          toast.success('All complete', { description: 'All traces annotated successfully!' });
        }
      } catch (error) {
        console.error('nextTrace: Error saving final annotation:', error);
        toast.error('Save failed', { description: 'Please try again.' });
      } finally {
        setIsNavigating(false);
      }
      return;
    }
    
    setIsNavigating(true);
    
    // Navigate immediately (optimistic)
    const nextIndex = currentTraceIndex + 1;
    
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
      // Save with the stored values (before form was cleared)
      saveAnnotation(currentTraceId, true, ratingsToSave, freeformToSave, commentToSave)
        .then((success) => {
          if (success) {
          } else {
            // Save failed after retries - log but don't show intrusive toast
            // The retry logic should handle most transient failures
          }
        })
        .catch((error) => {
          // This shouldn't happen as saveAnnotation catches errors, but log just in case
          console.error('nextTrace: Unexpected background save error:', error);
        });
    } else {
    }
  };

  const prevTrace = () => {
    if (!currentTrace) {
      return;
    }
    if (isNavigating) {
      return; // Prevent concurrent navigation
    }
    
    // Debounce rapid clicks to prevent overwhelming the backend
    const now = Date.now();
    if (now - lastNavigationTimeRef.current < NAVIGATION_DEBOUNCE_MS) {
      return;
    }
    lastNavigationTimeRef.current = now;
    
    // Check if we can navigate
    if (currentTraceIndex <= 0) {
      return;
    }
    
    setIsNavigating(true);
    
    // Store current trace data for background save
    const currentTraceId = currentTrace.id;
    const ratingsToSave = { ...currentRatings };
    const freeformToSave = { ...freeformResponses };
    const commentToSave = comment;
    const hasRatings = Object.keys(ratingsToSave).length > 0;
    
    // Navigate immediately (optimistic)
    const prevIndex = currentTraceIndex - 1;
    
    setHasNavigatedManually(true);
    setCurrentTraceIndex(prevIndex);
    
    // Clear navigating flag immediately after state update
    setIsNavigating(false);
    
    // Save in background (async, non-blocking)
    if (hasRatings) {
      // Save with the stored values (before navigation)
      saveAnnotation(currentTraceId, true, ratingsToSave, freeformToSave, commentToSave)
        .then((success) => {
          if (success) {
          } else {
            // Save failed after retries - log but don't show intrusive toast
          }
        })
        .catch((error) => {
          // This shouldn't happen as saveAnnotation catches errors, but log just in case
          console.error('prevTrace: Unexpected background save error:', error);
        });
    } else {
    }
  };

  const completedCount = submittedAnnotations.size;
  const hasRated = Object.keys(currentRatings).length > 0;
  
  // Next button should only be disabled if user hasn't provided any ratings or is navigating
  // Allow navigation even if already submitted (to enable editing)
  // Navigation is now optimistic, so we don't block on isSaving
  const isNextDisabled = !canAnnotate || Object.keys(currentRatings).length === 0 || isNavigating;
  
  // Warn user before leaving if there are pending saves
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (failedSaveQueueRef.current.size > 0) {
        e.preventDefault();
        e.returnValue = 'You have unsaved annotations. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);
  
  // Manual retry all failed saves
  const retryAllFailedSaves = async () => {
    if (failedSaveQueueRef.current.size === 0) return;
    
    toast.info('Retrying saves', { description: `${failedSaveQueueRef.current.size} unsaved annotation${failedSaveQueueRef.current.size > 1 ? 's' : ''} queued.` });
    
    // Process all entries (not just one)
    const entries = Array.from(failedSaveQueueRef.current.entries());
    let successCount = 0;
    
    for (const [traceId, data] of entries) {
      try {
        const numericRatings = Object.fromEntries(
          Object.entries(data.ratings).filter(([_, v]) => typeof v === 'number')
        );
        
        let legacyRating = 3;
        for (const question of rubricQuestions) {
          if (question.judgeType === 'likert') {
            const rating = data.ratings[question.id];
            if (typeof rating === 'number' && rating >= 1 && rating <= 5) {
              legacyRating = rating;
              break;
            }
          }
        }
        
        const annotationData = {
          trace_id: traceId,
          user_id: currentUserId,
          rating: legacyRating,
          ratings: numericRatings,
          comment: buildCombinedComment(data.comment, data.freeformResponses)
        };
        
        await submitAnnotation.mutateAsync(annotationData);
        
        failedSaveQueueRef.current.delete(traceId);
        setSubmittedAnnotations(prev => new Set([...prev, traceId]));
        savedStateRef.current.set(traceId, {
          ratings: { ...data.ratings },
          freeformResponses: { ...data.freeformResponses },
          comment: data.comment
        });
        successCount++;
      } catch (error) {
        console.error(`Failed to save annotation for trace ${traceId}:`, error);
      }
    }
    
    setFailedSaveCount(failedSaveQueueRef.current.size);
    
    if (successCount > 0) {
      toast.success('Annotations saved', { description: `${successCount} annotation${successCount > 1 ? 's' : ''} saved successfully.` });
    }
    if (failedSaveQueueRef.current.size > 0) {
      toast.error('Some saves pending', { description: `${failedSaveQueueRef.current.size} annotation${failedSaveQueueRef.current.size > 1 ? 's' : ''} still need to be saved.` });
    }
  };
  
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
      <div className="max-w-7xl mx-auto space-y-6">
        {/* Compact Progress Bar */}
        <div className="flex items-center gap-4 px-1">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
              Trace {currentTraceIndex + 1}/{traceData.length}
            </span>
            {submittedAnnotations.has(currentTrace.id) && (
              <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
            )}
          </div>
          <div className="flex-1 flex items-center gap-2">
            <div className="flex-1 bg-gray-200 rounded-full h-1.5">
              <div
                className="bg-blue-500 h-1.5 rounded-full transition-all duration-300"
                style={{ width: `${(completedCount / traceData.length) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 whitespace-nowrap">{completedCount}/{traceData.length}</span>
          </div>
          {failedSaveCount > 0 && (
            <Button
              variant="ghost"
              size="sm"
              onClick={retryAllFailedSaves}
              className="text-amber-600 hover:bg-amber-50 h-7 px-2 gap-1"
            >
              <RefreshCw className="h-3.5 w-3.5" />
              <span className="text-xs">Retry {failedSaveCount}</span>
            </Button>
          )}
        </div>


        {/* Side-by-side: Trace (left 60%) + Scoring (right 40%) */}
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6">
          {/* Left Column: Trace */}
          <div className="lg:sticky lg:top-6 lg:self-start">
            <TraceViewer trace={currentTrace} />
          </div>

          {/* Right Column: Scoring + Navigation + Notes */}
          <div className="space-y-4">
        {/* Rubric Questions */}
        <Card>
          <CardHeader className="px-4 py-3">
            <CardTitle className="text-sm flex items-center justify-between">
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
                  className="flex items-center gap-1 text-[10px] h-6 px-2"
                >
                  View Full Context
                </Button>
              )}
            </CardTitle>
            {!canAnnotate && (
              <p className="text-sm text-red-600 mt-2">
                <AlertCircle className="h-4 w-4 inline mr-1" />
                You don't have permission to submit annotations. You can view the traces but cannot provide ratings.
              </p>
            )}
          </CardHeader>
          <CardContent className="px-4 space-y-4">
            {rubricQuestions.map((question, questionIndex) => (
              <div
                key={question.id}
                className="rounded-lg p-3 border bg-white"
              >
                <div className="mb-2">
                  <div className="flex items-center gap-2">
                    <Label className="text-sm font-medium">
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
                  <FormattedRubricDescription description={question.description} />
                </div>
                
                <div className="space-y-4">
                  {/* Likert Scale (1-5) */}
                  {question.judgeType === 'likert' && (
                    <div className="flex items-start justify-between max-w-xl mx-auto">
                      {[1, 2, 3, 4, 5].map((value) => {
                        const labels = [
                          '', // placeholder for value 0
                          'Strongly Disagree',
                          'Disagree',
                          'Neutral',
                          'Agree',
                          'Strongly Agree'
                        ];

                        const colors = [
                          '',
                          'border-red-300 bg-red-50 text-red-700 hover:border-red-400',
                          'border-orange-300 bg-orange-50 text-orange-700 hover:border-orange-400',
                          'border-gray-300 bg-gray-50 text-gray-700 hover:border-gray-400',
                          'border-blue-300 bg-blue-50 text-blue-700 hover:border-blue-400',
                          'border-green-300 bg-green-50 text-green-700 hover:border-green-400'
                        ];

                        const selectedColors = [
                          '',
                          'border-red-500 bg-red-100 text-red-800 ring-1 ring-red-300',
                          'border-orange-500 bg-orange-100 text-orange-800 ring-1 ring-orange-300',
                          'border-gray-500 bg-gray-100 text-gray-800 ring-1 ring-gray-300',
                          'border-blue-500 bg-blue-100 text-blue-800 ring-1 ring-blue-300',
                          'border-green-500 bg-green-100 text-green-800 ring-1 ring-green-300'
                        ];

                        const isSelected = currentRatings[question.id] === value;

                        return (
                          <div key={value} className="flex flex-col items-center">
                            <div
                              className={`${canAnnotate && !isSaving ? "cursor-pointer" : "cursor-not-allowed opacity-50"} mb-1.5`}
                              onClick={(e) => {
                                e.preventDefault();
                                e.stopPropagation();
                                if (canAnnotate && !isSaving) {
                                  setCurrentRatings(prev => ({
                                    ...prev,
                                    [question.id]: value
                                  }));
                                }
                              }}
                              role="button"
                              tabIndex={canAnnotate && !isSaving ? 0 : -1}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault();
                                  e.stopPropagation();
                                  if (canAnnotate && !isSaving) {
                                    setCurrentRatings(prev => ({
                                      ...prev,
                                      [question.id]: value
                                    }));
                                  }
                                }
                              }}
                            >
                              <div className={`
                                w-6 h-6 rounded-full border flex items-center justify-center
                                transition-all duration-150 font-medium text-[10px]
                                ${isSelected ? selectedColors[value] : colors[value]}
                              `}>
                                {value}
                              </div>
                            </div>
                            <span className={`text-[9px] text-center leading-tight w-8 font-medium ${
                              isSelected ? 'text-gray-900' : 'text-gray-400'
                            }`}>
                              {labels[value]}
                            </span>
                          </div>
                        );
                      })}
                    </div>
                  )}
                  
                  {/* Binary (Pass/Fail) */}
                  {question.judgeType === 'binary' && (
                    <div className="flex justify-center gap-4">
                      <div
                        className={`flex flex-col items-center gap-1 ${canAnnotate && !isSaving ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                        onClick={() => canAnnotate && !isSaving && setCurrentRatings(prev => ({ ...prev, [question.id]: 1 }))}
                        role="button"
                        tabIndex={canAnnotate && !isSaving ? 0 : -1}
                        onKeyDown={(e) => e.key === 'Enter' && canAnnotate && !isSaving && setCurrentRatings(prev => ({ ...prev, [question.id]: 1 }))}
                      >
                        <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all duration-150 ${
                          currentRatings[question.id] === 1
                            ? 'border-emerald-500 bg-emerald-100 ring-1 ring-emerald-300'
                            : 'border-gray-300 bg-gray-50 hover:border-emerald-400 hover:bg-emerald-50'
                        }`}>
                          <CheckCircle className={`w-3 h-3 ${currentRatings[question.id] === 1 ? 'text-emerald-600' : 'text-gray-400'}`} />
                        </div>
                        <span className={`text-[9px] font-medium ${currentRatings[question.id] === 1 ? 'text-emerald-700' : 'text-gray-500'}`}>Pass</span>
                      </div>
                      <div
                        className={`flex flex-col items-center gap-1 ${canAnnotate && !isSaving ? 'cursor-pointer' : 'cursor-not-allowed opacity-50'}`}
                        onClick={() => canAnnotate && !isSaving && setCurrentRatings(prev => ({ ...prev, [question.id]: 0 }))}
                        role="button"
                        tabIndex={canAnnotate && !isSaving ? 0 : -1}
                        onKeyDown={(e) => e.key === 'Enter' && canAnnotate && !isSaving && setCurrentRatings(prev => ({ ...prev, [question.id]: 0 }))}
                      >
                        <div className={`w-6 h-6 rounded-full border flex items-center justify-center transition-all duration-150 ${
                          currentRatings[question.id] === 0
                            ? 'border-rose-500 bg-rose-100 ring-1 ring-rose-300'
                            : 'border-gray-300 bg-gray-50 hover:border-rose-400 hover:bg-rose-50'
                        }`}>
                          <AlertCircle className={`w-3 h-3 ${currentRatings[question.id] === 0 ? 'text-rose-600' : 'text-gray-400'}`} />
                        </div>
                        <span className={`text-[9px] font-medium ${currentRatings[question.id] === 0 ? 'text-rose-700' : 'text-gray-500'}`}>Fail</span>
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
                className="w-full min-h-[80px] p-2.5 text-sm border border-gray-200 rounded-md whitespace-pre-wrap focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={!canAnnotate || isSaving}
                style={{ whiteSpace: 'pre-wrap' }}
              />
            </div>

            {/* Status indicator */}
            {submittedAnnotations.has(currentTrace.id) && (
              <div className="flex items-center gap-2 text-sm text-green-700 bg-green-50 rounded-md px-3 py-2">
                <CheckCircle className="h-4 w-4" />
                <span>Saved — edit and navigate to update</span>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            size="sm"
            onClick={prevTrace}
            disabled={currentTraceIndex === 0 || isNavigating}
            className="flex items-center gap-1 h-7 text-xs"
          >
            <ChevronLeft className="h-3 w-3" />
            Prev
          </Button>

          <Button
            size="sm"
            onClick={nextTrace}
            disabled={isNextDisabled}
            className="flex items-center gap-1 h-7 text-xs"
            data-testid={currentTraceIndex === traceData.length - 1 ? "complete-annotation-button" : "next-trace-button"}
          >
            {currentTraceIndex === traceData.length - 1 ? (
              <>
                <Send className="h-3 w-3" />
                Complete
              </>
            ) : (
              <>
                Next
                <ChevronRight className="h-3 w-3" />
              </>
            )}
          </Button>
        </div>

        {/* Annotation Notepad - only shown when facilitator enables it */}
        {notesEnabled && (
          <Card>
            <CardHeader className="px-4 py-3">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <NotebookPen className="h-4 w-4 text-purple-600" />
                  <CardTitle className="text-sm">Notes</CardTitle>
                </div>
                {annotationNotes && annotationNotes.length > 0 && (
                  <Badge variant="outline" className="text-xs bg-purple-50 text-purple-700 border-purple-200">
                    {annotationNotes.length}
                  </Badge>
                )}
              </div>
            </CardHeader>
            <CardContent className="px-4 space-y-3 pt-0">
              {/* Add note input */}
              <div className="space-y-2">
                <Textarea
                  id="notepad-input"
                  placeholder="Write an observation or discussion note about this trace..."
                  value={noteContent}
                  onChange={(e) => setNoteContent(e.target.value)}
                  className="min-h-[80px] flex-1 border-purple-200 focus:border-purple-400 focus:ring-purple-400"
                  disabled={!canAnnotate}
                />
                <Button
                  size="sm"
                  onClick={async () => {
                    if (!noteContent.trim() || !user?.id) return;
                    try {
                      await submitNote.mutateAsync({
                        user_id: user.id,
                        trace_id: currentTrace?.id || null,
                        content: noteContent.trim(),
                        phase: 'annotation',
                      });
                      setNoteContent('');
                      toast.success('Note saved', { description: 'Your observation has been recorded.' });
                    } catch (error) {
                      toast.error('Could not save note', { description: 'Please try again.' });
                    }
                  }}
                  disabled={!noteContent.trim() || !canAnnotate || submitNote.isPending}
                  className="bg-purple-600 hover:bg-purple-700 text-white h-7 text-xs"
                >
                  {submitNote.isPending ? 'Saving...' : (
                    <>
                      <NotebookPen className="h-3 w-3 mr-1" />
                      Add Note
                    </>
                  )}
                </Button>
              </div>

              {/* Existing notes */}
              {annotationNotes && annotationNotes.length > 0 && (
                <div className="space-y-2 pt-3 border-t">
                  {annotationNotes.map((note) => (
                    <div
                      key={note.id}
                      className={`flex items-start justify-between gap-2 p-2.5 rounded border text-sm ${
                        note.trace_id === currentTrace?.id
                          ? 'bg-purple-50 border-purple-200'
                          : 'bg-gray-50 border-gray-200'
                      }`}
                    >
                      <div className="flex-1 min-w-0">
                        <p className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed">{note.content}</p>
                        <div className="flex items-center gap-3 mt-2">
                          {note.trace_id && (
                            <Badge variant="outline" className="text-xs bg-purple-100 text-purple-700 border-purple-300">
                              Trace {traceData.findIndex((t: TraceData) => t.id === note.trace_id) + 1 || '?'}
                            </Badge>
                          )}
                          <span className="text-xs text-gray-500">
                            {new Date(note.created_at).toLocaleTimeString()}
                          </span>
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={async () => {
                          try {
                            await deleteNote.mutateAsync(note.id);
                            toast.success('Note deleted', { description: 'Observation removed.' });
                          } catch (error) {
                            toast.error('Could not delete note', { description: 'Please try again.' });
                          }
                        }}
                        className="text-red-400 hover:text-red-600 hover:bg-red-50 h-8 w-8 p-0 flex-shrink-0"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  ))}
                </div>
              )}
            </CardContent>
          </Card>
        )}
          </div>{/* End right column */}
        </div>{/* End grid */}
      </div>
    </div>
  );
}