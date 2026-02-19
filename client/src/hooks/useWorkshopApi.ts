/**
 * React Query hooks for workshop API operations
 */

import { useQuery, useMutation, useQueryClient, QueryClient } from '@tanstack/react-query';
import type { Query } from '@tanstack/react-query';
import { WorkshopsService, ApiError } from '@/client';
import { useRoleCheck } from '@/context/UserContext';
import type { User } from '@/context/UserContext';
import type {
  Workshop,
  WorkshopCreate,
  Trace,
  TraceUpload,
  DiscoveryFinding,
  DiscoveryFindingCreate,
  Rubric,
  RubricCreate,
  Annotation,
  AnnotationCreate,
  IRRResult,
  MLflowIntakeConfig
} from '@/client';

// Query keys
const QUERY_KEYS = {
  workshops: () => ['workshops'],
  workshopsForUser: (userId: string) => ['workshops', 'user', userId],
  workshop: (id: string) => ['workshop', id],
  traces: (workshopId: string) => ['traces', workshopId],
  findings: (workshopId: string, userId?: string) => ['findings', workshopId, userId],
  rubric: (workshopId: string) => ['rubric', workshopId],
  annotations: (workshopId: string, userId?: string) => ['annotations', workshopId, userId],
  irr: (workshopId: string) => ['irr', workshopId],
  mlflowConfig: (workshopId: string) => ['mlflowConfig', workshopId],
  discoveryAnalyses: (workshopId: string) => ['discovery-analyses', workshopId],
};

// Helper function to invalidate all workshop-related queries
export function invalidateAllWorkshopQueries(queryClient: QueryClient, workshopId: string) {
  // Invalidate all queries that start with the workshop ID
  queryClient.invalidateQueries({
    predicate: (query: Query) => {
      const queryKey = query.queryKey;
      return queryKey && (
        queryKey.includes(workshopId) ||
        queryKey.includes('workshop') ||
        queryKey.includes('findings') ||
        queryKey.includes('annotations') ||
        queryKey.includes('irr')
      );
    }
  });
}

// Helper function to force refetch all workshop-related queries
export function refetchAllWorkshopQueries(queryClient: QueryClient, workshopId: string) {
  // Refetch all queries that start with the workshop ID
  queryClient.refetchQueries({
    predicate: (query: Query) => {
      const queryKey = query.queryKey;
      return queryKey && (
        queryKey.includes(workshopId) ||
        queryKey.includes('workshop') ||
        queryKey.includes('findings') ||
        queryKey.includes('annotations') ||
        queryKey.includes('irr')
      );
    }
  });
}

// Workshop hooks

// Custom API call for listing workshops (not in generated client)
async function listWorkshopsApi(userId?: string, facilitatorId?: string): Promise<Workshop[]> {
  const params = new URLSearchParams();
  if (userId) params.append('user_id', userId);
  if (facilitatorId) params.append('facilitator_id', facilitatorId);
  
  const queryString = params.toString();
  const url = `/workshops/${queryString ? `?${queryString}` : ''}`;
  
  const response = await fetch(url);
  if (!response.ok) {
    throw new Error(`Failed to list workshops: ${response.statusText}`);
  }
  return response.json();
}

export function useListWorkshops(options?: { userId?: string; facilitatorId?: string; enabled?: boolean }) {
  const { userId, facilitatorId, enabled = true } = options || {};
  
  return useQuery({
    queryKey: ['workshops', userId, facilitatorId],
    queryFn: () => listWorkshopsApi(userId, facilitatorId),
    enabled,
    staleTime: 30000, // Consider data stale after 30 seconds
    refetchOnMount: true,
    refetchOnWindowFocus: true,
  });
}

export function useWorkshop(workshopId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.workshop(workshopId),
    queryFn: () => WorkshopsService.getWorkshopWorkshopsWorkshopIdGet(workshopId),
    enabled: !!workshopId,
    staleTime: 10000, // Consider data stale after 10 seconds
    refetchInterval: 30000, // Refetch every 30 seconds (was 10s — too aggressive for Databricks Apps)
    refetchOnMount: true, // Always refetch on component mount to get latest traces
    refetchIntervalInBackground: false, // Don't refetch when window is not focused
    refetchOnWindowFocus: true,
    retry: (failureCount, error) => {
      // Don't retry on 404 errors - workshop doesn't exist
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        return false;
      }
      // Don't retry on 503 - backend is restarting, polling will pick it up
      if (error && typeof error === 'object' && 'status' in error && error.status === 503) {
        return false;
      }
      // Retry other errors up to 2 times
      return failureCount < 2;
    },
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 10000),
  });
}

export function useCreateWorkshop() {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (data: WorkshopCreate) => 
      WorkshopsService.createWorkshopWorkshopsPost(data),
    onSuccess: (workshop) => {
      queryClient.setQueryData(QUERY_KEYS.workshop(workshop.id), workshop);
    },
  });
}

// Trace hooks
export function useTraces(workshopId: string, userId: string) {
  return useQuery({
    queryKey: ['traces', workshopId, userId],
    queryFn: async () => {
      if (!userId) {
        throw new Error('user_id is required for fetching traces');
      }
      const url = `/workshops/${workshopId}/traces?user_id=${encodeURIComponent(userId)}`;
      const response = await fetch(url);
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to fetch traces' }));
        throw new Error(error.detail || 'Failed to fetch traces');
      }
      return response.json();
    },
    enabled: !!workshopId && !!userId,
    // Balanced settings for real-time updates without causing performance issues
    staleTime: 10 * 1000, // Data is fresh for 10 seconds
    gcTime: 5 * 60 * 1000, // Cache for 5 minutes
    retry: 3, // Retry failed requests 3 times
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000), // Exponential backoff
    refetchOnWindowFocus: true, // Refetch when user returns to tab
    refetchOnMount: true, // Refetch on component mount to get latest traces
    refetchInterval: 30 * 1000, // Poll every 30 seconds to pick up new traces added by facilitator
  });
}

export function useAllTraces(workshopId: string) {
  return useQuery({
    queryKey: ['all-traces', workshopId],
    queryFn: async () => {
      const response = await fetch(`/workshops/${workshopId}/all-traces`);
      if (!response.ok) {
        throw new Error('Failed to fetch all traces');
      }
      return response.json();
    },
    enabled: !!workshopId,
    // Optimized caching for better performance
    staleTime: 30 * 1000, // Data is fresh for 30 seconds
    gcTime: 10 * 60 * 1000, // Cache for 10 minutes
    retry: 3,
    retryDelay: (attemptIndex) => Math.min(1000 * 2 ** attemptIndex, 30000),
    refetchOnWindowFocus: false,
    refetchOnMount: false,
  });
}

export function useOriginalTraces(workshopId: string) {
  return useQuery({
    queryKey: ['original-traces', workshopId],
    queryFn: async () => {
      // Get original traces by calling the database service directly
      // This avoids the user_id requirement and returns only the intake traces
      const response = await fetch(`/workshops/${workshopId}/original-traces`);
      if (!response.ok) {
        throw new Error('Failed to fetch original traces');
      }
      return response.json();
    },
    enabled: !!workshopId,
    staleTime: 0, // Data is considered stale immediately
    gcTime: 5 * 60 * 1000, // Cache for 5 minutes
  });
}

// Utility function to invalidate trace caches
export function useInvalidateTraces() {
  const queryClient = useQueryClient();
  
  return () => {
    queryClient.invalidateQueries({ queryKey: ['traces'] });
    queryClient.invalidateQueries({ queryKey: ['all-traces'] });
  };
}

// Discovery findings hooks
export function useFindings(workshopId: string, userId?: string) {
  return useQuery({
    queryKey: QUERY_KEYS.findings(workshopId, userId),
    queryFn: () => WorkshopsService.getFindingsWorkshopsWorkshopIdFindingsGet(workshopId, userId),
    enabled: !!workshopId,
  });
}

// User-aware findings hook - ALWAYS returns only user's own findings for personal progress
export function useUserFindings(workshopId: string, user: Pick<User, 'id'> | null) {
  return useQuery({
    queryKey: QUERY_KEYS.findings(workshopId, user?.id),
    queryFn: () => WorkshopsService.getFindingsWorkshopsWorkshopIdFindingsGet(
      workshopId, 
      user?.id  // EVERYONE (including facilitators) gets only their own findings for personal progress
    ),
    enabled: !!workshopId && !!user?.id, // REQUIRE user to be logged in
    staleTime: 30 * 1000, // Data is fresh for 30 seconds  
    refetchInterval: false, // DISABLED: Was causing Chrome hangs with excessive refetching
    refetchOnWindowFocus: false, // Disabled to prevent excessive refetching
  });
}

// Facilitator overview hook - gets ALL findings for workshop management
export function useFacilitatorFindings(workshopId: string) {
  const { isFacilitator } = useRoleCheck();
  
  return useQuery({
    queryKey: QUERY_KEYS.findings(workshopId, 'all_findings'),
    queryFn: () => WorkshopsService.getFindingsWorkshopsWorkshopIdFindingsGet(
      workshopId, 
      undefined  // No user filter - gets ALL findings
    ),
    enabled: !!workshopId && isFacilitator, // Only for facilitators
  });
}

// Facilitator overview hook - gets ALL findings with user details for workshop management
export function useFacilitatorFindingsWithUserDetails(workshopId: string) {
  const { isFacilitator } = useRoleCheck();
  
  return useQuery({
    queryKey: [...QUERY_KEYS.findings(workshopId, 'all_findings'), 'with_user_details'],
    queryFn: () => WorkshopsService.getFindingsWithUserDetailsWorkshopsWorkshopIdFindingsWithUsersGet(
      workshopId, 
      undefined  // No user filter - gets ALL findings with user details
    ),
    enabled: !!workshopId && isFacilitator, // Only for facilitators
  });
}

export function useSubmitFinding(workshopId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (finding: DiscoveryFindingCreate) =>
      WorkshopsService.submitFindingWorkshopsWorkshopIdFindingsPost(workshopId, finding),
    // Retry on server errors (503 Service Unavailable due to database contention, or 500)
    retry: (failureCount, error: Error) => {
      const status = error instanceof ApiError ? error.status : undefined;
      if (status === 503 || status === 500) {
        return failureCount < 5;
      }
      return false;
    },
    retryDelay: (attemptIndex) => {
      const baseDelay = Math.min(1000 * Math.pow(2, attemptIndex), 16000);
      const jitter = Math.random() * 1000;
      return baseDelay + jitter;
    },
    onMutate: async (newFinding) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['findings', workshopId, newFinding.user_id] });
      
      // Snapshot the previous value
      const previousFindings = queryClient.getQueryData(['findings', workshopId, newFinding.user_id]);
      
      // Optimistically update the cache - handle both new and update cases
      queryClient.setQueryData<DiscoveryFinding[]>(['findings', workshopId, newFinding.user_id], (old) => {
        const optimisticFinding: DiscoveryFinding = {
          id: `temp-${Date.now()}`,
          workshop_id: workshopId,
          trace_id: newFinding.trace_id,
          user_id: newFinding.user_id,
          insight: newFinding.insight,
          created_at: new Date().toISOString(),
        };

        if (!old) return [optimisticFinding];

        // Check if finding for this trace already exists (update case)
        const existingIndex = old.findIndex((f) => f.trace_id === newFinding.trace_id);
        if (existingIndex >= 0) {
          // Replace existing finding with updated one
          const updated = [...old];
          updated[existingIndex] = { ...updated[existingIndex], insight: newFinding.insight };
          return updated;
        }

        // New finding
        return [...old, optimisticFinding];
      });
      
      return { previousFindings };
    },
    onError: (err, newFinding, context) => {
      // Rollback on error
      if (context?.previousFindings) {
        queryClient.setQueryData(['findings', workshopId, newFinding.user_id], context.previousFindings);
      }
    },
    onSuccess: (data, finding) => {
      // Update cache with actual server response
      queryClient.setQueryData<DiscoveryFinding[]>(['findings', workshopId, finding.user_id], (old) => {
        if (!old) return [data];

        // Replace temp or existing finding with actual server data
        const existingIndex = old.findIndex((f) =>
          f.trace_id === finding.trace_id || f.id?.startsWith('temp-')
        );
        if (existingIndex >= 0) {
          const updated = [...old];
          updated[existingIndex] = data;
          return updated;
        }
        return [...old, data];
      });
      
      // Invalidate related queries
      queryClient.invalidateQueries({ queryKey: ['discovery-completion-status', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['user-discovery-complete', workshopId, finding.user_id] });
      
      // Invalidate facilitator findings queries so they see new findings in Discovery Responses
      queryClient.invalidateQueries({ queryKey: ['findings', workshopId, 'all_findings'] });
      queryClient.invalidateQueries({ queryKey: ['findings', workshopId, 'all_findings', 'with_user_details'] });
      // Also invalidate the direct endpoint query used in FindingsReviewPage
      queryClient.invalidateQueries({ queryKey: ['facilitator-findings-with-users', workshopId] });
    },
  });
}

// Rubric hooks
export function useRubric(workshopId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.rubric(workshopId),
    queryFn: async () => {
      try {
        return await WorkshopsService.getRubricWorkshopsWorkshopIdRubricGet(workshopId);
      } catch (error) {
        // If rubric doesn't exist (404), return null instead of throwing
        if (error instanceof ApiError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled: !!workshopId,
  });
}

export function useCreateRubric(workshopId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (rubric: RubricCreate) => 
      WorkshopsService.createRubricWorkshopsWorkshopIdRubricPost(workshopId, rubric),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rubric(workshopId) });
    },
  });
}

export function useUpdateRubric(workshopId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (rubric: RubricCreate) => 
      WorkshopsService.updateRubricWorkshopsWorkshopIdRubricPut(workshopId, rubric),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.rubric(workshopId) });
    },
  });
}

// Annotation hooks
// User-aware annotations hook - ALWAYS returns only user's own annotations
export function useUserAnnotations(workshopId: string, user: Pick<User, 'id'> | null) {
  return useQuery({
    queryKey: QUERY_KEYS.annotations(workshopId, user?.id),
    queryFn: () => {
      
      return WorkshopsService.getAnnotationsWorkshopsWorkshopIdAnnotationsGet(
        workshopId, 
        user?.id  // EVERYONE gets only their own annotations
      );
    },
    enabled: !!workshopId && !!user?.id, // REQUIRE user to be logged in
    staleTime: 10 * 1000, // Short stale time so navigation picks up recently saved scores
    refetchInterval: false, // Disable automatic refetching to avoid issues
    retry: 3, // Retry failed requests 3 times
  });
}

// Facilitator overview hook - gets ALL annotations for workshop management  
export function useFacilitatorAnnotations(workshopId: string) {
  const { isFacilitator } = useRoleCheck();
  
  return useQuery({
    queryKey: QUERY_KEYS.annotations(workshopId, 'all_annotations'),
    queryFn: () => WorkshopsService.getAnnotationsWorkshopsWorkshopIdAnnotationsGet(
      workshopId, 
      undefined  // No user filter - gets ALL annotations
    ),
    enabled: !!workshopId && isFacilitator, // Only for facilitators
  });
}

// Facilitator annotations with user details hook - gets ALL annotations with user names for IRR analysis
export function useFacilitatorAnnotationsWithUserDetails(workshopId: string) {
  const { isFacilitator } = useRoleCheck();
  
  return useQuery({
    queryKey: [...QUERY_KEYS.annotations(workshopId, 'all_annotations'), 'with_user_details'],
    queryFn: async () => {
      const response = await fetch(`/workshops/${workshopId}/annotations-with-users`);
      if (!response.ok) throw new Error('Failed to fetch annotations with user details');
      return response.json();
    },
    enabled: !!workshopId && isFacilitator, // Only for facilitators
  });
}

// Legacy hook - kept for backward compatibility, but use user-specific hooks instead
export function useAnnotations(workshopId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.annotations(workshopId),
    queryFn: () => WorkshopsService.getAnnotationsWorkshopsWorkshopIdAnnotationsGet(workshopId),
    enabled: !!workshopId,
  });
}

export function useSubmitAnnotation(workshopId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (annotation: AnnotationCreate) =>
      WorkshopsService.submitAnnotationWorkshopsWorkshopIdAnnotationsPost(workshopId, annotation),
    // Retry on server errors (503 Service Unavailable due to SQLite lock contention)
    retry: (failureCount, error: Error) => {
      // Retry up to 5 times on 503 (database busy) or 500 errors
      const status = error instanceof ApiError ? error.status : undefined;
      if (status === 503 || status === 500) {
        return failureCount < 5;
      }
      // Don't retry on other errors (400, 401, 404, etc.)
      return false;
    },
    retryDelay: (attemptIndex) => {
      // Exponential backoff with jitter: 1s, 2s, 4s, 8s, 16s (max)
      const baseDelay = Math.min(1000 * Math.pow(2, attemptIndex), 16000);
      const jitter = Math.random() * 1000; // Add 0-1s random jitter
      return baseDelay + jitter;
    },
    onMutate: async (newAnnotation) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['annotations', workshopId, newAnnotation.user_id] });
      
      // Snapshot the previous value
      const previousAnnotations = queryClient.getQueryData(['annotations', workshopId, newAnnotation.user_id]);
      
      // Optimistically update the cache
      queryClient.setQueryData<Annotation[]>(['annotations', workshopId, newAnnotation.user_id], (old) => {
        const optimisticAnnotation: Annotation = {
          id: `temp-${Date.now()}`,
          workshop_id: workshopId,
          trace_id: newAnnotation.trace_id,
          user_id: newAnnotation.user_id,
          rating: newAnnotation.rating,
          ratings: newAnnotation.ratings,
          comment: newAnnotation.comment,
          created_at: new Date().toISOString(),
        };
        if (!old) return [optimisticAnnotation];
        // Update existing annotation for this trace instead of appending a duplicate
        const existingIndex = old.findIndex(
          (a) => a.trace_id === newAnnotation.trace_id && a.user_id === newAnnotation.user_id
        );
        if (existingIndex >= 0) {
          const updated = [...old];
          updated[existingIndex] = { ...updated[existingIndex], ...optimisticAnnotation };
          return updated;
        }
        return [...old, optimisticAnnotation];
      });
      
      return { previousAnnotations };
    },
    onError: (err, newAnnotation, context) => {
      // Rollback on error
      if (context?.previousAnnotations) {
        queryClient.setQueryData(['annotations', workshopId, newAnnotation.user_id], context.previousAnnotations);
      }
    },
    onSuccess: (_, annotation) => {
      // Only invalidate THIS USER's annotation queries, not all users
      queryClient.invalidateQueries({ queryKey: ['annotations', workshopId, annotation.user_id] });
      
      // Invalidate workshop-level queries that don't include user-specific data
      queryClient.invalidateQueries({ queryKey: ['workshop', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['irr', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['findings', workshopId] });
      
      // Force immediate refetch for this user's annotations only
      queryClient.refetchQueries({ queryKey: ['annotations', workshopId, annotation.user_id] });
    },
  });
}

// IRR hooks
export function useIRR(workshopId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.irr(workshopId),
    queryFn: () => WorkshopsService.getIrrWorkshopsWorkshopIdIrrGet(workshopId),
    enabled: !!workshopId,
  });
}

// MLflow configuration hooks
export function useMLflowConfig(workshopId: string) {
  return useQuery({
    queryKey: QUERY_KEYS.mlflowConfig(workshopId),
    queryFn: async () => {
      try {
        return await WorkshopsService.getMlflowConfigWorkshopsWorkshopIdMlflowConfigGet(workshopId);
      } catch (error) {
        // If MLflow config doesn't exist (404), return null instead of throwing
        if (error instanceof ApiError && error.status === 404) {
          return null;
        }
        throw error;
      }
    },
    enabled: !!workshopId,
  });
}

// Trace alignment hooks
export function useUpdateTraceAlignment(workshopId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: async ({ traceId, includeInAlignment }: { traceId: string; includeInAlignment: boolean }) => {
      const response = await fetch(
        `/workshops/${workshopId}/traces/${traceId}/alignment?include_in_alignment=${includeInAlignment}`,
        { method: 'PATCH' }
      );
      if (!response.ok) {
        throw new Error('Failed to update trace alignment');
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate traces and alignment-related queries
      queryClient.invalidateQueries({ queryKey: ['traces', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['traces-for-alignment', workshopId] });
    },
  });
}

export function useAggregateAllFeedback(workshopId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`/workshops/${workshopId}/aggregate-all-feedback`, { method: 'POST' });
      if (!response.ok) {
        throw new Error('Failed to aggregate feedback');
      }
      return response.json();
    },
    onSuccess: () => {
      // Invalidate traces to reflect updated sme_feedback
      queryClient.invalidateQueries({ queryKey: ['traces', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['traces-for-alignment', workshopId] });
    },
  });
}

// Toggle participant notes visibility
export function useToggleParticipantNotes(workshopId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async () => {
      const response = await fetch(`/workshops/${workshopId}/toggle-participant-notes`, {
        method: 'PUT',
      });
      if (!response.ok) {
        throw new Error('Failed to toggle participant notes');
      }
      return response.json();
    },
    onSuccess: (workshop) => {
      queryClient.setQueryData(QUERY_KEYS.workshop(workshopId), workshop);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.workshop(workshopId) });
    },
  });
}

// Participant Notes hooks

export interface ParticipantNote {
  id: string;
  workshop_id: string;
  user_id: string;
  trace_id?: string | null;
  content: string;
  phase?: string; // 'discovery' or 'annotation'
  user_name?: string | null;
  created_at: string;
  updated_at: string;
}

interface ParticipantNoteCreate {
  user_id: string;
  trace_id?: string | null;
  content: string;
  phase?: string; // 'discovery' or 'annotation'
}

export function useParticipantNotes(workshopId: string, userId?: string, phase?: string) {
  return useQuery<ParticipantNote[]>({
    queryKey: ['participant-notes', workshopId, userId, phase],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (userId) params.append('user_id', userId);
      if (phase) params.append('phase', phase);
      const queryString = params.toString();
      const url = `/workshops/${workshopId}/participant-notes${queryString ? `?${queryString}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch participant notes');
      }
      return response.json();
    },
    enabled: !!workshopId,
    staleTime: 10 * 1000,
    refetchInterval: 30 * 1000, // Poll for new notes from other participants
  });
}

export function useAllParticipantNotes(workshopId: string, phase?: string) {
  return useQuery<ParticipantNote[]>({
    queryKey: ['participant-notes', workshopId, 'all', phase],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (phase) params.append('phase', phase);
      const queryString = params.toString();
      const url = `/workshops/${workshopId}/participant-notes${queryString ? `?${queryString}` : ''}`;
      const response = await fetch(url);
      if (!response.ok) {
        throw new Error('Failed to fetch participant notes');
      }
      return response.json();
    },
    enabled: !!workshopId,
    staleTime: 5 * 1000,
    refetchInterval: 15 * 1000, // Poll so facilitator sees notes (was 5s, too aggressive for Databricks Apps)
  });
}

export function useSubmitParticipantNote(workshopId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (note: ParticipantNoteCreate) => {
      const response = await fetch(`/workshops/${workshopId}/participant-notes`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(note),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to save note' }));
        throw new Error(error.detail || 'Failed to save note');
      }
      return response.json();
    },
    onSuccess: (_, note) => {
      queryClient.invalidateQueries({ queryKey: ['participant-notes', workshopId] });
    },
  });
}

export function useDeleteParticipantNote(workshopId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (noteId: string) => {
      const response = await fetch(`/workshops/${workshopId}/participant-notes/${noteId}`, {
        method: 'DELETE',
      });
      if (!response.ok) {
        throw new Error('Failed to delete note');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['participant-notes', workshopId] });
    },
  });
}

// JSONPath Settings hooks

interface JsonPathSettings {
  input_jsonpath?: string | null;
  output_jsonpath?: string | null;
}

interface JsonPathPreviewResult {
  trace_id?: string;
  input_result?: string;
  input_success?: boolean;
  output_result?: string;
  output_success?: boolean;
  error?: string;
}

export function useUpdateJsonPathSettings(workshopId: string) {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: async (settings: JsonPathSettings): Promise<Workshop> => {
      const response = await fetch(`/workshops/${workshopId}/jsonpath-settings`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to update JSONPath settings' }));
        throw new Error(error.detail || 'Failed to update JSONPath settings');
      }
      return response.json();
    },
    onSuccess: (workshop) => {
      // Update workshop cache with new settings
      queryClient.setQueryData(QUERY_KEYS.workshop(workshopId), workshop);
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.workshop(workshopId) });
    },
  });
}

export function usePreviewJsonPath(workshopId: string) {
  return useMutation({
    mutationFn: async (settings: JsonPathSettings): Promise<JsonPathPreviewResult> => {
      const response = await fetch(`/workshops/${workshopId}/preview-jsonpath`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(settings),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Failed to preview JSONPath' }));
        throw new Error(error.detail || 'Failed to preview JSONPath');
      }
      return response.json();
    },
  });
}

// Discovery Analysis hooks (Step 2)

export interface DiscoveryAnalysis {
  id: string;
  workshop_id: string;
  template_used: string;
  analysis_data: string;
  findings: Array<{ text: string; evidence_trace_ids: string[]; priority: string }>;
  disagreements: {
    high: Array<{
      trace_id: string;
      summary: string;
      underlying_theme: string;
      followup_questions: string[];
      facilitator_suggestions: string[];
    }>;
    medium: Array<{
      trace_id: string;
      summary: string;
      underlying_theme: string;
      followup_questions: string[];
      facilitator_suggestions: string[];
    }>;
    lower: Array<{
      trace_id: string;
      summary: string;
      underlying_theme: string;
      followup_questions: string[];
      facilitator_suggestions: string[];
    }>;
  };
  participant_count: number;
  model_used: string;
  created_at: string;
  updated_at: string;
}

export function useDiscoveryAnalyses(workshopId: string, template?: string) {
  return useQuery<DiscoveryAnalysis[]>({
    queryKey: [...QUERY_KEYS.discoveryAnalyses(workshopId), template],
    queryFn: async () => {
      const params = template ? `?template=${encodeURIComponent(template)}` : '';
      const response = await fetch(`/workshops/${workshopId}/discovery-analysis${params}`);
      if (!response.ok) {
        throw new Error('Failed to fetch discovery analyses');
      }
      return response.json();
    },
    enabled: !!workshopId,
    staleTime: 30 * 1000,
  });
}

export function useRunDiscoveryAnalysis(workshopId: string) {
  const queryClient = useQueryClient();

  return useMutation<DiscoveryAnalysis, Error, { template: string; model: string }>({
    mutationFn: async ({ template, model }) => {
      const response = await fetch(`/workshops/${workshopId}/analyze-discovery`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ template, model }),
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ detail: 'Analysis failed' }));
        throw new Error(error.detail || 'Analysis failed');
      }
      return response.json();
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.discoveryAnalyses(workshopId) });
    },
  });
}

