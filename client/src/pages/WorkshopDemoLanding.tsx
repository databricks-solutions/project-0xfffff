import React from 'react';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertCircle, Settings } from 'lucide-react';
import { WorkshopHeader } from '@/components/WorkshopHeader';
import { useUser, useRoleCheck } from '@/context/UserContext';
import { useWorkflowContext } from '@/context/WorkflowContext';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useWorkshop, useRubric, useCreateWorkshop } from '@/hooks/useWorkshopApi';
import { WorkshopsService } from '@/client';
import { useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';

// Component imports
import { TraceViewerDemo } from './TraceViewerDemo';
import { RubricCreationDemo } from './RubricCreationDemo';
import { AnnotationDemo } from './AnnotationDemo';
import { IRRResultsDemo } from './IRRResultsDemo';
import { JudgeTuningPage } from './JudgeTuningPage';
import { DBSQLExportPage } from './DBSQLExportPage';
import { UnityVolumePage } from './UnityVolumePage';
import { FindingsReviewPage } from './FindingsReviewPage';
import { IntakePage } from './IntakePage';
import { AppSidebar } from '@/components/AppSidebar';
import { AnnotationAssignmentManager } from '@/components/AnnotationAssignmentManager';
import { FacilitatorDashboard } from '@/components/FacilitatorDashboard';
import { FacilitatorUserManager } from '@/components/FacilitatorUserManager';
import { UserLogin } from '@/components/UserLogin';
import { ProductionLogin } from '@/components/ProductionLogin';
import { WorkshopCreationPage } from '@/components/WorkshopCreationPage';
import { RubricWaitingView } from '@/components/RubricWaitingView';
import { RubricViewPage } from '@/components/RubricViewPage';
import { AnnotationWaitingView } from '@/components/AnnotationWaitingView';
import { ResultsWaitingView } from '@/components/ResultsWaitingView';
import { IntakeWaitingView } from '@/components/IntakeWaitingView';
import { DiscoveryStartPage } from '@/components/DiscoveryStartPage';
import { AnnotationStartPage } from '@/components/AnnotationStartPage';
import { DiscoveryPendingPage } from '@/components/DiscoveryPendingPage';
import { AnnotationPendingPage } from '@/components/AnnotationPendingPage';
import { FacilitatorScreenShare } from '@/components/FacilitatorScreenShare';
import { PhasePausedView } from '@/components/PhasePausedView';
import { GeneralDashboard } from '@/components/GeneralDashboard';



// DEBUG: Toggle this to enable user switching for development/testing
const DEBUG_ENABLE_USER_SWITCHING = true;

export function WorkshopDemoLanding() {
  // ========================================
  // ALL HOOKS MUST BE CALLED FIRST (React Rules of Hooks)
  // ========================================
  const { workshopId, setWorkshopId } = useWorkshopContext();
  const { currentPhase, completedPhases, setCurrentPhase } = useWorkflowContext();
  const { user, setUser } = useUser();
  const { isFacilitator, isSME, canCreateRubric, canAnnotate, canViewResults, canViewRubric, canViewAllAnnotations } = useRoleCheck();
  const queryClient = useQueryClient();
  
  const { data: workshop, error: workshopError } = useWorkshop(workshopId || '');
  const { data: rubric } = useRubric(workshopId || '');
  
  // State hooks - MUST be before any conditional returns
  const [isManualNavigation, setIsManualNavigation] = React.useState(false);
  const [currentView, setCurrentView] = React.useState<string>('loading'); // Initialize with loading
  
  // Helper function that accepts explicit state values to avoid race conditions
  const getViewForPhaseWithState = (
    role: string | undefined, 
    requestedPhase: string, 
    state: {
      currentPhase: string;
      completedPhases: string[];
      discovery_started: boolean;
      annotation_started: boolean;
    }
  ) => {
    if (!role) return 'loading';
    
    // FACILITATOR - Simple backend-driven navigation
    if (role === 'facilitator') {
      switch(requestedPhase) {
        case 'intake': return 'intake';
        case 'user-management': return 'user-management';
        case 'discovery': 
          // Show start page ONLY if discovery has never been started
          if (!state.discovery_started) {
            return 'discovery-start';
          }
          // Otherwise show monitor (discovery has been started)
          return 'discovery-monitor';
        case 'rubric': return 'rubric-create';
        case 'annotation': 
          // Show start page ONLY if annotation has never been started
          if (!state.annotation_started) {
            return 'annotation-start';
          }
          // Otherwise show monitor (annotation has been started)
          return 'annotation-monitor';
        case 'results': return 'results-view';
        case 'judge_tuning': return 'judge-tuning';
        case 'unity_volume': return 'unity-volume';
        default: return 'dashboard-general';
      }
    }
    
    // SME/PARTICIPANT - Handle facilitator-only phases first
    if (['intake', 'rubric', 'results', 'judge_tuning', 'unity_volume'].includes(requestedPhase)) {
      return 'facilitator-screen-share';
    }
    
    // For participatory phases - frontend-driven logic: phase active AND not paused AND started
    const isPhaseActive = (phase: string) => {
      const isPaused = state.completedPhases.includes(phase);
      const hasStarted = phase === 'annotation' ? state.annotation_started : 
                        phase === 'discovery' ? state.discovery_started : true;
      const isActive = state.currentPhase === phase && !isPaused && hasStarted;
      return isActive;
    };
    
    switch(requestedPhase) {
      case 'discovery': 
        if (isPhaseActive('discovery')) return 'discovery-participate';
        if (state.currentPhase === 'discovery') return 'discovery-complete'; // Paused
        if (['rubric', 'annotation', 'results', 'judge_tuning', 'unity_volume'].includes(state.currentPhase)) return 'discovery-complete';
        return 'discovery-pending';
      case 'annotation':
        if (isPhaseActive('annotation')) {
          return 'annotation-participate';
        }
        if (state.currentPhase === 'annotation') {
          return 'annotation-review'; // Paused
        }
        if (['results', 'judge_tuning', 'unity_volume'].includes(state.currentPhase)) {
          return 'annotation-review';
        }
        return 'annotation-pending';
      default: return 'phase-waiting';
    }
  };
  
  // State for auto-recovery - using ref to prevent infinite loops
  const [isAutoRecovering, setIsAutoRecovering] = React.useState(false);
  const hasAttemptedRecovery = React.useRef(false);
  const createWorkshop = useCreateWorkshop();

  // Effect: Handle case where workshop doesn't exist (404/500 error) with auto-recovery
  React.useEffect(() => {
    // Prevent infinite loops - only attempt recovery once
    if (workshopError && !isAutoRecovering && !hasAttemptedRecovery.current) {
      const is404Error = (
        ('status' in workshopError && (workshopError as any).status === 404) ||
        ('response' in workshopError && (workshopError as any).response?.status === 404) ||
        (workshopError instanceof Error && workshopError.message?.includes('404'))
      );
      
      const is500Error = (
        ('status' in workshopError && (workshopError as any).status === 500) ||
        ('response' in workshopError && (workshopError as any).response?.status === 500) ||
        (workshopError instanceof Error && workshopError.message?.includes('500')) ||
        (workshopError instanceof Error && workshopError.message?.includes('Internal Server Error'))
      );
      
      if ((is404Error || is500Error) && workshopId) {
        // Mark that we've attempted recovery to prevent infinite loops
        hasAttemptedRecovery.current = true;
        
        // Clear the invalid workshop ID and all related data
        localStorage.removeItem('workshop_id');
        localStorage.removeItem('workshop_user');
        // Clear any other workshop-related data
        Object.keys(localStorage).forEach(key => {
          if (key.startsWith('workshop_') || key.includes('trace') || key.includes('annotation')) {
            localStorage.removeItem(key);
          }
        });
        
        // If user is a facilitator, auto-create a new workshop
        if (user?.role === 'facilitator') {
          setIsAutoRecovering(true);
          
          createWorkshop.mutateAsync({
            name: `LLM Judge Calibration Workshop`,
            description: 'A collaborative workshop to calibrate LLM judges through structured evaluation and consensus building.',
            facilitator_id: user.id
          }).then((newWorkshop) => {
            setWorkshopId(newWorkshop.id);
            window.history.replaceState({}, '', `?workshop=${newWorkshop.id}`);
            setIsAutoRecovering(false);
            // Reset recovery flag after successful creation
            setTimeout(() => {
              hasAttemptedRecovery.current = false;
            }, 1000);
          }).catch((error) => {
            setWorkshopId(null);
            setIsAutoRecovering(false);
            // Reset recovery flag after failure
            hasAttemptedRecovery.current = false;
          });
        } else {
          // For non-facilitators, just clear and redirect
          setWorkshopId(null);
          // Don't use timeout with location.href as it can cause loops
          window.history.replaceState({}, '', '/');
        }
      }
    }
  }, [workshopError, workshopId, user?.role, isAutoRecovering]);
  
  // Track previous phase and user to detect actual changes
  const previousPhaseRef = React.useRef<string | null>(null);
  const previousUserIdRef = React.useRef<string | null>(null);
  const previousUserRoleRef = React.useRef<string | null>(null);
  
  // Effect: Initialize currentView after data loads
  // Skip if user has manually navigated (facilitator navigating sidebar)
  React.useEffect(() => {
    if (user && workshop && user.role) {
      // Detect user/role changes - force recalculation when user switches
      const isUserChange = previousUserIdRef.current !== null && previousUserIdRef.current !== user.id;
      const isRoleChange = previousUserRoleRef.current !== null && previousUserRoleRef.current !== user.role;
      
      // For facilitators, only auto-update view on actual phase changes, not on every workshop data update
      const isPhaseChange = previousPhaseRef.current !== null && previousPhaseRef.current !== currentPhase;
      const isInitialLoad = currentView === 'loading';
      
      // Update refs for next comparison
      previousUserIdRef.current = user.id;
      previousUserRoleRef.current = user.role;
      
      // Skip auto-update if user has manually navigated and this isn't a phase/user/role change or initial load
      // This applies to ALL roles, not just facilitators
      if (isManualNavigation && !isInitialLoad && !isPhaseChange && !isUserChange && !isRoleChange) {
        previousPhaseRef.current = currentPhase;
        return;
      }
      
      // Reset manual navigation flag on phase change (backend phase changed, need to re-sync)
      if (isPhaseChange) {
        setIsManualNavigation(false);
      }
      
      previousPhaseRef.current = currentPhase;
      
      let view;
      
      if (currentPhase === 'intake') {
        view = getViewForPhaseWithState(user.role, 'intake', {
          currentPhase,
          completedPhases: workshop.completed_phases || [],
          discovery_started: workshop.discovery_started || false,
          annotation_started: workshop.annotation_started || false
        });
      } else if (currentPhase === 'discovery') {
        view = getViewForPhaseWithState(user.role, 'discovery', {
          currentPhase,
          completedPhases: workshop.completed_phases || [],
          discovery_started: workshop.discovery_started || false,
          annotation_started: workshop.annotation_started || false
        });
      } else if (currentPhase === 'rubric') {
        view = getViewForPhaseWithState(user.role, 'rubric', {
          currentPhase,
          completedPhases: workshop.completed_phases || [],
          discovery_started: workshop.discovery_started || false,
          annotation_started: workshop.annotation_started || false
        });
      } else if (currentPhase === 'annotation') {
        view = getViewForPhaseWithState(user.role, 'annotation', {
          currentPhase,
          completedPhases: workshop.completed_phases || [],
          discovery_started: workshop.discovery_started || false,
          annotation_started: workshop.annotation_started || false
        });
      } else if (currentPhase === 'results') {
        view = getViewForPhaseWithState(user.role, 'results', {
          currentPhase,
          completedPhases: workshop.completed_phases || [],
          discovery_started: workshop.discovery_started || false,
          annotation_started: workshop.annotation_started || false
        });
      } else if (currentPhase === 'judge_tuning') {
        view = getViewForPhaseWithState(user.role, 'judge_tuning', {
          currentPhase,
          completedPhases: workshop.completed_phases || [],
          discovery_started: workshop.discovery_started || false,
          annotation_started: workshop.annotation_started || false
        });
      } else if (currentPhase === 'unity_volume') {
        view = getViewForPhaseWithState(user.role, 'unity_volume', {
          currentPhase,
          completedPhases: workshop.completed_phases || [],
          discovery_started: workshop.discovery_started || false,
          annotation_started: workshop.annotation_started || false
        });
      } else {
        view = getViewForPhaseWithState(user.role, 'discovery', {
          currentPhase,
          completedPhases: workshop.completed_phases || [],
          discovery_started: workshop.discovery_started || false,
          annotation_started: workshop.annotation_started || false
        });
      }
      
      setCurrentView(view);
    }
  }, [user, workshop, currentPhase, currentView]);
  
  // ========================================
  // CONDITIONAL LOGIC AND EARLY RETURNS
  // ========================================
  
  // Early return for no user
  if (!user) {
    return <ProductionLogin />;
  }

  // Check if this is a temporary workshop ID for creation mode
  const isWorkshopCreationMode = workshopId && workshopId.startsWith('temp-');
  
  // If no workshopId or it's a temporary ID for creation, show appropriate view
  if (!workshopId || isWorkshopCreationMode) {
    if (isFacilitator) {
      return <WorkshopCreationPage />;
    } else {
      return <ProductionLogin />;
    }
  }
  
  // Show auto-recovery screen while handling invalid workshop
  if (workshopError) {
    const is404Error = (
      ('status' in workshopError && (workshopError as any).status === 404) ||
      ('response' in workshopError && (workshopError as any).response?.status === 404) ||
      (workshopError instanceof Error && workshopError.message?.includes('404'))
    );
    
    if (is404Error) {
      if (isFacilitator && isAutoRecovering) {
        return (
          <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
            <Card className="max-w-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <Settings className="h-5 w-5 text-blue-600 animate-spin" />
                  Auto-Recovery in Progress
                </CardTitle>
                <CardDescription>
                  Creating a new workshop for you...
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4">
                  The previous workshop ID was invalid. We're automatically creating a new workshop for you.
                </p>
                <div className="text-xs text-gray-500 font-mono bg-gray-100 p-2 rounded mb-4">
                  Previous ID: {workshopId}
                </div>
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      } else if (isFacilitator && !isAutoRecovering) {
        return (
          <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
            <Card className="max-w-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  Workshop Not Found
                </CardTitle>
                <CardDescription>
                  Clearing invalid workshop data...
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4">
                  The workshop ID doesn't exist. Redirecting to workshop creation...
                </p>
                <div className="text-xs text-gray-500 font-mono bg-gray-100 p-2 rounded mb-4">
                  Invalid Workshop ID: {workshopId}
                </div>
                <div className="flex items-center justify-center">
                  <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-gray-900"></div>
                </div>
              </CardContent>
            </Card>
          </div>
        );
      } else {
        return (
          <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
            <Card className="max-w-md">
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <AlertCircle className="h-5 w-5 text-red-600" />
                  Workshop Not Found
                </CardTitle>
                <CardDescription>
                  The workshop ID in the URL does not exist
                </CardDescription>
              </CardHeader>
              <CardContent>
                <p className="text-sm text-gray-600 mb-4">
                  The workshop you're trying to access doesn't exist or has been deleted.
                  Please contact your workshop facilitator for a valid workshop link.
                </p>
                <div className="text-xs text-gray-500 font-mono bg-gray-100 p-2 rounded">
                  Workshop ID: {workshopId}
                </div>
              </CardContent>
            </Card>
          </div>
        );
      }
    }
  }
  
  // Simple, robust navigation - facilitators can navigate anywhere, SME/participants have restricted access
  const getViewForPhase = (role: string | undefined, requestedPhase: string) => {
    return getViewForPhaseWithState(role, requestedPhase, {
      currentPhase,
      completedPhases: workshop?.completed_phases || [],
      discovery_started: workshop?.discovery_started || false,
      annotation_started: workshop?.annotation_started || false
    });
  };

  
  // Calculate initial view based on user role and current workshop phase
  // (This function is called from the useEffect at the top of the component)
  
  // Simple navigation handler
  const handleNavigation = (requestedPhase: string) => {
    const view = getViewForPhase(user?.role, requestedPhase);
    setIsManualNavigation(true);  // Mark that user manually navigated
    setCurrentView(view);
  };
  
  // ========================================
  // MAIN VIEW RENDERING

  // Function to render the current view based on currentView state
  const renderCurrentView = () => {
    switch (currentView) {
      case 'intake':
        return <IntakePage />;
      case 'intake-waiting':
        return <IntakeWaitingView />;
      case 'facilitator-screen-share':
        return <FacilitatorScreenShare phase={currentPhase} />;
      case 'discovery-start':
        return <DiscoveryStartPage onStartDiscovery={() => {
          setIsManualNavigation(true);
          setCurrentView('discovery-monitor');
        }} />;
      case 'discovery-pending':
        return <DiscoveryPendingPage />;
      case 'discovery-monitor':
        return <FacilitatorDashboard onNavigate={handleNavigation} focusPhase={'discovery'} />;
      case 'discovery-participate':
        return <TraceViewerDemo />;
      case 'discovery-complete':
        return <PhasePausedView phase="discovery" onBack={user?.role === 'facilitator' ? () => handleNavigation('discovery') : undefined} />;
      case 'annotation-start':
        return <AnnotationStartPage onStartAnnotation={() => {
          setIsManualNavigation(true);
          setCurrentView('annotation-monitor');
        }} />;
      case 'annotation-pending':
        return <AnnotationPendingPage />;
      case 'rubric-create':
        return <RubricCreationDemo />;
      case 'rubric-waiting':
        return <RubricWaitingView />;
      case 'rubric-view':
        return <RubricViewPage />;
      case 'annotation-monitor':
        return <FacilitatorDashboard onNavigate={handleNavigation} focusPhase={'annotation'} />;
      case 'annotation-participate':
        return <AnnotationDemo />;
      case 'annotation-waiting':
        return <AnnotationWaitingView />;
      case 'annotation-complete':
        return <IRRResultsDemo />;
      case 'annotation-review':
        return <PhasePausedView phase="annotation" onBack={user?.role === 'facilitator' ? () => handleNavigation('annotation') : undefined} />;
      case 'results-view':
        return <IRRResultsDemo />;
      case 'results-waiting':
        return <ResultsWaitingView />;
      case 'judge-tuning':
        return <JudgeTuningPage />;
      case 'dbsql-export':
        return <DBSQLExportPage />;
      case 'unity-volume':
        return <UnityVolumePage />;
      case 'findings-review':
        return <FindingsReviewPage onBack={() => setCurrentView('discovery-monitor')} />;
      case 'assign-annotations':
        return <AnnotationAssignmentManager />;
      case 'user-management':
        return <FacilitatorUserManager />;

      case 'dashboard-general':
        return <GeneralDashboard onNavigate={handleNavigation} />;
      case 'trace-viewer':
        return <TraceViewerDemo />;
      case 'phase-complete':
      case 'phase-waiting':
      case 'phase-not-started':
        return <ResultsWaitingView />;  // Generic waiting view for now
      case 'loading':
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Loading...</div>
          </div>
        );
      default:
        return (
          <div className="flex items-center justify-center h-full">
            <div className="text-gray-500">Please select a user to continue</div>
          </div>
        );
    }
  };
  


  return (
    <div className="h-screen flex overflow-hidden bg-background">
      {/* Sidebar */}
      <AppSidebar 
        onNavigate={handleNavigation} 
        showUserSwitching={DEBUG_ENABLE_USER_SWITCHING}
      />

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0 h-screen overflow-hidden">
        {/* Workshop Header */}
        <WorkshopHeader 
          showDescription={true}
          showPhase={true}
          showParticipantCount={false}
          variant="default"
        />
        
        {/* Main Content - scrollable, contained */}
        <div className="flex-1 overflow-y-auto overflow-x-hidden">
          {(() => {
            // Normal rendering logic  
            if (currentView === 'loading' || !user?.role) {
              return (
                <div className="h-full flex items-center justify-center">
                  <div className="text-center text-slate-500">
                    <div className="w-16 h-16 bg-slate-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
                      <Settings className="h-8 w-8 text-slate-400" />
                    </div>
                    <h3 className="text-lg font-semibold text-slate-700 mb-2">Loading...</h3>
                    <p className="text-sm">Setting up your workspace</p>
                  </div>
                </div>
              );
            }
            
            // Render the appropriate component
            return renderCurrentView();
          })()}
        </div>
      </div>
    </div>
  );
}