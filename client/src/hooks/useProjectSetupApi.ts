import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { ApiError, ProjectSetupService } from '@/client';
import type { ProjectSetupProgress, ProjectSetupRequest, ProjectSetupState } from '@/client';

export function isProjectSetupApiError(error: unknown): error is ApiError {
  return error instanceof ApiError;
}

export function isSetupInProgress(status: ProjectSetupProgress['status'] | undefined) {
  return status === 'pending' || status === 'running';
}

export function isSetupBlockingStatus(status: ProjectSetupProgress['status'] | undefined) {
  return status === 'pending' || status === 'running' || status === 'failed' || status === 'enqueue_failed' || status === 'cancelled';
}

export function useStartProjectSetup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: ProjectSetupRequest) =>
      ProjectSetupService.startProjectSetupApiProjectSetupPost(request),
    onSuccess: (response) => {
      localStorage.setItem('project_setup_job_id', response.setup_job_id);
      queryClient.setQueryData<ProjectSetupProgress>(['project-setup-status'], {
        ...response,
        queue_job_id: null,
        delegated_run_ids: [],
        details: {},
      });
      queryClient.invalidateQueries({ queryKey: ['project-setup-status'] });
      queryClient.invalidateQueries({ queryKey: ['project-setup-job', response.setup_job_id] });
    },
  });
}

export function useProjectSetupState(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['project-setup-state'],
    queryFn: () => ProjectSetupService.getProjectSetupApiProjectSetupGet(),
    retry: false,
    enabled: options?.enabled ?? true,
  });
}

export function useUpdateProjectSetup() {
  const queryClient = useQueryClient();

  return useMutation({
    mutationFn: (request: ProjectSetupRequest) =>
      ProjectSetupService.updateProjectSetupApiProjectSetupPatch(request),
    onSuccess: (state) => {
      queryClient.setQueryData(['project-setup-state'], state);
      queryClient.invalidateQueries({ queryKey: ['project-setup-status'] });
    },
  });
}

export function useProjectSetupStatus(options?: { enabled?: boolean }) {
  return useQuery({
    queryKey: ['project-setup-status'],
    queryFn: () => ProjectSetupService.getProjectSetupStatusApiProjectSetupStatusGet(),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return isSetupInProgress(status) ? 2000 : false;
    },
    retry: false,
    enabled: options?.enabled ?? true,
  });
}

export function useProjectSetupJobStatus(setupJobId: string | null | undefined) {
  return useQuery({
    queryKey: ['project-setup-job', setupJobId],
    queryFn: () => ProjectSetupService.getProjectSetupJobApiProjectSetupJobsSetupJobIdGet(setupJobId || ''),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return isSetupInProgress(status) ? 2000 : false;
    },
    retry: false,
    enabled: !!setupJobId,
  });
}
