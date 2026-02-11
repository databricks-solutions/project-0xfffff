import React from 'react';
import { useQueryClient, useQuery } from '@tanstack/react-query';
import { useUser, useRoleCheck } from '@/context/UserContext';
import { useWorkflowContext } from '@/context/WorkflowContext';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { WorkshopsService } from '@/client';
import { AlertCircle, CheckCircle, Clock, Users, UserCheck, Settings, Play, Brain, Eye, ChevronRight } from 'lucide-react';
import { useRubric } from '@/hooks/useWorkshopApi';

interface RoleBasedWorkflowProps {
  onNavigate: (phase: string) => void;
}

interface WorkshopStep {
  title: string;
  description: string;
  status: string;
  action: () => void;
  accessible: boolean;
  isPhaseControl?: boolean;
}

// Phases that get marked complete on click (post-annotation phases)
const CLICK_TO_COMPLETE_PHASES: Record<string, string> = {
  'results review': 'results',
  'judge tuning': 'judge_tuning',
  'prompt optimization': 'prompt_optimization',
  'manage data': 'unity_volume',
};

export const RoleBasedWorkflow: React.FC<RoleBasedWorkflowProps> = ({ onNavigate }) => {
  const { user } = useUser();
  const { workshopId } = useWorkshopContext();
  const queryClient = useQueryClient();
  const { 
    isFacilitator, 
    isSME, 
    isParticipant, 
    canCreateRubric, 
    canViewRubric,
    canManageWorkshop,
    canViewAllFindings,
    canViewAllAnnotations
  } = useRoleCheck();
  const {
    currentPhase,
    isPhaseComplete,
  } = useWorkflowContext();
  
  const [isStartingPhase, setIsStartingPhase] = React.useState(false);
  const [phaseError, setPhaseError] = React.useState<string | null>(null);

  // Track which post-annotation phase the user is currently viewing (shows as blue)
  // Phases before it in the click order show as green (completed)
  // This is in-memory only — resets on page refresh or when annotation restarts
  const [activeViewedPhase, setActiveViewedPhase] = React.useState<string | null>(null);

  // Clear post-annotation progress when workshop phase moves back to annotation or earlier
  const prevCurrentPhaseRef = React.useRef(currentPhase);
  React.useEffect(() => {
    if (currentPhase !== prevCurrentPhaseRef.current) {
      const prevPhase = prevCurrentPhaseRef.current;
      prevCurrentPhaseRef.current = currentPhase;

      // Don't clear on initial load (transition from default 'intake' to actual phase)
      if (prevPhase === 'intake') return;

      const phaseOrder = ['discovery', 'rubric', 'annotation', 'results', 'judge_tuning', 'prompt_optimization', 'unity_volume'];
      const annotationIdx = phaseOrder.indexOf('annotation');
      const newIdx = phaseOrder.indexOf(currentPhase);

      if (newIdx >= 0 && newIdx <= annotationIdx) {
        setActiveViewedPhase(null);
      }
    }
  }, [currentPhase]);
  
  const startDiscoveryPhase = async () => {
    try {
      setIsStartingPhase(true);
      setPhaseError(null);
      await WorkshopsService.beginDiscoveryPhaseWorkshopsWorkshopIdBeginDiscoveryPost(
        workshopId!
      );
      // Invalidate workshop query to trigger re-fetch of current phase
      queryClient.invalidateQueries({ queryKey: ['workshop', workshopId] });
      // Also invalidate related queries that depend on phase
      queryClient.invalidateQueries({ queryKey: ['traces', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['all-traces', workshopId] });
    } catch (error: any) {
      setPhaseError(error.message || 'Failed to start discovery phase');
    } finally {
      setIsStartingPhase(false);
    }
  };
  
  
  const isDiscoveryComplete = isPhaseComplete('discovery');
  const isRubricComplete = isPhaseComplete('rubric');
  const isAnnotationComplete = isPhaseComplete('annotation');
  const isResultsComplete = isPhaseComplete('results');
  const isJudgeTuningComplete = isPhaseComplete('judge_tuning');
  const isPromptOptimizationComplete = isPhaseComplete('prompt_optimization');
  
  // Check if current user has completed discovery
  const { data: userDiscoveryComplete } = useQuery({
    queryKey: ['user-discovery-complete', workshopId, user?.id],
    queryFn: async () => {
      if (!user?.id || !workshopId) return false;
      const response = await fetch(`/workshops/${workshopId}/users/${user.id}/discovery-complete`);
      if (!response.ok) return false;
      const data = await response.json();
      return data.discovery_complete;
    },
    enabled: !!user?.id && !!workshopId && currentPhase === 'discovery',
  });
  
  // Check overall discovery completion status
  const { data: discoveryCompletionStatus } = useQuery({
    queryKey: ['discovery-completion-status', workshopId],
    queryFn: async () => {
      if (!workshopId) return null;
      const response = await fetch(`/workshops/${workshopId}/discovery-completion-status`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!workshopId && currentPhase === 'discovery' // Only enable during discovery phase
  });

  // Use real user or show login prompt
  if (!user) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-gray-500">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">Please log in</h3>
            <p className="mb-4">Choose your role to join the workshop.</p>
            <Button onClick={() => window.location.reload()}>
              Refresh Page
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }
  
  const currentUser = user;

  const getRoleIcon = () => {
    if (isFacilitator) return <Settings className="w-4 h-4" />;
    if (isSME) return <UserCheck className="w-4 h-4" />;
    return <Users className="w-4 h-4" />;
  };

  const getRoleDescription = () => {
    if (isFacilitator) {
      return "As a facilitator, you can manage the workshop, create rubrics, and view all participant contributions.";
    }
    if (isSME) {
      return "As a Subject Matter Expert, you can view all findings, help create rubrics, and provide expert annotations.";
    }
    return "As a participant, you can contribute to discovery, annotations, and view results.";
  };
  
  // Check if rubric is available for phase logic
  const { data: rubric } = useRubric(workshopId!);
  const isRubricAvailable = !!rubric;

  const getWorkshopSteps = () => {
    const steps: WorkshopStep[] = [];

    // Check if discovery should be marked as completed (defined at function level)
    const shouldMarkDiscoveryComplete = isDiscoveryComplete || 
                                       discoveryCompletionStatus?.all_completed || 
                                       ['rubric', 'annotation', 'results', 'judge_tuning', 'prompt_optimization', 'dbsql_export'].includes(currentPhase);

    // Always show all phases for context, but with different statuses and accessibility
    
    // Phase 0: Intake Phase
    if (currentPhase === 'intake') {
      steps.push({
        title: 'Intake Phase',
        description: isFacilitator ? 'Pull MLflow traces' : 'Waiting for traces',
        status: isFacilitator ? 'in_progress' : 'waiting',
        action: () => onNavigate('intake'),
        accessible: isFacilitator  // Only facilitator can click
      });
    } else {
      // Intake is completed
      steps.push({
        title: 'Intake Phase',
        description: 'Traces loaded and ready',
        status: 'completed',
        action: () => onNavigate('intake'),
        accessible: isFacilitator  // Only facilitator can click
      });
    }

    // Phase 1: Discovery Phase
    if (currentPhase === 'intake') {
      // Pre-discovery: Show waiting for everyone, facilitator gets special treatment in main content
      steps.push({
        title: 'Discovery Phase',
        description: isFacilitator ? 'Ready to begin' : 'Waiting for facilitator',
        status: isFacilitator ? 'available' : 'waiting',
        action: () => onNavigate('discovery'),
        accessible: true
      });
    } else {
      // Discovery is available or completed
      let discoveryStatus = 'upcoming';
      let discoveryDescription = 'Explore traces and share insights';

      if (shouldMarkDiscoveryComplete) {
        discoveryStatus = 'completed';
        discoveryDescription = 'All participants completed';
      } else if (userDiscoveryComplete) {
        discoveryStatus = 'completed';
        discoveryDescription = 'Done — waiting for others';
      } else {
        discoveryStatus = 'in_progress';
        discoveryDescription = 'Explore traces and share insights';
      }

      // Force discovery to be completed if we're in rubric phase or beyond
      const finalDiscoveryStatus = currentPhase === 'rubric' ? 'completed' : discoveryStatus;
      const finalDiscoveryDescription = currentPhase === 'rubric' ? 'All participants completed' : discoveryDescription;

      steps.push({
        title: 'Discovery Phase',
        description: isFacilitator ? 'Monitor progress and findings' : finalDiscoveryDescription,
        status: finalDiscoveryStatus,
        action: () => onNavigate('discovery'),
        accessible: true
      });
    }

    // Phase 2: Rubric Creation
    if (shouldMarkDiscoveryComplete && isFacilitator && !isRubricAvailable) {
      // Facilitator can create rubric once discovery is done
      steps.push({
        title: 'Rubric Creation',
        description: 'Create evaluation criteria',
        status: 'available',
        action: () => onNavigate('rubric'),
        accessible: isFacilitator  // Only facilitator can click
      });
    } else if (shouldMarkDiscoveryComplete && !isFacilitator && !isRubricAvailable) {
      // Non-facilitators wait for rubric to be created
      steps.push({
        title: 'Rubric Creation',
        description: 'Facilitator preparing criteria',
        status: 'pending',
        action: () => onNavigate('rubric'),
        accessible: isFacilitator  // Only facilitator can click
      });
    } else if (isRubricAvailable && !isRubricComplete) {
      // Rubric exists but annotation phase hasn't started - show as completed for everyone
      steps.push({
        title: 'Rubric Creation',
        description: isFacilitator ? 'Ready for annotation phase' : 'Criteria ready — click to view',
        status: 'completed',
        action: () => onNavigate('rubric'),
        accessible: isFacilitator  // Only facilitator can click
      });
    } else if (isRubricComplete) {
      // Annotation phase started - rubric is now completed
      steps.push({
        title: 'Rubric Creation',
        description: isFacilitator ? 'View or edit rubric' : 'View the rubric',
        status: 'completed',
        action: () => onNavigate('rubric'),
        accessible: isFacilitator  // Only facilitator can click
      });
    } else {
      // Discovery not complete yet
      steps.push({
        title: 'Rubric Creation',
        description: 'Complete discovery first',
        status: 'upcoming',
        action: () => onNavigate('rubric'),
        accessible: isFacilitator  // Only facilitator can click
      });
    }

    // Phase 3: Annotation Phase
    if (currentPhase === 'discovery' && shouldMarkDiscoveryComplete && isRubricAvailable && isFacilitator) {
      steps.push({
        title: 'Annotation Phase',
        description: 'Ready to start annotations',
        status: 'available',
        action: () => onNavigate('annotation'),
        accessible: true
      });
    } else if (currentPhase === 'annotation') {
      if (isSME) {
        steps.push({
          title: 'Annotation Phase',
          description: 'Rate traces using rubric',
          status: isAnnotationComplete ? 'completed' : 'in_progress',
          action: () => onNavigate('annotation'),
          accessible: true
        });
      } else if (isFacilitator) {
        steps.push({
          title: 'Annotation Phase',
          description: 'Monitor annotation progress',
          status: isAnnotationComplete ? 'completed' : 'in_progress',
          action: () => onNavigate('annotation'),
          accessible: true
        });
      } else {
        steps.push({
          title: 'Annotation Phase',
          description: 'SMEs annotating traces',
          status: 'in_progress',
          action: () => onNavigate('annotation'),
          accessible: true
        });
      }
    } else if (isAnnotationComplete) {
      steps.push({
        title: 'Annotation Phase',
        description: 'View completed annotations',
        status: 'completed',
        action: () => onNavigate('annotation'),
        accessible: true
      });
    } else {
      steps.push({
        title: 'Annotation Phase',
        description: isSME ? 'Annotate traces with rubric' : 'SMEs will annotate traces',
        status: 'upcoming',
        action: () => onNavigate('annotation'),
        accessible: true
      });
    }

    // Phase 4: Results Review
    if (isResultsComplete) {
      steps.push({
        title: 'Results Review',
        description: isFacilitator ? 'View IRR analysis and results' : 'Review and share IRR results',
        status: 'completed',
        action: () => onNavigate('results'),
        accessible: true
      });
    } else if (isAnnotationComplete) {
      steps.push({
        title: 'Results Review',
        description: isFacilitator ? 'View IRR analysis and results' : 'Facilitator will share results',
        status: isFacilitator ? (currentPhase === 'results' ? 'in_progress' : 'available') : 'waiting',
        action: () => onNavigate('results'),
        accessible: true
      });
    } else {
      steps.push({
        title: 'Results Review',
        description: isFacilitator ? 'Review and share IRR results' : 'Facilitator will share results',
        status: 'upcoming',
        action: () => onNavigate('results'),
        accessible: isFacilitator
      });
    }

    // Phase 5: Judge Tuning (Facilitator Only)
    if (isJudgeTuningComplete) {
      steps.push({
        title: 'Judge Tuning',
        description: isFacilitator ? 'Create AI judges from data' : 'AI judge creation',
        status: 'completed',
        action: () => onNavigate('judge_tuning'),
        accessible: isFacilitator
      });
    } else if (isAnnotationComplete && isFacilitator) {
      steps.push({
        title: 'Judge Tuning',
        description: 'Create AI judges from data',
        status: currentPhase === 'judge_tuning' ? 'in_progress' : 'available',
        action: () => onNavigate('judge_tuning'),
        accessible: isFacilitator
      });
    } else if (isAnnotationComplete && !isFacilitator) {
      steps.push({
        title: 'Judge Tuning',
        description: 'Facilitator creating AI judges',
        status: 'waiting',
        action: () => onNavigate('judge_tuning'),
        accessible: false
      });
    } else {
      steps.push({
        title: 'Judge Tuning',
        description: isFacilitator ? 'Create AI judges' : 'AI judge creation',
        status: 'upcoming',
        action: () => onNavigate('judge_tuning'),
        accessible: isFacilitator
      });
    }

    // Phase 6: Prompt Optimization (Facilitator Only)
    if (isPromptOptimizationComplete) {
      steps.push({
        title: 'Prompt Optimization',
        description: isFacilitator ? 'Optimize agent prompt with GEPA' : 'Agent prompt optimization',
        status: 'completed',
        action: () => onNavigate('prompt_optimization'),
        accessible: isFacilitator
      });
    } else if (isJudgeTuningComplete && isFacilitator) {
      steps.push({
        title: 'Prompt Optimization',
        description: 'Optimize agent prompt with GEPA',
        status: currentPhase === 'prompt_optimization' ? 'in_progress' : 'available',
        action: () => onNavigate('prompt_optimization'),
        accessible: isFacilitator
      });
    } else if (isJudgeTuningComplete && !isFacilitator) {
      steps.push({
        title: 'Prompt Optimization',
        description: 'Facilitator optimizing agent prompt',
        status: 'waiting',
        action: () => onNavigate('prompt_optimization'),
        accessible: false
      });
    } else {
      steps.push({
        title: 'Prompt Optimization',
        description: isFacilitator ? 'Optimize agent prompt' : 'Agent prompt optimization',
        status: 'upcoming',
        action: () => onNavigate('prompt_optimization'),
        accessible: isFacilitator
      });
    }

    // Phase 7: Manage Workshop Data (All Users)
    if (isPhaseComplete('unity_volume')) {
      steps.push({
        title: 'Manage Data',
        description: 'Upload or download data',
        status: 'completed',
        action: () => onNavigate('unity_volume'),
        accessible: true
      });
    } else if (currentPhase === 'unity_volume') {
      steps.push({
        title: 'Manage Data',
        description: 'Upload or download data',
        status: 'in_progress',
        action: () => onNavigate('unity_volume'),
        accessible: true
      });
    } else if (isPromptOptimizationComplete || isJudgeTuningComplete) {
      steps.push({
        title: 'Manage Data',
        description: 'Upload or download data',
        status: 'available',
        action: () => onNavigate('unity_volume'),
        accessible: true
      });
    } else {
      steps.push({
        title: 'Manage Data',
        description: 'Available after optimization',
        status: 'upcoming',
        action: () => onNavigate('unity_volume'),
        accessible: true
      });
    }

    return steps;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'in_progress':
        return <Clock className="w-4 h-4" />;
      case 'available':
        return <Play className="w-4 h-4" />;
      case 'action_required':
        return <Play className="w-4 h-4" />;
      case 'waiting':
        return <AlertCircle className="w-4 h-4" />;
      case 'pending':
        return <Clock className="w-4 h-4" />;
      case 'upcoming':
        return <Clock className="w-4 h-4" />;
      default:
        return <Clock className="w-4 h-4" />;
    }
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'bg-green-50 text-green-600';
      case 'in_progress':
        return 'bg-amber-100 text-amber-700';
      case 'available':
        return 'bg-blue-50 text-blue-600';
      case 'action_required':
        return 'bg-purple-100 text-purple-700';
      case 'waiting':
        return 'bg-amber-100 text-amber-700';
      case 'pending':
        return 'bg-gray-100 text-gray-600';
      case 'upcoming':
        return 'bg-gray-100 text-gray-600';
      default:
        return 'bg-gray-100 text-gray-600';
    }
  };

  const getStatusBorderColor = (status: string) => {
    switch (status) {
      case 'completed':
        return 'border-green-500';
      case 'in_progress':
        return 'border-amber-500';
      case 'available':
        return 'border-blue-500';
      case 'action_required':
        return 'border-purple-500';
      case 'waiting':
        return 'border-amber-500';
      default:
        return 'border-transparent';
    }
  };

  const getStatusBadgeText = (status: string) => {
    switch (status) {
      case 'completed':
        return 'Completed';
      case 'in_progress':
        return 'In Progress';
      case 'available':
        return 'Available';
      case 'action_required':
        return 'Action Required';
      case 'waiting':
        return 'Waiting';
      case 'pending':
        return 'Pending';
      case 'upcoming':
        return 'Upcoming';
      default:
        return status;
    }
  };

  const refreshWorkshopData = () => {
    queryClient.invalidateQueries({ queryKey: ['workshop', workshopId] });
    queryClient.invalidateQueries({ queryKey: ['traces', workshopId] });
    queryClient.invalidateQueries({ queryKey: ['all-traces', workshopId] });
    queryClient.invalidateQueries({ queryKey: ['findings', workshopId] });
    queryClient.invalidateQueries({ queryKey: ['rubric', workshopId] });
    queryClient.invalidateQueries({ queryKey: ['annotations', workshopId] });
  };

  return (
    <div className="space-y-3">
      {/* Phase Error Display */}
      {phaseError && (
        <div className="rounded-lg border border-destructive/50 bg-destructive/10 p-3">
          <div className="flex items-center gap-2 text-destructive">
            <AlertCircle className="h-4 w-4" />
            <span className="text-xs font-medium">Error: {phaseError}</span>
          </div>
        </div>
      )}

      {/* Facilitator Management Section */}
      {isFacilitator && (
        <div className="rounded-lg border border-gray-200 bg-white shadow-sm p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-bold text-gray-700 uppercase tracking-wide">
            <Settings className="w-4 h-4" />
            Management
          </div>
          <div className="flex flex-col gap-1">
            <button
              onClick={() => onNavigate('user-management')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-50 transition-all border-l-3 border-transparent hover:border-blue-500 text-left group"
            >
              <Users className="w-4 h-4 text-gray-600 group-hover:text-blue-600 transition-colors" />
              <span className="text-xs font-medium text-gray-700 group-hover:text-blue-900">Invite Participants</span>
            </button>
            <button
              onClick={() => onNavigate('dashboard-general')}
              className="w-full flex items-center gap-3 px-3 py-2.5 rounded-lg hover:bg-blue-50 transition-all border-l-3 border-transparent hover:border-blue-500 text-left group"
            >
              <Eye className="w-4 h-4 text-gray-600 group-hover:text-blue-600 transition-colors" />
              <span className="text-xs font-medium text-gray-700 group-hover:text-blue-900">Dashboard</span>
            </button>
          </div>
        </div>
      )}

      {/* Workflow Steps */}
      <div className="space-y-2">
        {getWorkshopSteps().map((step, index) => {
          // Derive post-annotation phase visual state from activeViewedPhase position
          const CLICK_PHASE_ORDER = ['results', 'judge_tuning', 'prompt_optimization', 'unity_volume'];
          const stepPhaseId = CLICK_TO_COMPLETE_PHASES[step.title.toLowerCase()];
          const stepIdx = stepPhaseId ? CLICK_PHASE_ORDER.indexOf(stepPhaseId) : -1;
          const activeIdx = activeViewedPhase ? CLICK_PHASE_ORDER.indexOf(activeViewedPhase) : -1;

          // Active = currently viewing (blue), before active = already visited (green)
          const isActivelyViewed = stepIdx >= 0 && stepIdx === activeIdx;
          const isBeforeActive = stepIdx >= 0 && activeIdx >= 0 && stepIdx < activeIdx;

          // Override status based on click-through position
          let effectiveStatus = step.status;
          if (isActivelyViewed) {
            effectiveStatus = 'in_progress'; // blue
          } else if (isBeforeActive) {
            effectiveStatus = 'completed'; // green
          }

          const isActive = effectiveStatus === 'in_progress' || effectiveStatus === 'action_required';
          const isCompleted = effectiveStatus === 'completed';
          const isWaiting = effectiveStatus === 'waiting';
          const isAvailable = effectiveStatus === 'available';

          // Simplified current phase detection - direct string matching OR actively viewed
          const isCurrentPhase = isActivelyViewed || (() => {
            const title = step.title.toLowerCase();
            if (title.includes('discovery')) return currentPhase === 'discovery';
            if (title.includes('rubric')) return currentPhase === 'rubric';
            if (title.includes('annotation')) return currentPhase === 'annotation';
            if (title.includes('results')) return currentPhase === 'results';
            if (title.includes('judge')) return currentPhase === 'judge_tuning';
            if (title.includes('prompt optimization')) return currentPhase === 'prompt_optimization';
            if (title.includes('dbsql')) return currentPhase === 'dbsql_export';
            if (title.includes('unity')) return currentPhase === 'unity_volume';
            return false;
          })();

          return (
            <button
              key={index}
              onClick={() => {
                if (!isStartingPhase && step.accessible) {
                  const phaseId = CLICK_TO_COMPLETE_PHASES[step.title.toLowerCase()];
                  if (phaseId) {
                    setActiveViewedPhase(phaseId);
                  }
                  step.action();
                }
              }}
              disabled={!step.accessible}
              className={`relative w-full rounded-lg border-l-4 p-2.5 text-left transition-all group ${
                isCurrentPhase && !isCompleted
                  ? 'bg-blue-50/50 border-blue-400 shadow-sm ring-1 ring-blue-100'
                  : isCompleted
                  ? 'bg-green-50/30 border-green-400 hover:bg-green-50/50 hover:shadow-sm'
                  : isActive || isAvailable
                  ? 'bg-amber-50/50 border-amber-500 hover:bg-amber-50 hover:shadow-sm'
                  : isWaiting
                  ? 'bg-amber-50/30 border-amber-400'
                  : 'bg-white border-gray-200 hover:bg-gray-50 hover:border-gray-300 hover:shadow-sm'
              } ${!step.accessible ? 'opacity-60 cursor-not-allowed' : 'cursor-pointer'}`}
            >
              <div className="flex items-start gap-2.5">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-lg ${
                    isCompleted
                      ? 'bg-green-100/70 text-green-600'
                      : isActive || isAvailable
                      ? 'bg-amber-100 text-amber-700'
                      : isCurrentPhase
                      ? 'bg-blue-100/70 text-blue-600'
                      : isWaiting
                      ? 'bg-amber-100 text-amber-600'
                      : 'bg-gray-100 text-gray-500'
                  }`}
                >
                  {getStatusIcon(effectiveStatus)}
                </div>

                <div className="flex-1 min-w-0 space-y-0.5">
                  <div className="flex items-center gap-2 flex-wrap">
                    <h4 className={`text-sm font-semibold leading-none ${
                      isCurrentPhase ? 'text-blue-800' :
                      isCompleted ? 'text-green-700' :
                      isActive || isAvailable ? 'text-amber-900' :
                      'text-gray-800'
                    }`}>
                      {step.title}
                    </h4>
                    {(isCurrentPhase || isActive || isAvailable || isCompleted || isWaiting) && (
                      <Badge
                        variant="secondary"
                        className={`text-[10px] font-semibold px-2 py-0 h-5 ${getStatusColor(effectiveStatus)}`}
                      >
                        {getStatusBadgeText(effectiveStatus)}
                      </Badge>
                    )}
                  </div>
                  <p className="text-[11px] text-gray-500 leading-snug">
                    {step.description}
                  </p>
                </div>

                {step.accessible && (
                  <ChevronRight className={`w-4 h-4 shrink-0 opacity-0 group-hover:opacity-100 transition-opacity ${
                    isCurrentPhase ? 'text-blue-500' :
                    isCompleted ? 'text-green-500' :
                    isActive || isAvailable ? 'text-amber-600' :
                    'text-gray-400'
                  }`} />
                )}
              </div>

              {/* Progress connector line */}
              {index < getWorkshopSteps().length - 1 && (
                <div className={`absolute left-[17px] top-10 h-3 w-px ${
                  isCompleted ? 'bg-green-200' :
                  isActive || isCurrentPhase ? 'bg-amber-300' :
                  'bg-gray-200'
                }`} />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};