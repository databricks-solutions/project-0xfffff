import { useWorkflowContext } from '@/context/WorkflowContext';

export function useWorkflowMode() {
  const {
    workshopMode,
    isEvalMode,
    supportsGlobalRubric,
    supportsPerTraceCriteria,
    getDefaultRouteForPhase,
  } = useWorkflowContext();

  return {
    workshopMode,
    isEvalMode,
    supportsGlobalRubric,
    supportsPerTraceCriteria,
    getDefaultRouteForPhase,
  };
}
