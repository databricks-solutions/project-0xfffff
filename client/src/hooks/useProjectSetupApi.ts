import { useMutation, useQuery } from '@tanstack/react-query';
import { ProjectSetupService } from '@/client';
import type { ProjectSetupProgress, ProjectSetupRequest } from '@/client';

export function useStartProjectSetup() {
  return useMutation({
    mutationFn: (request: ProjectSetupRequest) =>
      ProjectSetupService.startProjectSetupProjectSetupPost(request),
  });
}

export function useProjectSetupStatus() {
  return useQuery({
    queryKey: ['project-setup-status'],
    queryFn: () => ProjectSetupService.getProjectSetupStatusProjectSetupStatusGet(),
    refetchInterval: (query) => {
      const status = query.state.data?.status;
      return status === 'pending' || status === 'running' ? 2000 : false;
    },
    retry: false,
  });
}
