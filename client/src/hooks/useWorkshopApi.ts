/**
 * React Query hooks for workshop API operations
 */

import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { WorkshopsService } from '@/client';
import { useRoleCheck } from '@/context/UserContext';
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
};

// Helper function to invalidate all workshop-related queries
export function invalidateAllWorkshopQueries(queryClient: any, workshopId: string) {
  // Invalidate all queries that start with the workshop ID
  queryClient.invalidateQueries({ 
    predicate: (query: any) => {
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
export function refetchAllWorkshopQueries(queryClient: any, workshopId: string) {
  // Refetch all queries that start with the workshop ID
  queryClient.refetchQueries({ 
    predicate: (query: any) => {
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
    queryKey: userId 
      ? QUERY_KEYS.workshopsForUser(userId)
      : QUERY_KEYS.workshops(),
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
    refetchInterval: 10000, // Refetch every 10 seconds
    refetchOnMount: true, // Always refetch on component mount to get latest traces
    refetchIntervalInBackground: false, // Don't refetch when window is not focused
    refetchOnWindowFocus: true, 
    retry: (failureCount, error) => {
      // Don't retry on 404 errors - workshop doesn't exist
      if (error && typeof error === 'object' && 'status' in error && error.status === 404) {
        return false;
      }
      // Retry other errors up to 3 times
      return failureCount < 3;
    },
    retryDelay: 1000, // Wait 1 second between retries
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
    refetchInterval: 15 * 1000, // Poll every 15 seconds to pick up new traces added by facilitator
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

export function useUploadTraces(workshopId: string) {
  const queryClient = useQueryClient();
  
  return useMutation({
    mutationFn: (traces: TraceUpload[]) => 
      WorkshopsService.uploadTracesWorkshopsWorkshopIdTracesPost(workshopId, traces),
    onSuccess: () => {
      // Invalidate both user-specific traces and all traces queries
      queryClient.invalidateQueries({ queryKey: QUERY_KEYS.traces(workshopId) });
      queryClient.invalidateQueries({ queryKey: ['all-traces', workshopId] });
    },
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
export function useUserFindings(workshopId: string, user: any) {
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
    onMutate: async (newFinding) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['findings', workshopId, newFinding.user_id] });
      
      // Snapshot the previous value
      const previousFindings = queryClient.getQueryData(['findings', workshopId, newFinding.user_id]);
      
      // Optimistically update the cache - handle both new and update cases
      queryClient.setQueryData(['findings', workshopId, newFinding.user_id], (old: any) => {
        const optimisticFinding = {
          id: `temp-${Date.now()}`,
          workshop_id: workshopId,
          trace_id: newFinding.trace_id,
          user_id: newFinding.user_id,
          insight: newFinding.insight,
          created_at: new Date().toISOString(),
        };
        
        if (!old) return [optimisticFinding];
        
        // Check if finding for this trace already exists (update case)
        const existingIndex = old.findIndex((f: any) => f.trace_id === newFinding.trace_id);
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
      queryClient.setQueryData(['findings', workshopId, finding.user_id], (old: any) => {
        if (!old) return [data];
        
        // Replace temp or existing finding with actual server data
        const existingIndex = old.findIndex((f: any) => 
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
      } catch (error: any) {
        // If rubric doesn't exist (404), return null instead of throwing
        if (error.status === 404) {
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
export function useUserAnnotations(workshopId: string, user: any) {
  return useQuery({
    queryKey: QUERY_KEYS.annotations(workshopId, user?.id),
    queryFn: () => {
      
      return WorkshopsService.getAnnotationsWorkshopsWorkshopIdAnnotationsGet(
        workshopId, 
        user?.id  // EVERYONE gets only their own annotations
      );
    },
    enabled: !!workshopId && !!user?.id, // REQUIRE user to be logged in
    staleTime: 30 * 1000, // Data is fresh for 30 seconds
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
    onMutate: async (newAnnotation) => {
      // Cancel any outgoing refetches
      await queryClient.cancelQueries({ queryKey: ['annotations', workshopId, newAnnotation.user_id] });
      
      // Snapshot the previous value
      const previousAnnotations = queryClient.getQueryData(['annotations', workshopId, newAnnotation.user_id]);
      
      // Optimistically update the cache
      queryClient.setQueryData(['annotations', workshopId, newAnnotation.user_id], (old: any) => {
        const optimisticAnnotation = {
          id: `temp-${Date.now()}`,
          workshop_id: workshopId,
          trace_id: newAnnotation.trace_id,
          user_id: newAnnotation.user_id,
          rating: newAnnotation.rating,
          comment: newAnnotation.comment,
          created_at: new Date().toISOString(),
        };
        return old ? [...old, optimisticAnnotation] : [optimisticAnnotation];
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
      } catch (error: any) {
        // If MLflow config doesn't exist (404), return null instead of throwing
        if (error.status === 404) {
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

export function useTracesForAlignment(workshopId: string) {
  return useQuery({
    queryKey: ['traces-for-alignment', workshopId],
    queryFn: async () => {
      const response = await fetch(`/workshops/${workshopId}/traces-for-alignment`);
      if (!response.ok) {
        throw new Error('Failed to fetch traces for alignment');
      }
      return response.json();
    },
    enabled: !!workshopId,
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