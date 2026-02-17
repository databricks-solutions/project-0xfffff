import React from 'react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useWorkflowContext } from '@/context/WorkflowContext';
import { useUser, useRoleCheck } from '@/context/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useFacilitatorFindings, useFacilitatorFindingsWithUserDetails, useTraces, useAllTraces, useRubric, useFacilitatorAnnotations, useFacilitatorAnnotationsWithUserDetails, useWorkshop, useDiscoveryFeedback } from '@/hooks/useWorkshopApi';
import { Settings, Users, FileText, CheckCircle, Clock, AlertCircle, ChevronRight, Play, Eye, Plus, RotateCcw, Target, TrendingUp, Activity, MessageSquare, ChevronDown } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useQueryClient } from '@tanstack/react-query';
import { PhaseControlButton } from './PhaseControlButton';
import { JsonPathSettings } from './JsonPathSettings';
import { toast } from 'sonner';
import { parseRubricQuestions } from '@/utils/rubricUtils';
import type { DiscoveryFinding, Annotation } from '@/client';

/** Finding extended with user details from the /findings-with-users endpoint */
interface FindingWithUser extends DiscoveryFinding {
  user_name?: string;
  user_email?: string;
  user_role?: string;
}

/** Annotation extended with user details from the /annotations-with-users endpoint */
interface AnnotationWithUser extends Annotation {
  user_name?: string;
  user_email?: string;
  user_role?: string;
}

/** Shape of each element in the traceCoverageDetails computed array */
interface TraceCoverageDetail {
  traceId: string;
  input: string;
  reviewCount: number;
  uniqueReviewers: number;
  reviewers: string[];
  isFullyReviewed: boolean;
}

interface FacilitatorDashboardProps {
  onNavigate: (phase: string) => void;
  focusPhase?: 'discovery' | 'annotation' | null; // Highlight specific phase when accessed from workflow
}

export const FacilitatorDashboard: React.FC<FacilitatorDashboardProps> = ({ onNavigate, focusPhase = null }) => {
  const { workshopId } = useWorkshopContext();
  const { currentPhase, setCurrentPhase } = useWorkflowContext();
  const { user } = useUser();
  const { isFacilitator } = useRoleCheck();
  const queryClient = useQueryClient();

  // Get all workshop data
  const { data: workshop } = useWorkshop(workshopId!);
  const { data: allFindings } = useFacilitatorFindings(workshopId!);
  const { data: allFindingsWithUserDetails } = useFacilitatorFindingsWithUserDetails(workshopId!);
  // Facilitators viewing all traces - don't need personalized ordering
  const { data: traces } = useAllTraces(workshopId!);
  const { data: rubric } = useRubric(workshopId!);
  const { data: annotations } = useFacilitatorAnnotations(workshopId!);
  const { data: annotationsWithUserDetails } = useFacilitatorAnnotationsWithUserDetails(workshopId!);

  // Additional traces functionality - separate state for each phase
  const [discoveryTracesCount, setDiscoveryTracesCount] = React.useState<string>('');
  const [annotationTracesCount, setAnnotationTracesCount] = React.useState<string>('');
  const [isAddingTraces, setIsAddingTraces] = React.useState(false);
  const [isReorderingTraces, setIsReorderingTraces] = React.useState(false);
  const [isResettingDiscovery, setIsResettingDiscovery] = React.useState(false);
  const [isResettingAnnotation, setIsResettingAnnotation] = React.useState(false);

  // Calculate progress metrics
  // For discovery: use active discovery traces count or all traces
  const discoveryTraceCount = ((workshop?.current_phase === 'discovery' || focusPhase === 'discovery') && workshop?.active_discovery_trace_ids?.length)
    ? workshop.active_discovery_trace_ids.length
    : (traces?.length || 0);

  // For annotation: use active annotation traces count or all traces
  const annotationTraceCount = (workshop?.current_phase === 'annotation' && workshop?.active_annotation_trace_ids?.length)
    ? workshop.active_annotation_trace_ids.length
    : (traces?.length || 0);

  const totalTraces = traces?.length || 0; // Keep for general use
  const tracesWithFindings = allFindings ? new Set(allFindings.map(f => f.trace_id)) : new Set();
  const completedDiscoveryTraces = Math.min(tracesWithFindings.size, discoveryTraceCount);
  const discoveryProgress = discoveryTraceCount > 0 ? (completedDiscoveryTraces / discoveryTraceCount) * 100 : 0;

  // Get user participation stats with user names
  const activeUsers = allFindings ? new Set(allFindings.map(f => f.user_id)) : new Set();

  // For annotation phase, use annotation-based active users
  const activeAnnotators = annotations ? new Set(annotations.map(a => a.user_id)) : new Set();

  // Calculate user contributions based on phase
  const userContributions = React.useMemo(() => {
    if (focusPhase === 'annotation') {
      // Use annotations with user details
      return annotationsWithUserDetails ?
        Object.entries(
          annotationsWithUserDetails.reduce((acc, annotation) => {
            const userId = annotation.user_id;
            if (!acc[userId]) {
              acc[userId] = { count: 0, userName: annotation.user_name || userId };
            }
            acc[userId].count += 1;
            return acc;
          }, {} as Record<string, { count: number; userName: string }>)
        ).map(([userId, data]) => ({ userId, userName: data.userName, count: data.count }))
        : [];
    } else {
      // Use discovery findings with user details (default)
      return allFindingsWithUserDetails ?
        Object.entries(
          allFindingsWithUserDetails.reduce((acc, finding) => {
            const userId = finding.user_id;
            if (!acc[userId]) {
              acc[userId] = { count: 0, userName: finding.user_name || userId };
            }
            acc[userId].count += 1;
            return acc;
          }, {} as Record<string, { count: number; userName: string }>)
        ).map(([userId, data]) => ({ userId, userName: data.userName, count: data.count }))
        : [];
    }
  }, [focusPhase, allFindingsWithUserDetails, annotationsWithUserDetails]);

  // Calculate trace coverage details
  const traceCoverageDetails = React.useMemo(() => {
    if (!traces || !allFindings) return [];


    // Filter traces based on focusPhase
    let relevantTraces = traces;
    if (focusPhase === 'discovery' && workshop?.active_discovery_trace_ids?.length) {
      relevantTraces = traces.filter(trace => workshop.active_discovery_trace_ids.includes(trace.id));
    } else if (focusPhase === 'annotation') {
      // For annotation phase: show all traces that have annotations OR are in active_annotation_trace_ids
      if (annotations && annotations.length > 0) {
        const annotatedTraceIds = new Set(annotations.map(a => a.trace_id));
        const activeTraceIds = new Set(workshop?.active_annotation_trace_ids || []);
        const allRelevantIds = new Set([...annotatedTraceIds, ...activeTraceIds]);

        relevantTraces = traces.filter(trace => allRelevantIds.has(trace.id));
      } else if (workshop?.active_annotation_trace_ids?.length) {
        // Fallback: use active_annotation_trace_ids if no annotations yet
        relevantTraces = traces.filter(trace => workshop.active_annotation_trace_ids.includes(trace.id));
      }
    }

    return relevantTraces.map(trace => {
      // Use different data source based on focus phase
      if (focusPhase === 'annotation' && annotations) {
        const annotationsForTrace = annotations.filter(a => a.trace_id === trace.id);
        const reviewerIds = new Set(annotationsForTrace.map(a => a.user_id));

        // Use activeAnnotators instead of activeUsers for annotation phase
        const minReviewers = Math.min(2, activeAnnotators.size); // At least 2 reviewers for IRR

        return {
          traceId: trace.mlflow_trace_id || trace.id,
          input: trace.input,
          reviewCount: annotationsForTrace.length,
          uniqueReviewers: reviewerIds.size,
          reviewers: Array.from(reviewerIds),
          isFullyReviewed: activeAnnotators.size > 0 && reviewerIds.size >= minReviewers
        };
      } else {
        // Default to discovery findings
        const findingsForTrace = allFindings.filter(f => f.trace_id === trace.id);
        const reviewerIds = new Set(findingsForTrace.map(f => f.user_id));

        return {
          traceId: trace.mlflow_trace_id || trace.id,
          input: trace.input,
          reviewCount: findingsForTrace.length,
          uniqueReviewers: reviewerIds.size,
          reviewers: Array.from(reviewerIds),
          isFullyReviewed: activeUsers.size > 0 && reviewerIds.size >= Math.min(3, activeUsers.size) // Consider "full" only if there are active users and sufficient reviews
        };
      }
    })
    // Sort: completed first, then in progress, then pending (by review count)
    .sort((a, b) => {
      // Completed traces first
      if (a.isFullyReviewed && !b.isFullyReviewed) return -1;
      if (!a.isFullyReviewed && b.isFullyReviewed) return 1;
      // Then sort by review count (most reviews first)
      return b.reviewCount - a.reviewCount;
    });
  }, [traces, allFindings, annotations, activeUsers.size, activeAnnotators.size, focusPhase, workshop?.active_discovery_trace_ids, workshop?.active_annotation_trace_ids]);

  // Annotation progress
  const tracesWithAnnotations = annotations ? new Set(annotations.map(a => a.trace_id)) : new Set();
  const annotationProgress = annotationTraceCount > 0 ? (tracesWithAnnotations.size / annotationTraceCount) * 100 : 0;

  // Determine effective judge type from parsed rubric questions (per-question type takes precedence)
  // This must be computed before annotationMetrics since it depends on this
  const effectiveJudgeType = React.useMemo(() => {
    if (!rubric?.question) return rubric?.judge_type || 'likert';

    // Parse the rubric questions to get per-question judge types
    const questions = parseRubricQuestions(rubric.question);
    if (questions.length > 0) {
      return questions[0].judgeType || rubric?.judge_type || 'likert';
    }
    return rubric?.judge_type || 'likert';
  }, [rubric]);

  // Discovery metrics for focused view
  const discoveryMetrics = React.useMemo(() => {
    if (!allFindings) return { totalFindings: 0, smeFindings: 0, participantFindings: 0, avgFindingsPerTrace: 0 };

    const findingsToUse = (allFindingsWithUserDetails || allFindings) as FindingWithUser[];
    const smeFindings = findingsToUse.filter((f: FindingWithUser) => f.user_role === 'sme');
    const participantFindings = findingsToUse.filter((f: FindingWithUser) => f.user_role !== 'sme');
    const avgFindingsPerTrace = tracesWithFindings.size > 0
      ? Math.round((allFindings.length / tracesWithFindings.size) * 10) / 10
      : 0;

    return {
      totalFindings: allFindings.length,
      smeFindings: smeFindings.length,
      participantFindings: participantFindings.length,
      avgFindingsPerTrace,
    };
  }, [allFindings, allFindingsWithUserDetails, tracesWithFindings.size]);

  // Annotation metrics for focused view
  const annotationMetrics = React.useMemo(() => {
    if (!annotations) return { smeCount: 0, participantCount: 0, avgRating: 0, ratingDistribution: {} };

    // Use annotationsWithUserDetails if available (has user_role), otherwise fall back to basic annotations
    const annotationsToUse = annotationsWithUserDetails || annotations;

    // Separate SME and participant annotations using actual role data
    const smeAnnotations = (annotationsToUse as AnnotationWithUser[]).filter((a: AnnotationWithUser) => a.user_role === 'sme');
    const participantAnnotations = (annotationsToUse as AnnotationWithUser[]).filter((a: AnnotationWithUser) => a.user_role !== 'sme');

    // Helper to get the actual rating from annotation based on judge type
    const getRating = (a: Annotation | AnnotationWithUser): number | null => {
      if (effectiveJudgeType === 'binary') {
        // For binary, get from ratings object first
        if (a.ratings && typeof a.ratings === 'object') {
          const values = Object.values(a.ratings) as number[];
          for (const v of values) {
            if (v === 0 || v === 1) return v;
          }
        }
        // Fallback to legacy rating only if it's 0 or 1
        if (a.rating === 0 || a.rating === 1) return a.rating;
        return null; // Invalid binary rating
      } else {
        // For likert, use legacy rating field
        return a.rating;
      }
    };

    // Calculate average rating (only for valid ratings)
    const validRatings = annotationsToUse.map(getRating).filter(r => r !== null) as number[];
    const avgRating = validRatings.length > 0 ?
      validRatings.reduce((sum, r) => sum + r, 0) / validRatings.length : 0;

    // Rating distribution (based on actual ratings)
    const ratingDistribution = validRatings.reduce((dist, rating) => {
      dist[rating] = (dist[rating] || 0) + 1;
      return dist;
    }, {} as Record<number, number>);

    return {
      smeCount: smeAnnotations.length,
      participantCount: participantAnnotations.length,
      avgRating: Math.round(avgRating * 10) / 10,
      ratingDistribution
    };
  }, [annotations, annotationsWithUserDetails, effectiveJudgeType]);

  // Redirect non-facilitators (after all hooks)
  if (!isFacilitator) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <div className="text-lg font-medium text-slate-900 mb-2">
            Facilitator Access Required
          </div>
          <div className="text-sm text-slate-600">
            This dashboard is only available to workshop facilitators
          </div>
        </div>
      </div>
    );
  }

  // Phase advancement logic
  const getNextPhase = () => {
    const phaseOrder = ['intake', 'discovery', 'rubric', 'annotation', 'results'];
    const currentIndex = phaseOrder.indexOf(currentPhase);
    return currentIndex < phaseOrder.length - 1 ? phaseOrder[currentIndex + 1] : null;
  };

  const getPhaseAdvancementText = () => {
    const nextPhase = getNextPhase();
    if (!nextPhase) return null;
    
    const phaseNames = {
      'discovery': 'Discovery',
      'rubric': 'Rubric Creation', 
      'annotation': 'Annotation',
      'results': 'Results Review'
    };
    
    return `Start ${phaseNames[nextPhase as keyof typeof phaseNames] || nextPhase}`;
  };

  const canAdvancePhase = () => {
    return getNextPhase() !== null;
  };

  const handleAdvancePhase = async () => {
    const nextPhase = getNextPhase();
    if (!nextPhase) return;
    
    const confirmMessage = `Ready to start the ${nextPhase} phase?\n\nThis will move the workshop forward for all participants. Current progress:\n• Discovery: ${Math.round(discoveryProgress)}% complete\n• Active users: ${activeUsers.size}`;
    
    if (!confirm(confirmMessage)) {
      return;
    }
    
    try {
      // Use specific validated endpoint
      const endpoint = `/workshops/${workshopId}/advance-to-${nextPhase}`;
      const response = await fetch(endpoint, { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to advance phase');
      }
      
      const result = await response.json();
      
      // Update local state
      setCurrentPhase(nextPhase);
      
      // Clear React Query cache to refresh all data
      queryClient.invalidateQueries();
      
    } catch (error: unknown) {
      toast.error('Could not start phase', { description: error instanceof Error ? error.message : String(error) });
    }
  };

  const handleAddAdditionalTraces = async () => {
    const phase = focusPhase || currentPhase;
    const phaseLabel = phase === 'annotation' ? 'annotation' : 'discovery';
    
    // Use appropriate count state based on phase
    const countValue = phase === 'annotation' ? annotationTracesCount : discoveryTracesCount;
    const setCountValue = phase === 'annotation' ? setAnnotationTracesCount : setDiscoveryTracesCount;
    
    const count = parseInt(countValue);
    if (!count || count <= 0) {
      toast.error('Invalid input', { description: 'Please enter a valid number of traces to add.' });
      return;
    }
    
    setIsAddingTraces(true);
    try {
      const requestBody = { 
        additional_count: count,
        phase: phase === 'annotation' ? 'annotation' : 'discovery'
      };
      
      // Use unified endpoint with explicit phase parameter
      const response = await fetch(`/workshops/${workshopId}/add-traces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody),
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to add traces');
      }

      const result = await response.json();
      
      // Clear the appropriate input and refresh data
      setCountValue('');
      
      // Force refetch of workshop data with more aggressive invalidation
      await queryClient.refetchQueries({ queryKey: ['workshop', workshopId] });
      await queryClient.refetchQueries({ queryKey: ['traces', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['findings', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['annotations', workshopId] });
      
      // Show success message with auto-evaluation status for annotation phase
      if (phase === 'annotation' && result.auto_evaluation_started) {
        toast.success('Traces added', { description: `${result.traces_added} traces added to ${phaseLabel}. Auto-evaluation started in background.` });
      } else {
        toast.success('Traces added', { description: `${result.traces_added} traces added to ${phaseLabel}. Total: ${result.total_active_traces}.` });
      }
    } catch (error: unknown) {
      toast.error('Could not add traces', { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsAddingTraces(false);
    }
  };

  const handleReorderAnnotationTraces = async () => {
    setIsReorderingTraces(true);
    try {
      const response = await fetch(`/workshops/${workshopId}/reorder-annotation-traces`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to reorder traces');
      }

      const result = await response.json();
      
      // Refresh data
      await queryClient.refetchQueries({ queryKey: ['workshop', workshopId] });
      await queryClient.refetchQueries({ queryKey: ['traces', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['annotations', workshopId] });
      
      toast.success('Traces reordered', { description: `${result.reordered_count} traces reordered. Completed traces now appear first.` });
    } catch (error: unknown) {
      toast.error('Could not reorder traces', { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsReorderingTraces(false);
    }
  };

  const handleResetDiscovery = async () => {
    if (!workshopId) return;
    
    setIsResettingDiscovery(true);
    try {
      const response = await fetch(`/workshops/${workshopId}/reset-discovery`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to reset discovery');
      }

      // Invalidate ALL discovery-related caches comprehensively
      // This ensures participants see a fresh start
      queryClient.invalidateQueries({ queryKey: ['workshop', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['all-traces', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['findings', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['user-findings', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['facilitator-findings-with-users', workshopId] });
      
      // Invalidate ALL trace queries for this workshop (including user-specific ones)
      // The participant trace query key is ['traces', workshopId, userId]
      queryClient.invalidateQueries({ 
        predicate: (query) => {
          const key = query.queryKey;
          return Array.isArray(key) && key[0] === 'traces' && key[1] === workshopId;
        }
      });
      
      toast.success('Discovery reset', { description: 'All participant progress cleared. Select your trace configuration.' });

      // Force page reload to reflect phase change
      window.location.reload();
    } catch (error: unknown) {
      toast.error('Could not reset discovery', { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsResettingDiscovery(false);
    }
  };

  const handleResetAnnotation = async () => {
    if (!workshopId) return;
    
    setIsResettingAnnotation(true);
    try {
      const response = await fetch(`/workshops/${workshopId}/reset-annotation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to reset annotation');
      }

      // Set fresh start flag so AnnotationDemo starts from trace 1 after reset
      localStorage.setItem(`annotation-fresh-start-${workshopId}`, 'true');

      // Invalidate annotation-related caches
      queryClient.invalidateQueries({ queryKey: ['workshop', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['annotations', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['all-traces', workshopId] });
      
      toast.success('Annotation reset', { description: 'All SME progress cleared. Select your trace configuration.' });

      // Force page reload to reflect phase change
      window.location.reload();
    } catch (error: unknown) {
      toast.error('Could not reset annotation', { description: error instanceof Error ? error.message : String(error) });
    } finally {
      setIsResettingAnnotation(false);
    }
  };

  return (
    <div className="p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between gap-3 mb-6">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-emerald-100">
              <Activity className="w-5 h-5 text-emerald-600" />
            </div>
            <div>
              <h1 className="text-xl font-semibold text-gray-900">
                {focusPhase === 'discovery' ? 'Discovery Monitoring' :
                 focusPhase === 'annotation' ? 'Annotation Monitoring' :
                 'Dashboard'}
              </h1>
              <p className="text-sm text-gray-500">
                {focusPhase === 'discovery' ? 'Monitor participant progress and insights' :
                 focusPhase === 'annotation' ? 'Monitor SME annotation progress' :
                 'Workshop progress and management'}
              </p>
            </div>
          </div>

          {/* Advance Phase Button */}
          {canAdvancePhase() && !focusPhase && (
            <Button
              onClick={handleAdvancePhase}
              size="sm"
            >
              <Play className="w-4 h-4 mr-1.5" />
              {getPhaseAdvancementText()}
              <ChevronRight className="w-4 h-4 ml-1" />
            </Button>
          )}
        </div>

        {/* Overall Progress Cards */}
        <div className={`grid grid-cols-1 gap-6 ${
          focusPhase === 'discovery' ? 'md:grid-cols-1 max-w-md mx-auto' :
          focusPhase === 'annotation' ? 'md:grid-cols-1 max-w-md mx-auto' :
          'md:grid-cols-3'
        }`}>
          {/* Discovery Progress - Hide during annotation focus, always show otherwise */}
          {focusPhase !== 'annotation' && (
          <Card className={`border-l-4 border-green-500 bg-gradient-to-br from-green-50 to-white ${
            focusPhase === 'discovery' ? 'ring-2 ring-green-400 shadow-lg' : ''
          }`}>
            <CardContent className="pt-6">
              <div className="flex items-start justify-between mb-4">
                <div>
                  <div className="flex items-center gap-2 mb-1">
                    <FileText className="w-5 h-5 text-green-600" />
                    <p className="text-sm font-medium text-gray-600">Discovery Phase</p>
                  </div>
                  {(() => {
                    if (discoveryProgress === 100) {
                      return <Badge className="mt-2 bg-emerald-100 text-emerald-700 border-emerald-200">Completed</Badge>;
                    } else if (focusPhase === 'discovery') {
                      return <Badge className="mt-2 bg-blue-100 text-blue-700 border-blue-200">Viewing</Badge>;
                    }
                    return null;
                  })()}
                </div>
                <Activity className="h-8 w-8 text-green-600" />
              </div>
              <div className="space-y-3">
                {(currentPhase === 'discovery' || focusPhase === 'discovery') ? (
                  <>
                    <div className="flex justify-between items-center">
                      <span className="text-sm text-gray-600">Traces Analyzed</span>
                      <span className="text-2xl font-bold text-green-600">
                        {completedDiscoveryTraces}/{discoveryTraceCount}
                      </span>
                    </div>
                    <Progress value={discoveryProgress} className="h-2" />

                    {focusPhase === 'discovery' ? (
                      // Detailed discovery metrics when focused
                      <div className="space-y-2 text-xs">
                        <div className="flex justify-between text-gray-600">
                          <span>Total Findings:</span>
                          <span className="font-semibold text-green-600">{discoveryMetrics.totalFindings}</span>
                        </div>
                        <div className="flex justify-between text-gray-600">
                          <span>Avg. Findings per Trace:</span>
                          <span className="font-semibold text-green-600">{discoveryMetrics.avgFindingsPerTrace}</span>
                        </div>
                        <div className="flex justify-between text-gray-600">
                          <span>SME Findings:</span>
                          <span className="font-semibold text-green-600">{discoveryMetrics.smeFindings}</span>
                        </div>
                        <div className="flex justify-between text-gray-600">
                          <span>Participant Findings:</span>
                          <span className="font-semibold text-green-600">{discoveryMetrics.participantFindings}</span>
                        </div>
                        <div className="pt-2 mt-2 border-t border-green-200">
                          <div className="flex justify-between text-gray-600">
                            <span className="flex items-center gap-1">
                              <Users className="w-3 h-3" />
                              Active Participants:
                            </span>
                            <span className="font-semibold text-green-600">{activeUsers.size}</span>
                          </div>
                        </div>
                      </div>
                    ) : (
                      // Simple progress when not focused
                      <div className="flex justify-between items-center text-xs text-gray-500">
                        <span>{Math.round(discoveryProgress)}% Complete</span>
                        <span className="flex items-center gap-1">
                          <Users className="w-3 h-3" />
                          {activeUsers.size} Active
                        </span>
                      </div>
                    )}
                  </>
                ) : (
                  <>
                    <div className="flex items-center gap-2 mb-2">
                      <Clock className="w-4 h-4 text-amber-500" />
                      <span className="text-sm font-semibold text-amber-700">Not Started</span>
                    </div>
                    <p className="text-xs text-gray-600">
                      Participants will explore traces and share quality insights
                    </p>
                  </>
                )}
              </div>
            </CardContent>
          </Card>
          )}

          {/* Rubric Status - Hide during discovery AND annotation focus */}
          {focusPhase !== 'discovery' && focusPhase !== 'annotation' && (
            <Card className="border-l-4 border-blue-500 bg-gradient-to-br from-blue-50 to-white">
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Settings className="w-5 h-5 text-blue-600" />
                      <p className="text-sm font-medium text-gray-600">Rubric Status</p>
                    </div>
                  </div>
                  <Target className="h-8 w-8 text-blue-600" />
                </div>
                <div className="space-y-3">
                  {rubric ? (
                    <>
                      <div className="flex items-center gap-2">
                        <CheckCircle className="w-4 h-4 text-green-600" />
                        <span className="text-sm font-semibold text-blue-700">Rubric Created</span>
                      </div>
                      <p className="text-xs text-gray-600 line-clamp-2">
                        {rubric?.question ? parseRubricQuestions(rubric.question)[0]?.title || 'Evaluation rubric is ready' : 'Evaluation rubric is ready'}
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onNavigate('rubric')}
                        className="w-full text-xs border-blue-200 text-blue-700 hover:bg-blue-50"
                      >
                        <Eye className="w-3 h-3 mr-1" />
                        View Rubric
                      </Button>
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2">
                        <Clock className="w-4 h-4 text-amber-500" />
                        <span className="text-sm font-semibold text-amber-700">Rubric Needed</span>
                      </div>
                      <p className="text-xs text-gray-600">
                        Create evaluation criteria for annotation phase
                      </p>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => onNavigate('rubric')}
                        className="w-full text-xs border-amber-200 text-amber-700 hover:bg-amber-50"
                      >
                        <Plus className="w-3 h-3 mr-1" />
                        Create Rubric
                      </Button>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}

          {/* Annotation Progress - Hide during discovery focus, show during annotation focus or general view */}
          {focusPhase !== 'discovery' && (
            <Card className={`border-l-4 border-purple-500 bg-gradient-to-br from-purple-50 to-white ${
              focusPhase === 'annotation' ? 'ring-2 ring-purple-400 shadow-lg' : ''
            }`}>
              <CardContent className="pt-6">
                <div className="flex items-start justify-between mb-4">
                  <div>
                    <div className="flex items-center gap-2 mb-1">
                      <Users className="w-5 h-5 text-purple-600" />
                      <p className="text-sm font-medium text-gray-600">Annotation Phase</p>
                    </div>
                    {(() => {
                      if (annotationProgress === 100) {
                        return <Badge className="mt-2 bg-emerald-100 text-emerald-700 border-emerald-200">Completed</Badge>;
                      } else if (focusPhase === 'annotation') {
                        return <Badge className="mt-2 bg-blue-100 text-blue-700 border-blue-200">Viewing</Badge>;
                      }
                      return null;
                    })()}
                  </div>
                  <TrendingUp className="h-8 w-8 text-purple-600" />
                </div>
                <div className="space-y-3">
                  {(currentPhase === 'annotation' || focusPhase === 'annotation') ? (
                    <>
                      <div className="flex justify-between items-center">
                        <span className="text-sm text-gray-600">Traces Annotated</span>
                        <span className="text-2xl font-bold text-purple-600">
                          {tracesWithAnnotations.size}/{annotationTraceCount}
                        </span>
                      </div>
                      <Progress value={annotationProgress} className="h-2" />


                      {focusPhase === 'annotation' ? (
                        // Detailed annotation metrics when focused
                        <div className="space-y-2 text-xs">
                          {/* Average Rating - adapt display for binary vs likert scale */}
                          {effectiveJudgeType === 'binary' ? (
                            <div className="flex justify-between text-gray-600">
                              <span>Pass Rate:</span>
                              <span className="font-semibold text-purple-600">
                                {annotations && annotations.length > 0
                                  ? `${Math.round((annotations.filter(a => a.rating === 1).length / annotations.length) * 100)}%`
                                  : '0%'}
                              </span>
                            </div>
                          ) : (
                            <div className="flex justify-between text-gray-600">
                              <span>Average Rating:</span>
                              <span className="font-semibold text-purple-600">{annotationMetrics.avgRating}/{rubric?.rating_scale || 5}</span>
                            </div>
                          )}
                          <div className="flex justify-between text-gray-600">
                            <span>SME Annotations:</span>
                            <span className="font-semibold text-purple-600">{annotationMetrics.smeCount}</span>
                          </div>
                          <div className="flex justify-between text-gray-600">
                            <span>Participant Annotations:</span>
                            <span className="font-semibold text-purple-600">{annotationMetrics.participantCount}</span>
                          </div>
                          {Object.keys(annotationMetrics.ratingDistribution).length > 0 && (
                            <div className="pt-2 mt-2 border-t border-purple-200">
                              <div className="text-gray-700 font-medium mb-1">Rating Distribution:</div>
                              {effectiveJudgeType === 'binary' ? (
                                // Binary scale: show Pass/Fail
                                <>
                                  {annotationMetrics.ratingDistribution[1] !== undefined && (
                                    <div className="flex justify-between items-center">
                                      <span className="flex items-center gap-1 text-green-600">
                                        <CheckCircle className="w-3 h-3" />
                                        {rubric?.binary_labels?.pass || 'Pass'}:
                                      </span>
                                      <Badge className="bg-green-100 text-green-700 border-green-200">
                                        {annotationMetrics.ratingDistribution[1]}
                                      </Badge>
                                    </div>
                                  )}
                                  {annotationMetrics.ratingDistribution[0] !== undefined && (
                                    <div className="flex justify-between items-center mt-1">
                                      <span className="flex items-center gap-1 text-red-600">
                                        <AlertCircle className="w-3 h-3" />
                                        {rubric?.binary_labels?.fail || 'Fail'}:
                                      </span>
                                      <Badge className="bg-red-100 text-red-700 border-red-200">
                                        {annotationMetrics.ratingDistribution[0]}
                                      </Badge>
                                    </div>
                                  )}
                                </>
                              ) : (
                                // Likert scale: show star ratings
                                [5, 4, 3, 2, 1].map(rating => (
                                  annotationMetrics.ratingDistribution[rating] && (
                                    <div key={rating} className="flex justify-between items-center mt-1">
                                      <span className="text-gray-600">{rating}⭐:</span>
                                      <Badge variant="secondary" className="bg-purple-100 text-purple-700">
                                        {annotationMetrics.ratingDistribution[rating]}
                                      </Badge>
                                    </div>
                                  )
                                ))
                              )}
                            </div>
                          )}
                        </div>
                      ) : (
                        // Simple progress when not focused
                        <div className="text-xs text-gray-500">
                          {Math.round(annotationProgress)}% Complete
                        </div>
                      )}
                    </>
                  ) : (
                    <>
                      <div className="flex items-center gap-2 mb-2">
                        <Clock className="w-4 h-4 text-amber-500" />
                        <span className="text-sm font-semibold text-amber-700">
                          {currentPhase === 'discovery' ? 'Pending Discovery' : 'Not Started'}
                        </span>
                      </div>
                      <p className="text-xs text-gray-600">
                        SMEs will annotate traces using the rubric
                      </p>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          )}
        </div>

        {/* Ready for Review/Tuning Banner - Show when annotation is complete */}
        {annotationProgress === 100 && currentPhase === 'annotation' && focusPhase === 'annotation' && (
          <div className="mb-4">
            <Card className="border-l-4 border-green-500 bg-gradient-to-r from-green-50 to-emerald-50">
              <CardContent className="py-3 px-4">
                <div className="flex items-center gap-3">
                  <CheckCircle className="w-5 h-5 text-green-600 flex-shrink-0" />
                  <div className="flex-1 min-w-0">
                    <span className="font-medium text-green-900 text-sm">Ready for Results Review & Judge Tuning</span>
                    <span className="text-xs text-green-600 ml-2">— Use the sidebar to review IRR results and proceed to judge tuning.</span>
                  </div>
                  <Badge className="bg-green-100 text-green-700 border-green-200 text-xs px-2 py-0.5">
                    Complete
                  </Badge>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Detailed Analysis */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Eye className="h-4 w-4 text-blue-600" />
              {focusPhase === 'discovery' ? 'Discovery Analysis' : 'Workshop Analysis'}
            </CardTitle>
            <CardDescription className="text-xs">
              {focusPhase === 'discovery' ?
                'Detailed breakdown of discovery progress and trace coverage' :
                'User participation and trace coverage analysis'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Tabs defaultValue="users" className="space-y-4">
              <TabsList className={`grid w-full ${focusPhase === 'discovery' ? 'grid-cols-3' : 'grid-cols-2'}`}>
                <TabsTrigger value="users" className="flex items-center gap-2">
                  <Users className="w-4 h-4" />
                  User Participation
                </TabsTrigger>
                <TabsTrigger value="traces" className="flex items-center gap-2">
                  <FileText className="w-4 h-4" />
                  Trace Coverage
                </TabsTrigger>
                {focusPhase === 'discovery' && (
                  <TabsTrigger value="feedback-detail" className="flex items-center gap-2">
                    <MessageSquare className="w-4 h-4" />
                    Feedback Detail
                  </TabsTrigger>
                )}
              </TabsList>

              {/* User Participation Tab */}
              <TabsContent value="users">
                <div className="flex items-center gap-2 mb-4">
                  <Users className="h-4 w-4 text-blue-600" />
                  <h3 className="text-sm font-semibold">Participant Activity</h3>
                  <Badge variant="secondary" className="bg-blue-100 text-blue-700 border-blue-200">
                    {userContributions.length}
                  </Badge>
                </div>
                {userContributions.length > 0 ? (
                  <div className="space-y-3">
                    {userContributions.map(({ userId, userName, count }) => {
                      const userTraces = traceCoverageDetails.filter((t: TraceCoverageDetail) => t.reviewers.includes(userId)).length;
                      return (
                        <div key={userId} className="flex items-center justify-between p-4 bg-gradient-to-r from-slate-50 to-white border border-slate-200 rounded-lg hover:shadow-sm transition-shadow">
                          <div className="flex items-center gap-3">
                            <div className="w-10 h-10 bg-gradient-to-br from-blue-400 to-blue-600 rounded-full flex items-center justify-center text-white text-sm font-semibold shadow-sm">
                              {userName.slice(0, 2).toUpperCase()}
                            </div>
                            <div>
                              <div className="text-sm font-semibold text-slate-900">
                                {userName}
                              </div>
                              <div className="text-xs text-slate-600 flex items-center gap-2">
                                <span className="flex items-center gap-1">
                                  <FileText className="w-3 h-3" />
                                  {count} finding{count !== 1 ? 's' : ''}
                                </span>
                                <span className="text-slate-400">•</span>
                                <span className="flex items-center gap-1">
                                  <Activity className="w-3 h-3" />
                                  {userTraces} trace{userTraces !== 1 ? 's' : ''}
                                </span>
                              </div>
                            </div>
                          </div>
                          <div className="text-right">
                            <Badge
                              variant={count >= 3 ? 'default' : 'secondary'}
                              className={count >= 3 ? 'bg-green-100 text-green-700 border-green-200' : 'bg-slate-100 text-slate-700 border-slate-200'}
                            >
                              {count >= 3 ? 'Active' : 'Participating'}
                            </Badge>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                    <Users className="w-12 h-12 mx-auto mb-4 opacity-40 text-slate-400" />
                    <p className="text-sm font-medium text-slate-700">No user participation data yet</p>
                    <p className="text-xs text-slate-500 mt-1">Users will appear here once they start contributing findings</p>
                  </div>
                )}
              </TabsContent>

              {/* Trace Coverage Tab */}
              <TabsContent value="traces">
                <div className="flex items-center gap-2 mb-4">
                  <FileText className="h-4 w-4 text-purple-600" />
                  <h3 className="text-sm font-semibold">Trace Review Status</h3>
                  <Badge variant="secondary" className="bg-purple-100 text-purple-700 border-purple-200">
                    {traceCoverageDetails.length}
                  </Badge>
                </div>
                {traceCoverageDetails.length > 0 ? (
                  <div className="space-y-3" data-testid="trace-coverage">
                    {traceCoverageDetails.map((trace) => (
                      <div key={trace.traceId} className="border border-slate-200 rounded-lg p-4 bg-gradient-to-r from-slate-50 to-white hover:shadow-sm transition-shadow" data-testid="trace-item">
                        <div className="flex items-start justify-between mb-3">
                          <div className="flex-1">
                            <div className="flex items-center gap-2 mb-2 flex-wrap">
                              <h4 className="font-semibold text-slate-900 text-sm">
                                Trace: {trace.traceId.slice(0, 20)}...
                              </h4>
                              <Badge
                                className={
                                  trace.isFullyReviewed
                                    ? 'bg-green-100 text-green-700 border-green-200'
                                    : trace.reviewCount > 0
                                    ? 'bg-blue-100 text-blue-700 border-blue-200'
                                    : 'bg-slate-100 text-slate-600 border-slate-200'
                                }
                              >
                                {trace.reviewCount} review{trace.reviewCount !== 1 ? 's' : ''}
                              </Badge>
                              <Badge
                                className={
                                  trace.uniqueReviewers >= 2
                                    ? 'bg-purple-100 text-purple-700 border-purple-200'
                                    : 'bg-amber-100 text-amber-700 border-amber-200'
                                }
                              >
                                <Users className="w-3 h-3 mr-1" />
                                {trace.uniqueReviewers} reviewer{trace.uniqueReviewers !== 1 ? 's' : ''}
                              </Badge>
                            </div>
                            <p className="text-xs text-slate-600 line-clamp-2 mb-3 leading-relaxed">
                              {trace.input.slice(0, 120)}...
                            </p>
                            {trace.reviewers.length > 0 && (
                              <div className="flex flex-wrap gap-1.5">
                                {trace.reviewers.map(reviewer => {
                                  // Find the user name from the findings with user details
                                  const userFinding = allFindingsWithUserDetails?.find(f => f.user_id === reviewer);
                                  const reviewerName = userFinding?.user_name || reviewer;
                                  return (
                                    <Badge key={reviewer} variant="outline" className="text-xs px-2 py-0.5 bg-white border-slate-300">
                                      {reviewerName}
                                    </Badge>
                                  );
                                })}
                              </div>
                            )}
                          </div>
                          <div className="flex flex-col items-end gap-1 ml-4">
                            <Badge
                              className={`status-text ${
                                trace.isFullyReviewed
                                  ? 'bg-green-100 text-green-700 border-green-200'
                                  : trace.reviewCount > 0
                                  ? 'bg-amber-100 text-amber-700 border-amber-200'
                                  : 'bg-slate-100 text-slate-500 border-slate-200'
                              }`}
                            >
                              {trace.isFullyReviewed ? (
                                <>
                                  <CheckCircle className="w-3 h-3 mr-1" />
                                  Complete
                                </>
                              ) : trace.reviewCount > 0 ? (
                                <>
                                  <Clock className="w-3 h-3 mr-1" />
                                  In Progress
                                </>
                              ) : (
                                <>
                                  <AlertCircle className="w-3 h-3 mr-1" />
                                  Pending
                                </>
                              )}
                            </Badge>
                          </div>
                        </div>
                      </div>
                    ))}
                  </div>
                ) : (
                  <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200">
                    <FileText className="w-12 h-12 mx-auto mb-4 opacity-40 text-slate-400" />
                    <p className="text-sm font-medium text-slate-700">No trace coverage data yet</p>
                    <p className="text-xs text-slate-500 mt-1">Traces will appear here once they start being reviewed</p>
                  </div>
                )}
              </TabsContent>

              {/* Feedback Detail Tab (discovery only) */}
              {focusPhase === 'discovery' && (
                <TabsContent value="feedback-detail">
                  <FeedbackDetailPanel workshopId={workshopId!} />
                </TabsContent>
              )}
            </Tabs>
          </CardContent>
        </Card>

        {/* Quick Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="text-base flex items-center gap-2">
              <Settings className="h-4 w-4 text-blue-600" />
              Quick Actions
            </CardTitle>
            <CardDescription className="text-xs">
              {focusPhase === 'discovery' ? 'Discovery phase management tools' :
               focusPhase === 'annotation' ? 'Annotation phase management tools' :
               'Common facilitator tasks and workshop management'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className={`grid grid-cols-1 gap-4 ${
              focusPhase === 'discovery' ? 'md:grid-cols-2 lg:grid-cols-3' : 
              focusPhase === 'annotation' ? 'md:grid-cols-2 lg:grid-cols-3' : 
              'md:grid-cols-3'
            }`}>
              {/* View All Findings - Hide during discovery and annotation focus */}
              {focusPhase !== 'discovery' && focusPhase !== 'annotation' && (
              <Button
                variant="outline"
                className="flex items-center gap-3 justify-start p-4 h-auto border-blue-200 hover:bg-blue-50 hover:border-blue-300 transition-colors"
                onClick={() => onNavigate('view-all-findings')}
              >
                <div className="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                  <FileText className="w-5 h-5 text-blue-600" />
                </div>
                <div className="text-left">
                  <div className="font-semibold text-slate-900">View All Findings</div>
                  <div className="text-xs text-slate-600">Review participant insights</div>
                </div>
                <ChevronRight className="w-4 h-4 ml-auto text-slate-400" />
              </Button>
              )}

              {/* Discovery-specific actions */}
              {focusPhase === 'discovery' && (
                <>
                  {/* Add Additional Traces */}
                  <div className="border-l-4 border-green-500 rounded-lg p-4 bg-gradient-to-r from-green-50 to-white shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center">
                        <Plus className="w-4 h-4 text-green-600" />
                      </div>
                      <div className="text-left">
                        <div className="font-semibold text-slate-900">Add More Traces</div>
                        <div className="text-xs text-slate-600">Include additional traces in discovery</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="1"
                        placeholder="Number of traces"
                        value={discoveryTracesCount}
                        onChange={(e) => setDiscoveryTracesCount(e.target.value)}
                        className="flex-1 h-9 text-sm border-green-200 focus:border-green-400 focus:ring-green-400"
                        disabled={isAddingTraces}
                      />
                      <Button
                        onClick={handleAddAdditionalTraces}
                        disabled={isAddingTraces || !discoveryTracesCount}
                        size="sm"
                        className="h-9 px-4 bg-green-600 hover:bg-green-700 text-white shadow-sm"
                      >
                        {isAddingTraces ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                            Adding...
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4 mr-1" />
                            Add
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Phase Control Button */}
                  <div className="border-l-4 border-blue-500 rounded-lg p-4 bg-gradient-to-r from-blue-50 to-white shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Play className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="text-left">
                        <div className="font-semibold text-slate-900">Discovery Control</div>
                        <div className="text-xs text-slate-600">Pause or resume discovery phase</div>
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <PhaseControlButton phase="discovery" />
                    </div>
                  </div>

                  {/* Reset Discovery */}
                  <div className="border-l-4 border-amber-500 rounded-lg p-4 bg-gradient-to-r from-amber-50 to-white shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-amber-100 rounded-lg flex items-center justify-center">
                        <RotateCcw className="w-4 h-4 text-amber-600" />
                      </div>
                      <div className="text-left">
                        <div className="font-semibold text-amber-800">Reset Discovery</div>
                        <div className="text-xs text-amber-600">Go back to reconfigure trace selection</div>
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isResettingDiscovery}
                          className="w-full border-amber-300 text-amber-700 hover:bg-amber-100 font-medium"
                        >
                          {isResettingDiscovery ? (
                            <>
                              <div className="w-3 h-3 border-2 border-amber-300 border-t-amber-600 rounded-full animate-spin mr-2" />
                              Resetting...
                            </>
                          ) : (
                            <>
                              <RotateCcw className="w-4 h-4 mr-2" />
                              Reset & Reconfigure
                            </>
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Reset Discovery Phase?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will reset the discovery phase so you can reconfigure the number of traces 
                            (e.g., switch from Standard 10 to Custom 3). 
                            <br /><br />
                            <strong>Your traces will be kept</strong>, but you'll need to restart the discovery phase 
                            with your new configuration. Any discovery findings will be preserved.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={handleResetDiscovery}
                            className="bg-amber-600 hover:bg-amber-700"
                          >
                            Reset Discovery
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </>
              )}

              {/* Annotation-specific actions */}
              {focusPhase === 'annotation' && (
                <>
                  {/* Add Additional Traces for Annotation */}
                  <div className="border-l-4 border-purple-500 rounded-lg p-4 bg-gradient-to-r from-purple-50 to-white shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                        <Plus className="w-4 h-4 text-purple-600" />
                      </div>
                      <div className="text-left">
                        <div className="font-semibold text-slate-900">Add More Traces</div>
                        <div className="text-xs text-slate-600">Include additional traces for annotation</div>
                      </div>
                    </div>
                    <div className="flex gap-2">
                      <Input
                        type="number"
                        min="1"
                        placeholder="Number of traces"
                        value={annotationTracesCount}
                        onChange={(e) => setAnnotationTracesCount(e.target.value)}
                        className="flex-1 h-9 text-sm border-purple-200 focus:border-purple-400 focus:ring-purple-400"
                        disabled={isAddingTraces}
                      />
                      <Button
                        onClick={handleAddAdditionalTraces}
                        disabled={isAddingTraces || !annotationTracesCount}
                        size="sm"
                        className="h-9 px-4 bg-purple-600 hover:bg-purple-700 text-white shadow-sm"
                      >
                        {isAddingTraces ? (
                          <>
                            <div className="w-3 h-3 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                            Adding...
                          </>
                        ) : (
                          <>
                            <Plus className="w-4 h-4 mr-1" />
                            Add
                          </>
                        )}
                      </Button>
                    </div>
                  </div>

                  {/* Phase Control Button */}
                  <div className="border-l-4 border-blue-500 rounded-lg p-4 bg-gradient-to-r from-blue-50 to-white shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center">
                        <Play className="w-4 h-4 text-blue-600" />
                      </div>
                      <div className="text-left">
                        <div className="font-semibold text-slate-900">Annotation Control</div>
                        <div className="text-xs text-slate-600">Pause or resume annotation phase</div>
                      </div>
                    </div>
                    <div className="flex justify-center">
                      <PhaseControlButton phase="annotation" />
                    </div>
                  </div>

                  {/* Reset Annotation */}
                  <div className="border-l-4 border-purple-500 rounded-lg p-4 bg-gradient-to-r from-purple-50 to-white shadow-sm">
                    <div className="flex items-center gap-3 mb-3">
                      <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center">
                        <RotateCcw className="w-4 h-4 text-purple-600" />
                      </div>
                      <div className="text-left">
                        <div className="font-semibold text-purple-800">Reset Annotation</div>
                        <div className="text-xs text-purple-600">Go back to reconfigure trace selection</div>
                      </div>
                    </div>
                    <AlertDialog>
                      <AlertDialogTrigger asChild>
                        <Button
                          variant="outline"
                          size="sm"
                          disabled={isResettingAnnotation}
                          className="w-full border-purple-300 text-purple-700 hover:bg-purple-100 font-medium"
                        >
                          {isResettingAnnotation ? (
                            <>
                              <div className="w-3 h-3 border-2 border-purple-300 border-t-purple-600 rounded-full animate-spin mr-2" />
                              Resetting...
                            </>
                          ) : (
                            <>
                              <RotateCcw className="w-4 h-4 mr-2" />
                              Reset & Reconfigure
                            </>
                          )}
                        </Button>
                      </AlertDialogTrigger>
                      <AlertDialogContent>
                        <AlertDialogHeader>
                          <AlertDialogTitle>Reset Annotation Phase?</AlertDialogTitle>
                          <AlertDialogDescription>
                            This will reset the annotation phase so you can reconfigure the trace selection and settings.
                            <br /><br />
                            <strong>All SME annotations will be cleared.</strong> SMEs will need to start their annotations from the beginning.
                          </AlertDialogDescription>
                        </AlertDialogHeader>
                        <AlertDialogFooter>
                          <AlertDialogCancel>Cancel</AlertDialogCancel>
                          <AlertDialogAction 
                            onClick={handleResetAnnotation}
                            className="bg-purple-600 hover:bg-purple-700"
                          >
                            Reset Annotation
                          </AlertDialogAction>
                        </AlertDialogFooter>
                      </AlertDialogContent>
                    </AlertDialog>
                  </div>
                </>
              )}
            </div>
          </CardContent>
        </Card>

        {/* JSONPath Settings - Only show in general dashboard view */}
        {!focusPhase && <JsonPathSettings />}
      </div>
    </div>
  );
};

// --- Feedback Detail Panel (used inside the Tabs) ---

interface FeedbackDetailPanelProps {
  workshopId: string;
}

interface TraceGroup {
  traceId: string;
  feedbacks: Array<{
    id: string;
    user_id: string;
    feedback_label: 'good' | 'bad';
    comment: string;
    followup_qna: Array<{ question: string; answer: string }>;
  }>;
}

function FeedbackDetailPanel({ workshopId }: FeedbackDetailPanelProps) {
  const { data: feedbackList, isLoading } = useDiscoveryFeedback(workshopId);
  const [expandedTraces, setExpandedTraces] = React.useState<Set<string>>(new Set());
  const [expandedQna, setExpandedQna] = React.useState<Set<string>>(new Set());

  const toggleTrace = (traceId: string) => {
    setExpandedTraces(prev => {
      const next = new Set(prev);
      if (next.has(traceId)) next.delete(traceId);
      else next.add(traceId);
      return next;
    });
  };

  const toggleQna = (key: string) => {
    setExpandedQna(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  // Group feedback by trace_id
  const traceGroups: TraceGroup[] = React.useMemo(() => {
    if (!feedbackList?.length) return [];
    const grouped = new Map<string, TraceGroup['feedbacks']>();
    for (const fb of feedbackList) {
      const list = grouped.get(fb.trace_id) || [];
      list.push({
        id: fb.id,
        user_id: fb.user_id,
        feedback_label: fb.feedback_label,
        comment: fb.comment,
        followup_qna: fb.followup_qna || [],
      });
      grouped.set(fb.trace_id, list);
    }
    return Array.from(grouped.entries()).map(([traceId, feedbacks]) => ({ traceId, feedbacks }));
  }, [feedbackList]);

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-8">
        <div className="w-5 h-5 border-2 border-blue-300 border-t-blue-600 rounded-full animate-spin" />
        <span className="ml-2 text-sm text-slate-500">Loading feedback...</span>
      </div>
    );
  }

  if (!traceGroups.length) {
    return (
      <div className="text-center py-8 text-slate-500 bg-slate-50 rounded-lg border-2 border-dashed border-slate-200" data-testid="feedback-empty-state">
        <MessageSquare className="w-12 h-12 mx-auto mb-4 opacity-40 text-slate-400" />
        <p className="text-sm font-medium text-slate-700">No feedback submitted yet</p>
        <p className="text-xs text-slate-500 mt-1">Participant feedback will appear here as they review traces</p>
      </div>
    );
  }

  return (
    <div className="space-y-3" data-testid="feedback-detail-panel">
      <div className="flex items-center gap-2 mb-4">
        <MessageSquare className="h-4 w-4 text-orange-600" />
        <h3 className="text-sm font-semibold">Feedback by Trace</h3>
        <Badge variant="secondary" className="bg-orange-100 text-orange-700 border-orange-200">
          {traceGroups.length} trace{traceGroups.length !== 1 ? 's' : ''}
        </Badge>
      </div>

      {traceGroups.map(({ traceId, feedbacks }) => {
        const isExpanded = expandedTraces.has(traceId);
        return (
          <div key={traceId} className="border border-slate-200 rounded-lg bg-white" data-testid="feedback-trace-group">
            <button
              onClick={() => toggleTrace(traceId)}
              className="w-full flex items-center justify-between p-3 hover:bg-slate-50 transition-colors rounded-lg"
            >
              <div className="flex items-center gap-2 text-left">
                <span className="text-sm font-semibold text-slate-900">
                  Trace: {traceId.slice(0, 20)}...
                </span>
                <Badge variant="secondary" className="text-xs">
                  {feedbacks.length} response{feedbacks.length !== 1 ? 's' : ''}
                </Badge>
              </div>
              <ChevronDown className={`w-4 h-4 text-slate-400 transition-transform ${isExpanded ? 'rotate-180' : ''}`} />
            </button>

            {isExpanded && (
              <div className="border-t border-slate-100 px-3 pb-3 space-y-3">
                {feedbacks.map((fb) => {
                  const qnaKey = `${traceId}-${fb.id}`;
                  const qnaExpanded = expandedQna.has(qnaKey);
                  return (
                    <div key={fb.id} className="p-3 bg-slate-50 rounded-md" data-testid="feedback-participant-row">
                      <div className="flex items-center gap-2 mb-1">
                        <span className="text-sm font-medium text-slate-800">{fb.user_id}</span>
                        <Badge
                          className={fb.feedback_label === 'good'
                            ? 'bg-green-100 text-green-700 border-green-200'
                            : 'bg-red-100 text-red-700 border-red-200'
                          }
                          data-testid="feedback-label-badge"
                        >
                          {fb.feedback_label.toUpperCase()}
                        </Badge>
                      </div>
                      {fb.comment && (
                        <p className="text-sm text-slate-600 mt-1" data-testid="feedback-comment">{fb.comment}</p>
                      )}

                      {fb.followup_qna.length > 0 && (
                        <div className="mt-2">
                          <button
                            onClick={() => toggleQna(qnaKey)}
                            className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                          >
                            <ChevronDown className={`w-3 h-3 transition-transform ${qnaExpanded ? 'rotate-180' : ''}`} />
                            {fb.followup_qna.length} follow-up Q&A
                          </button>
                          {qnaExpanded && (
                            <div className="mt-2 space-y-2 pl-3 border-l-2 border-blue-200" data-testid="feedback-qna-list">
                              {fb.followup_qna.map((qna, i) => (
                                <div key={i} className="text-xs">
                                  <p className="font-medium text-slate-700">Q{i + 1}: {qna.question}</p>
                                  <p className="text-slate-600 mt-0.5">A{i + 1}: {qna.answer}</p>
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}