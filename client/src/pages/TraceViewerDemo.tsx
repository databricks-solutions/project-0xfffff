/**
 * TraceViewerDemo Page
 * 
 * Demonstrates the TraceViewer component with real workshop trace data.
 * This shows how the discovery interface will look during workshops.
 */

import React, { useState, useEffect, useRef, useMemo, useCallback } from 'react';
import { TraceViewer, TraceData } from '@/components/TraceViewer';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { MessageCircle, ChevronLeft, ChevronRight, Send, AlertCircle, CheckCircle, Settings, RefreshCw, NotebookPen, Trash2, Lightbulb } from 'lucide-react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useWorkflowContext } from '@/context/WorkflowContext';
import { toast } from 'sonner';
import { useUser, useRoleCheck } from '@/context/UserContext';
import { useTraces, useUserFindings, useSubmitFinding, useParticipantNotes, useSubmitParticipantNote, useDeleteParticipantNote, useWorkshop, refetchAllWorkshopQueries } from '@/hooks/useWorkshopApi';
import { useQueryClient } from '@tanstack/react-query';
import { WorkshopsService } from '@/client';
import type { Trace } from '@/client';

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

export function TraceViewerDemo() {
  const { workshopId } = useWorkshopContext();
  const { currentPhase } = useWorkflowContext();
  const { user } = useUser();
  const { canCreateFindings, isFacilitator } = useRoleCheck();

  // All useState hooks must be called before early returns
  const [currentTraceIndex, setCurrentTraceIndex] = useState(0);
  const [question1Response, setQuestion1Response] = useState('');
  const [question2Response, setQuestion2Response] = useState('');
  const [submittedFindings, setSubmittedFindings] = useState<Set<string>>(new Set());
  const [isCompletingDiscovery, setIsCompletingDiscovery] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const previousTraceId = useRef<string | null>(null);
  const hasAutoNavigated = useRef(false);
  const previousTraceCount = useRef<number>(0);

  // Fetch data - pass user ID for personalized trace ordering
  const { data: traces, isLoading: tracesLoading, error: tracesError } = useTraces(
    workshopId!,
    user?.id  // May be undefined - hook handles this gracefully
  );
  const { data: existingFindings } = useUserFindings(workshopId!, user); // Secure user-isolated findings
  const submitFinding = useSubmitFinding(workshopId!);
  const queryClient = useQueryClient();
  
  // Workshop data (for show_participant_notes flag)
  const { data: workshopData } = useWorkshop(workshopId!);
  const notesEnabled = workshopData?.show_participant_notes ?? false;

  // Participant notepad (only fetch when enabled)
  const [noteContent, setNoteContent] = useState('');
  const { data: participantNotes } = useParticipantNotes(workshopId!, user?.id, 'discovery');
  const submitNote = useSubmitParticipantNote(workshopId!);
  const deleteNote = useDeleteParticipantNote(workshopId!);

  // Convert traces to TraceData format - memoize to prevent infinite loops
  const traceData = useMemo(() => {
    return traces?.map(convertTraceToTraceData) || [];
  }, [traces]);
  const currentTrace = traceData[currentTraceIndex];
  
  // Check if discovery phase is complete
  const allTracesHaveFindings = traceData.length > 0 && traceData.every(trace => submittedFindings.has(trace.id));
  const isDiscoveryComplete = allTracesHaveFindings && submittedFindings.size === traceData.length;

  // Initialize saved state from all existing findings (runs once)
  useEffect(() => {
    if (existingFindings && existingFindings.length > 0) {
      existingFindings.forEach(finding => {
        const insight = finding.insight || '';
        const parts = insight.split('\n\nImprovement Analysis: ');
        if (parts.length === 2) {
          const qualityPart = parts[0].replace('Quality Assessment: ', '');
          const improvementPart = parts[1];
          savedStateRef.current.set(finding.trace_id, { q1: qualityPart, q2: improvementPart });
        } else {
          // Couldn't parse, treat as raw text
          savedStateRef.current.set(finding.trace_id, { q1: insight, q2: '' });
        }
      });
    }
  }, [existingFindings?.length]); // Only run when findings count changes

  // Track existing findings for current trace and populate responses
  useEffect(() => {
    if (currentTrace?.id && currentTrace.id !== previousTraceId.current) {
      // Check if this trace has an existing finding
      const existingFinding = existingFindings?.find(finding => finding.trace_id === currentTrace.id);
      
      if (existingFinding) {
        // Parse and populate the existing finding text
        const insight = existingFinding.insight || '';
        const parts = insight.split('\n\nImprovement Analysis: ');
        if (parts.length === 2) {
          const qualityPart = parts[0].replace('Quality Assessment: ', '');
          const improvementPart = parts[1];
          setQuestion1Response(qualityPart);
          setQuestion2Response(improvementPart);
        } else {
          // Couldn't parse, treat as raw text
          setQuestion1Response(insight);
          setQuestion2Response('');
        }
      } else {
        // Clear responses for new trace
        setQuestion1Response('');
        setQuestion2Response('');
      }
      
      previousTraceId.current = currentTrace.id;
    }
  }, [currentTrace?.id, existingFindings]);

  // Navigate to first incomplete trace (only on initial load) and handle trace additions
  useEffect(() => {
    if (existingFindings && traceData.length > 0) {
      const validTraceIds = new Set(traceData.map(t => t.id));
      const completedTraceIds = new Set(existingFindings
        .filter(f => validTraceIds.has(f.trace_id))  // Only count findings for current traces
        .map(f => f.trace_id)
      );
      // NOTE: Do NOT call setSubmittedFindings here - handled by separate effect below
      
      // Check if traces were added (count increased)
      const tracesWereAdded = previousTraceCount.current > 0 && traceData.length > previousTraceCount.current;
      
      if (!hasAutoNavigated.current) {
        // Initial load: navigate to first incomplete trace
        const firstIncompleteIndex = traceData.findIndex(trace => !completedTraceIds.has(trace.id));
        if (firstIncompleteIndex !== -1) {
          setCurrentTraceIndex(firstIncompleteIndex);
        } else if (completedTraceIds.size === traceData.length) {
          // All traces completed, show last one
          setCurrentTraceIndex(traceData.length - 1);
        }
        hasAutoNavigated.current = true;
      } else if (tracesWereAdded) {
        // Traces were added: maintain position or move to first new trace if user was at the end
        const oldTraceCount = previousTraceCount.current;
        setCurrentTraceIndex(prevIndex => {
          // If user was at or past the old last trace, move to first new trace
          if (prevIndex >= oldTraceCount - 1) {
            return oldTraceCount; // First new trace
          }
          // Otherwise keep their current position
          return prevIndex;
        });
      }
      
      // Update the trace count
      previousTraceCount.current = traceData.length;
    }
  }, [existingFindings, traceData]);

  // Update submitted findings when existing findings change (separate effect to avoid infinite loop)
  useEffect(() => {
    if (existingFindings && traceData.length > 0) {
      const validTraceIds = new Set(traceData.map(t => t.id));
      const completedTraceIds = new Set(existingFindings
        .filter(f => validTraceIds.has(f.trace_id))  // Only count findings for current traces
        .map(f => f.trace_id)
      );
      
      // Only update if the set actually changed
      setSubmittedFindings(prev => {
        const prevArray = Array.from(prev).sort();
        const newArray = Array.from(completedTraceIds).sort();
        if (prevArray.length !== newArray.length || 
            !prevArray.every((id, index) => id === newArray[index])) {
          return completedTraceIds;
        }
        return prev;
      });
    }
  }, [existingFindings, traceData]);

  
  // Track saved state per trace (better than global refs)
  const savedStateRef = useRef<Map<string, { q1: string; q2: string }>>(new Map());
  const savingTracesRef = useRef<Set<string>>(new Set()); // Track which traces are currently saving
  const isSavingRef = useRef(false); // Track if any user-initiated save is in progress
  const saveStatusRef = useRef<Map<string, 'saved' | 'saving' | 'failed'>>(new Map()); // Track save status per trace
  const lastNavigationTimeRef = useRef<number>(0); // Track last navigation to prevent rapid clicking
  const NAVIGATION_DEBOUNCE_MS = 300; // Minimum time between navigations
  
  // Failed save queue for retry mechanism
  interface FailedSaveData {
    traceId: string;
    q1: string;
    q2: string;
    attempts: number;
    lastAttempt: number;
  }
  const failedSaveQueueRef = useRef<Map<string, FailedSaveData>>(new Map());
  const [failedSaveCount, setFailedSaveCount] = useState(0);
  const retryIntervalRef = useRef<NodeJS.Timeout | null>(null);
  
  // Retry utility with exponential backoff
  const retryWithBackoff = async <T,>(
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
  };
  
  // Save finding function - optimized to track state per trace
  const saveFinding = useCallback(async (q1: string, q2: string, traceId: string, isBackground: boolean = false): Promise<boolean> => {
    // Allow saving if at least one field has content (both fields are not required)
    if ((!q1.trim() && !q2.trim()) || !traceId) {
      // No content to save, but this is not an error - return true to allow navigation
      return true;
    }
    
    const q1Trimmed = q1.trim();
    const q2Trimmed = q2.trim();
    
    // Check if this trace is already being saved (prevent duplicate saves)
    if (savingTracesRef.current.has(traceId)) {
      return false;
    }
    
    // For user-initiated saves, check if content has changed from last saved
    if (!isBackground) {
      // Prevent concurrent user-initiated saves
      if (isSavingRef.current) {
        return false;
      }
      
      // Check if content has actually changed from last saved for this trace
      const savedState = savedStateRef.current.get(traceId);
      if (savedState) {
        const hasChanged = q1Trimmed !== savedState.q1 || q2Trimmed !== savedState.q2;
        if (!hasChanged) {
          // Even though we skip the save, ensure the trace is marked as submitted
          // This fixes the issue where "Complete" doesn't record the last trace
          setSubmittedFindings(prev => new Set([...prev, traceId]));
          return true; // No change needed, return success
        }
      }
      
      // Set saving flag for user-initiated saves
      isSavingRef.current = true;
      setIsSaving(true);
    }
    
    // Mark this trace as being saved
    savingTracesRef.current.add(traceId);
    if (isBackground) {
      saveStatusRef.current.set(traceId, 'saving');
    }
    
    try {
      const content = `Quality Assessment: ${q1Trimmed}\n\nImprovement Analysis: ${q2Trimmed}`;
      
      
      // Use retry logic for background saves, direct call for user-initiated saves
      if (isBackground) {
        await retryWithBackoff(() => submitFinding.mutateAsync({
          trace_id: traceId,
          user_id: user?.id || 'demo_user',
          insight: content
        }), 3, 1000); // 3 retries with exponential backoff
      } else {
        await submitFinding.mutateAsync({
          trace_id: traceId,
          user_id: user?.id || 'demo_user',
          insight: content
        });
      }
      
      setSubmittedFindings(prev => new Set([...prev, traceId]));
      
      // Update saved state for this trace AFTER successful save
      savedStateRef.current.set(traceId, { q1: q1Trimmed, q2: q2Trimmed });
      if (isBackground) {
        saveStatusRef.current.set(traceId, 'saved');
      }
      
      return true;
    } catch (error: any) {
      console.error('Failed to save finding after retries:', error);
      console.error('Error details:', {
        message: error?.message,
        response: error?.response?.data,
        status: error?.response?.status,
        traceId,
        q1Length: q1Trimmed.length,
        q2Length: q2Trimmed.length,
        isBackground
      });
      
      if (isBackground) {
        saveStatusRef.current.set(traceId, 'failed');
      }
      
      // Queue for retry
      const existingEntry = failedSaveQueueRef.current.get(traceId);
      if (!existingEntry) {
        // New entry - add to queue
        failedSaveQueueRef.current.set(traceId, {
          traceId,
          q1: q1Trimmed,
          q2: q2Trimmed,
          attempts: 1,
          lastAttempt: Date.now()
        });
        setFailedSaveCount(failedSaveQueueRef.current.size);
        
        // Notify user once when save fails (only for new failures)
        toast.warning('Retrying save', {
          description: 'Your finding will be saved automatically.',
          duration: 3000,
          id: `save-retry-${traceId}`
        });
      } else {
        // Update existing entry with latest data
        failedSaveQueueRef.current.set(traceId, {
          ...existingEntry,
          q1: q1Trimmed,
          q2: q2Trimmed,
          attempts: existingEntry.attempts + 1,
          lastAttempt: Date.now()
        });
      }
      
      
      // Only show error toast for user-initiated saves (not background)
      if (!isBackground) {
        toast.error('Save failed', { description: 'Will retry automatically.' });
      }
      return false;
    } finally {
      // Clear saving flags
      savingTracesRef.current.delete(traceId);
      if (!isBackground) {
        isSavingRef.current = false;
        setIsSaving(false);
      }
    }
  }, [submitFinding, user?.id]);
  
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
        const content = `Quality Assessment: ${data.q1}\n\nImprovement Analysis: ${data.q2}`;
        
        await submitFinding.mutateAsync({
          trace_id: traceId,
          user_id: user?.id || 'demo_user',
          insight: content
        });
        
        // Success! Remove from queue
        failedSaveQueueRef.current.delete(traceId);
        setFailedSaveCount(failedSaveQueueRef.current.size);
        setSubmittedFindings(prev => new Set([...prev, traceId]));
        
        // Update saved state
        savedStateRef.current.set(traceId, { q1: data.q1, q2: data.q2 });
        saveStatusRef.current.set(traceId, 'saved');
        
        
        // Only process one at a time to avoid overwhelming the backend
        break;
      } catch (error) {
        console.error(`Retry failed for trace ${traceId}:`, error);
        // Will be retried on next interval
      }
    }
  }, [submitFinding, user?.id]);
  
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
  
  // Warn user before leaving if there are pending saves
  useEffect(() => {
    const handleBeforeUnload = (e: BeforeUnloadEvent) => {
      if (failedSaveQueueRef.current.size > 0) {
        e.preventDefault();
        e.returnValue = 'You have unsaved findings. Are you sure you want to leave?';
        return e.returnValue;
      }
    };
    
    window.addEventListener('beforeunload', handleBeforeUnload);
    return () => window.removeEventListener('beforeunload', handleBeforeUnload);
  }, []);
  
  // Manual retry all failed saves
  const retryAllFailedSaves = async () => {
    if (failedSaveQueueRef.current.size === 0) return;
    
    toast.info('Retrying saves', { description: `${failedSaveQueueRef.current.size} unsaved finding${failedSaveQueueRef.current.size > 1 ? 's' : ''} queued.` });
    
    const entries = Array.from(failedSaveQueueRef.current.entries());
    let successCount = 0;
    
    for (const [traceId, data] of entries) {
      try {
        const content = `Quality Assessment: ${data.q1}\n\nImprovement Analysis: ${data.q2}`;
        
        await submitFinding.mutateAsync({
          trace_id: traceId,
          user_id: user?.id || 'demo_user',
          insight: content
        });
        
        failedSaveQueueRef.current.delete(traceId);
        setSubmittedFindings(prev => new Set([...prev, traceId]));
        savedStateRef.current.set(traceId, { q1: data.q1, q2: data.q2 });
        saveStatusRef.current.set(traceId, 'saved');
        successCount++;
      } catch (error) {
        console.error(`Failed to save finding for trace ${traceId}:`, error);
      }
    }
    
    setFailedSaveCount(failedSaveQueueRef.current.size);
    
    if (successCount > 0) {
      toast.success('Findings saved', { description: `${successCount} finding${successCount > 1 ? 's' : ''} saved successfully.` });
    }
    if (failedSaveQueueRef.current.size > 0) {
      toast.error('Some saves pending', { description: `${failedSaveQueueRef.current.size} finding${failedSaveQueueRef.current.size > 1 ? 's' : ''} still need to be saved.` });
    }
  };
  
  // NOTE: Removed blur auto-save as it conflicts with button clicks
  // The Next/Previous buttons already handle saving before navigation
  
  // Track navigation using ref (more reliable than state for preventing double-clicks)
  const isNavigatingRef = useRef(false);
  
  // Navigate to next trace - save first, then navigate
  const nextTrace = async () => {
    if (!currentTrace) {
      return;
    }
    
    // Use ref to prevent concurrent navigation (more reliable than React state)
    if (isNavigatingRef.current) {
      return;
    }
    
    // Debounce rapid clicks to prevent overwhelming the backend
    const now = Date.now();
    if (now - lastNavigationTimeRef.current < NAVIGATION_DEBOUNCE_MS) {
      return;
    }
    lastNavigationTimeRef.current = now;
    
    // Check if we can navigate
    if (currentTraceIndex >= traceData.length - 1) {
      return; // Already at last trace
    }
    
    // Set navigating flag immediately using ref (no state update = no flash)
    isNavigatingRef.current = true;
    
    try {
      // Store current trace data for save
      const currentTraceId = currentTrace.id;
      const q1ToSave = question1Response.trim();
      const q2ToSave = question2Response.trim();
      const hasContent = q1ToSave || q2ToSave;
      
      
      // Save FIRST if there's content (await to ensure it completes)
      if (hasContent) {
        await saveFinding(q1ToSave, q2ToSave, currentTraceId, true);
      }
      
      // Then navigate - pre-populate with saved state to avoid flash
      const nextIndex = currentTraceIndex + 1;
      const nextTraceId = traceData[nextIndex]?.id;
      const nextSavedState = nextTraceId ? savedStateRef.current.get(nextTraceId) : null;
      if (nextSavedState) {
        setQuestion1Response(nextSavedState.q1);
        setQuestion2Response(nextSavedState.q2);
      } else {
        setQuestion1Response('');
        setQuestion2Response('');
      }
      // Update ref so the useEffect doesn't re-trigger and cause a double render
      previousTraceId.current = nextTraceId || null;
      setCurrentTraceIndex(nextIndex);
      
    } finally {
      isNavigatingRef.current = false;
    }
  };

  const completeDiscovery = async () => {
    if (!user?.id || !workshopId) return;
    
    setIsCompletingDiscovery(true);
    try {
      const response = await fetch(`/workshops/${workshopId}/users/${user.id}/complete-discovery`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to mark discovery complete');
      }
      
      toast.success('Discovery complete', { description: 'Waiting for the facilitator to advance to the next phase.' });
    } catch (error) {

      toast.error('Could not complete discovery', { description: 'Please try again.' });
    } finally {
      setIsCompletingDiscovery(false);
    }
  };

  const handleRefresh = async () => {
    if (workshopId) {
      refetchAllWorkshopQueries(queryClient, workshopId);
    }
  };

  // Navigate to previous trace - save first, then navigate
  const prevTrace = async () => {
    if (!currentTrace) {
      return;
    }
    
    // Use ref to prevent concurrent navigation (more reliable than React state)
    if (isNavigatingRef.current) {
      return;
    }
    
    // Debounce rapid clicks to prevent overwhelming the backend
    const now = Date.now();
    if (now - lastNavigationTimeRef.current < NAVIGATION_DEBOUNCE_MS) {
      return;
    }
    lastNavigationTimeRef.current = now;
    
    // Check if we can navigate
    if (currentTraceIndex <= 0) {
      return; // Already at first trace
    }
    
    // Set navigating flag immediately using ref (no state update = no flash)
    isNavigatingRef.current = true;
    
    try {
      // Store current trace data for save
      const currentTraceId = currentTrace.id;
      const q1ToSave = question1Response.trim();
      const q2ToSave = question2Response.trim();
      const hasContent = q1ToSave || q2ToSave;
      
      
      // Save FIRST if there's content (await to ensure it completes)
      if (hasContent) {
        await saveFinding(q1ToSave, q2ToSave, currentTraceId, true);
      }
      
      // Then navigate - pre-populate with saved state to avoid flash
      const prevIndex = currentTraceIndex - 1;
      const prevTraceId = traceData[prevIndex]?.id;
      const prevSavedState = prevTraceId ? savedStateRef.current.get(prevTraceId) : null;
      if (prevSavedState) {
        setQuestion1Response(prevSavedState.q1);
        setQuestion2Response(prevSavedState.q2);
      } else {
        setQuestion1Response('');
        setQuestion2Response('');
      }
      // Update ref so the useEffect doesn't re-trigger and cause a double render
      previousTraceId.current = prevTraceId || null;
      setCurrentTraceIndex(prevIndex);
      
    } finally {
      isNavigatingRef.current = false;
    }
  };

  const handleSubmitFinding = async () => {
    if (!currentTrace || !question1Response.trim() || !question2Response.trim() || isSaving) return;

    // Use the saveFinding function to ensure consistent behavior and prevent concurrent saves
    await saveFinding(question1Response, question2Response, currentTrace.id);
  };

  // SECURITY: Block access if no valid user (prevent undefined user access)
  if (!user || !user.id) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <div className="text-lg font-medium text-gray-900 mb-2">
            Authentication Required
          </div>
          <div className="text-sm text-gray-500">
            You must be logged in to access discovery traces.
          </div>
        </div>
      </div>
    );
  }

  // Block access to traces until discovery phase starts
  if (currentPhase === 'intake') {
    if (isFacilitator) {
      // Facilitator pre-discovery control panel
      return (
        <div className="p-8">
          <div className="max-w-2xl mx-auto">
            <div className="text-center mb-8">
              <div className="w-16 h-16 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center mx-auto mb-4">
                <Settings className="h-8 w-8 text-white" />
              </div>
              <h2 className="text-2xl font-bold text-slate-900 mb-2">Ready to Begin Discovery</h2>
              <p className="text-slate-600">
                Start the discovery phase to distribute traces to all participants for analysis
              </p>
            </div>
            
            <div className="bg-slate-50 rounded-xl p-6 mb-6">
              <h3 className="font-semibold text-slate-900 mb-3">Workshop Status</h3>
              <div className="space-y-2 text-sm text-slate-600">
                <div>📊 <strong>Traces ready:</strong> {traceData.length} traces loaded</div>
                <div>👥 <strong>Phase:</strong> Pre-discovery (Intake)</div>
                <div>🎯 <strong>Next step:</strong> Begin discovery phase</div>
              </div>
            </div>
            
            <Button 
              onClick={async () => {
                try {
                  await WorkshopsService.beginDiscoveryPhaseWorkshopsWorkshopIdBeginDiscoveryPost(workshopId!);
                  // Refresh the page to show updated phase
                  window.location.reload();
                } catch (error) {
                  
                  toast.error('Could not start discovery', { description: 'Please try again.' });
                }
              }}
              className="w-full bg-gradient-to-r from-indigo-500 to-purple-600 hover:from-indigo-600 hover:to-purple-700 text-white py-3 rounded-xl font-medium"
            >
              🚀 Start Discovery Phase
            </Button>
            
            <p className="text-xs text-slate-500 text-center mt-4">
              This will allow all participants to begin exploring traces and providing insights
            </p>
          </div>
        </div>
      );
    } else {
      // Non-facilitator waiting screen
      return (
        <div className="p-8 flex items-center justify-center h-full">
          <div className="text-center">
            <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
            <div className="text-lg font-medium text-slate-900 mb-2">
              Discovery Phase Not Started
            </div>
            <div className="text-sm text-slate-600">
              The facilitator will begin the discovery phase shortly
            </div>
          </div>
        </div>
      );
    }
  }

  if (tracesLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium text-gray-600 mb-2">Loading traces...</div>
          <div className="text-sm text-gray-500">Fetching workshop data from API</div>
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

  // Comment out auto-complete screen - let facilitator control phase progression
  // if (isDiscoveryComplete) {
  //   return (
  //     <div className="p-6">
  //       <div className="max-w-4xl mx-auto space-y-6">
  //         <Card className="bg-green-50 border-green-200">
  //           <CardContent className="pt-6">
  //             <div className="text-center">
  //               <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
  //               <h2 className="text-2xl font-bold text-green-800 mb-2">Discovery Phase Complete!</h2>
  //               <p className="text-green-700 mb-4">
  //                 You've successfully reviewed all {traceData.length} traces and submitted findings for each one.
  //               </p>
  //               <div className="bg-white rounded-lg p-4 mb-4">
  //                 <div className="text-sm text-gray-600">
  //                   <strong>Next Step:</strong> Proceed to the Rubric Creation phase where you'll create evaluation criteria based on your findings.
  //                 </div>
  //               </div>
  //               <Badge className="bg-green-500 text-white">
  //                 {submittedFindings.size}/{traceData.length} Findings Submitted
  //               </Badge>
  //             </div>
  //           </CardContent>
  //         </Card>
  //       </div>
  //     </div>
  //   );
  // }

  return (
    <div className="p-6 h-full flex flex-col">
      <div className="max-w-7xl mx-auto w-full flex flex-col flex-1 min-h-0 gap-6">
        {/* Compact Progress Bar */}
        <div className="flex items-center gap-4 px-1 flex-shrink-0" data-testid="discovery-phase-title">
          <div className="flex items-center gap-2 min-w-0">
            <span className="text-sm font-medium text-gray-700 whitespace-nowrap">
              Trace <span data-testid="trace-number">{currentTraceIndex + 1}/{traceData.length}</span>
            </span>
            {submittedFindings.has(currentTrace.id) && (
              <CheckCircle className="h-4 w-4 text-green-500 flex-shrink-0" />
            )}
          </div>
          <div className="flex-1 flex items-center gap-2">
            <div className="flex-1 bg-gray-200 rounded-full h-1.5">
              <div
                className={`h-1.5 rounded-full transition-all duration-300 ${isDiscoveryComplete ? 'bg-green-500' : 'bg-blue-500'}`}
                style={{ width: `${(submittedFindings.size / traceData.length) * 100}%` }}
              />
            </div>
            <span className="text-xs text-gray-500 whitespace-nowrap">{submittedFindings.size}/{traceData.length}</span>
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

        {/* Side-by-side: Trace (left 60%) + Questions (right 40%) */}
        <div className="grid grid-cols-1 lg:grid-cols-[3fr_2fr] gap-6 flex-1 min-h-0">
          {/* Left Column: Trace - independently scrollable */}
          <div className="overflow-y-auto pr-2 scrollbar-thin">
            <TraceViewer trace={currentTrace} />
          </div>

          {/* Right Column: Questions + Navigation + Notes - independently scrollable */}
          <div className="overflow-y-auto space-y-4 pr-1 scrollbar-thin">
        {/* Discovery Questions */}
        <Card className="border-l-4 border-blue-500">
          <CardContent className="p-4 space-y-4">
            <div>
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-1">
                <Lightbulb className="w-4 h-4 text-blue-600" />
                Discovery Questions
              </h3>
              {!canCreateFindings && (
                <p className="text-xs text-red-600 flex items-center gap-1.5 mt-2">
                  <AlertCircle className="h-3.5 w-3.5" />
                  You don't have permission to submit findings. You can view traces but cannot contribute insights.
                </p>
              )}
            </div>

            <div className="space-y-2">
              <Label htmlFor="question1" className="text-xs font-medium text-gray-600">
                What makes this response effective or ineffective?
              </Label>
              <Textarea
                id="question1"
                placeholder={canCreateFindings ? "Share your thoughts on what makes this response work well or poorly..." : "You don't have permission to submit findings"}
                value={question1Response}
                onChange={(e) => setQuestion1Response(e.target.value)}
                className="min-h-[100px]"
                disabled={!canCreateFindings || isSaving}
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="question2" className="text-xs font-medium text-gray-600">
                If this response was good, what would have made it bad? If bad, what would have made it good?
              </Label>
              <Textarea
                id="question2"
                placeholder={canCreateFindings ? "Consider alternative scenarios - what changes would flip the quality of this response?" : "You don't have permission to submit findings"}
                value={question2Response}
                onChange={(e) => setQuestion2Response(e.target.value)}
                className="min-h-[100px]"
                disabled={!canCreateFindings || isSaving}
              />
            </div>

          </CardContent>
        </Card>

        {/* Navigation */}
        <div className="flex items-center justify-between">
          <Button
            variant="outline"
            onClick={prevTrace}
            disabled={currentTraceIndex === 0}
            className="flex items-center gap-1.5"
          >
            <ChevronLeft className="h-4 w-4" />
            Previous
          </Button>

          <Button
            onClick={async () => {
              // On last trace, save current content then show completion state
              if (currentTraceIndex === traceData.length - 1 && currentTrace) {
                const q1 = question1Response.trim();
                const q2 = question2Response.trim();
                if (q1 || q2) {
                  setIsSaving(true);
                  const success = await saveFinding(q1, q2, currentTrace.id, false);
                  setIsSaving(false);
                  if (success) {
                    toast.success('Response saved', { description: 'Your finding has been recorded.' });
                  }
                }
              } else {
                nextTrace();
              }
            }}
            disabled={
              isSaving ||
              !canCreateFindings
            }
            className={`flex items-center gap-1.5 ${currentTraceIndex === traceData.length - 1 ? 'bg-purple-700 hover:bg-purple-800' : ''}`}
          >
            {isSaving ? (
              <>
                <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                Saving...
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

        {/* Participant Notepad - only shown when facilitator enables it */}
        {notesEnabled && <Card>
          <CardContent className="p-4 space-y-3">
            <div className="flex items-center gap-2">
              <NotebookPen className="w-3.5 h-3.5 text-purple-600 flex-shrink-0" />
              <span className="text-sm font-semibold text-gray-900">My Notes</span>
              {participantNotes && participantNotes.length > 0 && (
                <Badge variant="secondary" className="bg-purple-50 text-purple-700 border border-purple-200 text-[10px] h-4 px-1.5">
                  {participantNotes.length}
                </Badge>
              )}
              <span className="text-[11px] text-gray-400">— Share observations with the facilitator</span>
          </div>
            {/* Add note input */}
            <div className="flex gap-2">
              <Textarea
                placeholder="Write a note about this trace or any general observation..."
                value={noteContent}
                onChange={(e) => setNoteContent(e.target.value)}
                className="min-h-[60px] flex-1 border-purple-200 focus:border-purple-400"
                disabled={!canCreateFindings}
              />
            </div>
            <Button
              size="sm"
              onClick={async () => {
                if (!noteContent.trim() || !user?.id) return;
                try {
                  await submitNote.mutateAsync({
                    user_id: user.id,
                    trace_id: currentTrace?.id || null,
                    content: noteContent.trim(),
                    phase: 'discovery',
                  });
                  setNoteContent('');
                  toast.success('Note saved', { description: 'Your observation has been recorded.' });
                } catch (error) {
                  toast.error('Could not save note', { description: 'Please try again.' });
                }
              }}
              disabled={!noteContent.trim() || !canCreateFindings || submitNote.isPending}
              className="bg-purple-600 hover:bg-purple-700 text-white h-7 text-xs"
            >
              {submitNote.isPending ? (
                <>
                  <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1" />
                  Saving...
                </>
              ) : (
                <>
                  <NotebookPen className="h-3 w-3 mr-1" />
                  Add Note
                </>
              )}
            </Button>

            {/* Existing notes */}
            {participantNotes && participantNotes.length > 0 && (
              <div className="space-y-2 pt-2 border-t border-purple-100">
                <span className="text-xs font-medium text-purple-600 uppercase tracking-wider">Your Notes</span>
                {participantNotes.map((note) => (
                  <div
                    key={note.id}
                    className={`flex items-start justify-between gap-2 p-3 rounded-lg border ${
                      note.trace_id === currentTrace?.id
                        ? 'bg-purple-50 border-purple-200'
                        : 'bg-gray-50 border-gray-200'
                    }`}
                  >
                    <div className="flex-1 min-w-0">
                      <p className="text-sm text-gray-800 whitespace-pre-wrap">{note.content}</p>
                      <div className="flex items-center gap-2 mt-1">
                        {note.trace_id && (
                          <span className="text-xs text-purple-600">
                            On trace {traceData.findIndex(t => t.id === note.trace_id) + 1 || '?'}
                          </span>
                        )}
                        <span className="text-xs text-gray-400">
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
                        } catch (error) {
                          toast.error('Could not delete note', { description: 'Please try again.' });
                        }
                      }}
                      className="text-red-400 hover:text-red-600 h-6 w-6 p-0 flex-shrink-0"
                    >
                      <Trash2 className="h-3 w-3" />
                    </Button>
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        </Card>}

        {/* Discovery Completion */}
        {isDiscoveryComplete && (
          <div className="flex items-center justify-between p-3 rounded-lg border border-green-200 bg-green-50">
            <div className="flex items-center gap-2">
              <CheckCircle className="h-4 w-4 text-green-600 flex-shrink-0" />
              <span className="text-sm font-medium text-green-800">
                All {traceData.length} traces reviewed
              </span>
            </div>
            <Button
              onClick={completeDiscovery}
              disabled={isCompletingDiscovery}
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
            >
              {isCompletingDiscovery ? (
                <>
                  <div className="w-3.5 h-3.5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-1.5" />
                  Completing...
                </>
              ) : (
                <span data-testid="complete-discovery-phase-button">Complete Discovery</span>
              )}
            </Button>
          </div>
        )}
          </div>{/* End right column */}
        </div>{/* End grid */}
      </div>
    </div>
  );
}