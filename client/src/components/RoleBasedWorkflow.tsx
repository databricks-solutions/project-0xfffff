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
    isPhaseComplete
  } = useWorkflowContext();
  
  const [isStartingPhase, setIsStartingPhase] = React.useState(false);
  const [phaseError, setPhaseError] = React.useState<string | null>(null);
  
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
                                       ['rubric', 'annotation', 'results', 'judge_tuning', 'dbsql_export'].includes(currentPhase);

    // Always show all phases for context, but with different statuses and accessibility
    
    // Phase 0: Intake Phase
    if (currentPhase === 'intake') {
      steps.push({
        title: 'Intake Phase',
        description: isFacilitator ? 'Configure and pull MLflow traces' : 'Waiting for facilitator to load traces',
        status: isFacilitator ? 'in_progress' : 'waiting',
        action: () => onNavigate('intake'),
        accessible: isFacilitator  // Only facilitator can click
      });
    } else {
      // Intake is completed
      steps.push({
        title: 'Intake Phase',
        description: 'MLflow traces loaded and ready',
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
        description: isFacilitator ? 'Ready to begin discovery phase' : 'Waiting for facilitator to start discovery phase',
        status: isFacilitator ? 'available' : 'waiting',
        action: () => onNavigate('discovery'),
        accessible: true
      });
    } else {
      // Discovery is available or completed
      let discoveryStatus = 'upcoming';
      let discoveryDescription = 'Explore traces and provide insights';
      
      if (shouldMarkDiscoveryComplete) {
        discoveryStatus = 'completed';
        discoveryDescription = 'Discovery phase completed for all participants';
      } else if (userDiscoveryComplete) {
        discoveryStatus = 'completed';
        discoveryDescription = 'You have completed discovery - waiting for others';
      } else {
        discoveryStatus = 'in_progress';
        discoveryDescription = 'Explore traces and provide insights';
      }
      
      // Force discovery to be completed if we're in rubric phase or beyond
      const finalDiscoveryStatus = currentPhase === 'rubric' ? 'completed' : discoveryStatus;
      const finalDiscoveryDescription = currentPhase === 'rubric' ? 'Discovery phase completed for all participants' : discoveryDescription;
      
      steps.push({
        title: 'Discovery Phase',
        description: isFacilitator ? 'Monitor discovery progress and review findings' : finalDiscoveryDescription,
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
        description: 'Create evaluation rubric for the annotation phase',
        status: 'available',
        action: () => onNavigate('rubric'),
        accessible: isFacilitator  // Only facilitator can click
      });
    } else if (shouldMarkDiscoveryComplete && !isFacilitator && !isRubricAvailable) {
      // Non-facilitators wait for rubric to be created
      steps.push({
        title: 'Rubric Creation',
        description: 'Facilitator preparing evaluation criteria',
        status: 'pending',
        action: () => onNavigate('rubric'),
        accessible: isFacilitator  // Only facilitator can click
      });
    } else if (isRubricAvailable && !isRubricComplete) {
      // Rubric exists but annotation phase hasn't started - show as completed for everyone
      steps.push({
        title: 'Rubric Creation',
        description: isFacilitator ? 'Rubric created - ready to start annotation phase' : 'Evaluation criteria ready - click to view',
        status: 'completed',
        action: () => onNavigate('rubric'),
        accessible: isFacilitator  // Only facilitator can click
      });
    } else if (isRubricComplete) {
      // Annotation phase started - rubric is now completed
      steps.push({
        title: 'Rubric Creation',
        description: isFacilitator ? 'View or edit the evaluation rubric' : 'View the evaluation rubric',
        status: 'completed',
        action: () => onNavigate('rubric'),
        accessible: isFacilitator  // Only facilitator can click
      });
    } else {
      // Discovery not complete yet
      steps.push({
        title: 'Rubric Creation',
        description: 'Complete discovery phase first',
        status: 'upcoming',
        action: () => onNavigate('rubric'),
        accessible: isFacilitator  // Only facilitator can click
      });
    }

    // Phase 3: Annotation Phase
    if (currentPhase === 'discovery' && shouldMarkDiscoveryComplete && isRubricAvailable && isFacilitator) {
      steps.push({
        title: 'Annotation Phase',
        description: 'Ready to start annotation phase - use discovery dashboard to begin',
        status: 'available',
        action: () => onNavigate('annotation'),
        accessible: true
      });
    } else if (currentPhase === 'annotation') {
      if (isSME) {
        steps.push({
          title: 'Annotation Phase',
          description: 'Rate traces using the rubric',
          status: isAnnotationComplete ? 'completed' : 'in_progress',
          action: () => onNavigate('annotation'),
          accessible: true
        });
      } else if (isFacilitator) {
        steps.push({
          title: 'Annotation Phase',
          description: 'Monitor annotation progress (SMEs only)',
          status: isAnnotationComplete ? 'completed' : 'in_progress',
          action: () => onNavigate('annotation'),
          accessible: true
        });
      } else {
        steps.push({
          title: 'Annotation Phase',
          description: 'SMEs are currently annotating the traces',
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
        description: isSME ? 'SMEs will annotate traces using the rubric' : 'SMEs will annotate traces (you will observe)',
        status: 'upcoming',
        action: () => onNavigate('annotation'),
        accessible: true
      });
    }

    // Phase 4: Results Review
    if (isAnnotationComplete) {
      if (isFacilitator) {
        steps.push({
          title: 'Results Review',
          description: 'View analysis and IRR results (share screen with participants)',
          status: isResultsComplete ? 'completed' : (currentPhase === 'results' ? 'in_progress' : 'available'),
          action: () => onNavigate('results'),
          accessible: true
        });
      } else {
        steps.push({
          title: 'Results Review',
          description: 'Workshop complete! Facilitator will share the IRR results',
          status: isResultsComplete ? 'completed' : 'waiting',
          action: () => onNavigate('results'),
          accessible: true
        });
      }
    } else {
      steps.push({
        title: 'Results Review',
        description: isFacilitator ? 'Review IRR results and share with participants' : 'Facilitator will share results',
        status: 'upcoming',
        action: () => onNavigate('results'),
        accessible: isFacilitator  // Only facilitator can click
      });
    }

    // Phase 5: Judge Tuning (Facilitator Only)
    if (isAnnotationComplete && isFacilitator) {
      steps.push({
        title: 'Judge Tuning',
        description: 'Create and refine AI judges using annotation data',
        status: currentPhase === 'judge_tuning' ? 'in_progress' : 
                (currentPhase === 'dbsql_export' || isJudgeTuningComplete) ? 'completed' : 'available',
        action: () => onNavigate('judge_tuning'),
        accessible: isFacilitator  // Only facilitator can click
      });
    } else if (isAnnotationComplete && !isFacilitator) {
      steps.push({
        title: 'Judge Tuning',
        description: 'Facilitator is creating AI judges (advanced feature)',
        status: (currentPhase === 'dbsql_export' || isJudgeTuningComplete) ? 'completed' : 'waiting',
        action: () => onNavigate('judge_tuning'),
        accessible: isFacilitator  // Only facilitator can click
      });
    } else {
      steps.push({
        title: 'Judge Tuning',
        description: isFacilitator ? 'Create AI judges from human annotations' : 'AI judge creation (facilitator only)',
        status: 'upcoming',
        action: () => onNavigate('judge_tuning'),
        accessible: isFacilitator  // Only facilitator can click
      });
    }

    // Phase 6: Manage Workshop Data (All Users)
    if (currentPhase === 'unity_volume') {
      // If we're in Unity volume phase, show it as in progress
      steps.push({
        title: 'Manage Workshop Data',
        description: 'Upload to Unity Volume or download workshop data',
        status: 'in_progress',
        action: () => onNavigate('unity_volume'),
        accessible: true
      });
    } else if (isJudgeTuningComplete) {
      steps.push({
        title: 'Manage Workshop Data',
        description: 'Upload to Unity Volume or download workshop data',
        status: 'available',
        action: () => onNavigate('unity_volume'),
        accessible: true  // All users can access data management
      });
    } else {
      steps.push({
        title: 'Manage Workshop Data',
        description: 'Upload to Unity Volume or download workshop data after judge tuning',
        status: 'upcoming',
        action: () => onNavigate('unity_volume'),
        accessible: true  // All users can access data management
      });
    }

    return steps;
  };

  const getStatusIcon = (status: string) => {
    switch (status) {
      case 'completed':
        return <CheckCircle className="w-4 h-4" />;
      case 'in_progress':
      case 'available':
        return <Clock className="w-4 h-4" />;
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
        return 'bg-green-100 text-green-800';
      case 'in_progress':
      case 'available':
        return 'bg-blue-100 text-blue-800';
      case 'action_required':
        return 'bg-purple-100 text-purple-800';
      case 'waiting':
        return 'bg-yellow-100 text-yellow-800';
      case 'pending':
        return 'bg-gray-100 text-gray-600';
      case 'upcoming':
        return 'bg-gray-100 text-gray-600';
      default:
        return 'bg-gray-100 text-gray-800';
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
        <div className="rounded-lg border bg-card p-3 space-y-2">
          <div className="flex items-center gap-2 text-xs font-semibold text-foreground">
            <Users className="w-3.5 h-3.5" />
            Management
          </div>
          <div className="flex flex-col gap-1.5">
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate('user-management')}
              className="justify-start h-8 px-2 text-xs"
            >
              <Users className="w-3.5 h-3.5 mr-2" />
              Invite Participants
            </Button>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => onNavigate('dashboard-general')}
              className="justify-start h-8 px-2 text-xs"
            >
              <Settings className="w-3.5 h-3.5 mr-2" />
              Dashboard
            </Button>
          </div>
        </div>
      )}

      {/* Workflow Steps */}
      <div className="space-y-2">
        {getWorkshopSteps().map((step, index) => {
          const isActive = step.status === 'in_progress' || step.status === 'action_required';
          const isCompleted = step.status === 'completed';
          const isWaiting = step.status === 'waiting';
          
          // Simplified current phase detection - direct string matching
          const isCurrentPhase = (() => {
            const title = step.title.toLowerCase();
            if (title.includes('discovery')) return currentPhase === 'discovery';
            if (title.includes('rubric')) return currentPhase === 'rubric';
            if (title.includes('annotation')) return currentPhase === 'annotation';
            if (title.includes('results')) return currentPhase === 'results';
            if (title.includes('judge')) return currentPhase === 'judge_tuning';
            if (title.includes('dbsql')) return currentPhase === 'dbsql_export';
            return false;
          })();
          
          return (
            <button
              key={index}
              onClick={() => {
                if (!isStartingPhase) {
                  step.action();
                }
              }}
              className={`relative w-full rounded-lg border p-3 text-left transition-all ${
                isCurrentPhase && !isCompleted
                  ? 'border-primary bg-primary/5 shadow-sm ring-2 ring-primary/20'
                  : isActive
                  ? 'border-primary/50 bg-primary/5'
                  : isCompleted
                  ? 'border-emerald-200 bg-emerald-50/50'
                  : isWaiting
                  ? 'border-amber-200 bg-amber-50/50'
                  : 'border-border bg-card hover:bg-accent'
              }`}
            >
              <div className="flex items-start gap-3">
                <div
                  className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full ${
                    isCompleted
                      ? 'bg-emerald-100 text-emerald-700'
                      : isActive
                      ? 'bg-primary/10 text-primary'
                      : isWaiting
                      ? 'bg-amber-100 text-amber-700'
                      : 'bg-muted text-muted-foreground'
                  }`}
                >
                  {getStatusIcon(step.status)}
                </div>

                <div className="flex-1 min-w-0 space-y-1">
                  <div className="flex items-center gap-2">
                    <h4 className="text-xs font-semibold leading-none">
                      {step.title}
                    </h4>
                    {isCurrentPhase && !isCompleted && (
                      <span className="rounded-full bg-primary/10 px-1.5 py-0.5 text-[10px] font-medium text-primary">
                        Current
                      </span>
                    )}
                  </div>
                  <p className="text-[11px] leading-snug text-muted-foreground line-clamp-2">
                    {step.description}
                  </p>
                </div>
              </div>

              {/* Progress connector line */}
              {index < getWorkshopSteps().length - 1 && (
                <div className="absolute left-[22px] top-10 h-3 w-px bg-border" />
              )}
            </button>
          );
        })}
      </div>
    </div>
  );
};