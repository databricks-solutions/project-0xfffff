import React, { useState, useMemo, useCallback, useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useRoleCheck, useUser } from '@/context/UserContext';
import {
  useAllTraces,
  useFacilitatorDiscoveryFeedback,
  useDiscoveryAnalyses,
  useRunDiscoveryAnalysis,
  useDraftRubricItems,
  useCreateDraftRubricItem,
  useDeleteDraftRubricItem,
  useWorkshopDiscoveryConfig,
  useWorkshopPhase,
  useUpdateDiscoveryModel,
  useUpdateDiscoverySettings,
  useCreateRubricFromDraft,
  useAvailableModels,
  type DiscoveryAnalysis,
} from '@/hooks/useWorkshopApi';
import type { Trace, Workshop } from '@/client';
import { buildModelOptions } from '@/utils/modelMapping';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';

import { DiscoveryOverviewBar } from './DiscoveryOverviewBar';
import { CrossTraceAnalysisSummary } from './CrossTraceAnalysisSummary';
import { DiscoveryTraceCard, type PromotePayload } from './DiscoveryTraceCard';
import { DraftRubricSidebar } from './DraftRubricSidebar';

interface FacilitatorDiscoveryWorkspaceProps {
  onNavigate: (phase: string) => void;
}

export const FacilitatorDiscoveryWorkspace: React.FC<FacilitatorDiscoveryWorkspaceProps> = ({
  onNavigate,
}) => {
  const { workshopId } = useWorkshopContext();
  const { user } = useUser();
  const { isFacilitator } = useRoleCheck();
  const queryClient = useQueryClient();

  // Data
  const { data: discoveryConfig } = useWorkshopDiscoveryConfig(workshopId!);
  const { data: phaseData } = useWorkshopPhase(workshopId!);
  const { data: traces } = useAllTraces(workshopId!) as { data: Trace[] | undefined };
  const { data: allFeedback } = useFacilitatorDiscoveryFeedback(workshopId!);
  const { data: analyses } = useDiscoveryAnalyses(workshopId!);
  const { data: draftItems = [] } = useDraftRubricItems(workshopId!);
  const { data: availableModels } = useAvailableModels(workshopId!);

  // Mutations
  const runAnalysis = useRunDiscoveryAnalysis(workshopId!);
  const createDraftItem = useCreateDraftRubricItem(workshopId!);
  const updateModelMutation = useUpdateDiscoveryModel(workshopId!);
  const updateDiscoverySettings = useUpdateDiscoverySettings(workshopId!);
  const deleteDraftItem = useDeleteDraftRubricItem(workshopId!);
  const createRubricFromDraft = useCreateRubricFromDraft(workshopId!);
  const [newItemIds, setNewItemIds] = useState<Set<string>>(new Set());

  // State
  const [promotedKeys, setPromotedKeys] = useState<Set<string>>(new Set());
  const [showAddTracesDialog, setShowAddTracesDialog] = useState(false);
  const [tracesCountInput, setTracesCountInput] = useState('');
  const [isAddingTraces, setIsAddingTraces] = useState(false);
  const [isDraftPaneExpanded, setIsDraftPaneExpanded] = useState(false);
  const [isDraftPaneModalOpen, setIsDraftPaneModalOpen] = useState(false);
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const scrollContainer = scrollRef.current;
    if (!scrollContainer) return;

    let targetRot = 0;
    let currentRot = 0;
    let animationFrameId: number;

    const updateRotation = () => {
      currentRot += (targetRot - currentRot) * 0.08;
      document.documentElement.style.setProperty('--scroll-rot', `${currentRot}deg`);

      if (Math.abs(targetRot - currentRot) > 0.1) {
        animationFrameId = requestAnimationFrame(updateRotation);
      }
    };

    const handleScroll = () => {
      targetRot = scrollContainer.scrollTop * 0.15;
      cancelAnimationFrame(animationFrameId);
      animationFrameId = requestAnimationFrame(updateRotation);
    };

    scrollContainer.addEventListener('scroll', handleScroll, { passive: true });
    handleScroll();
    return () => {
      scrollContainer.removeEventListener('scroll', handleScroll);
      cancelAnimationFrame(animationFrameId);
    };
  }, []);

  const modelOptions = useMemo(() => availableModels ? buildModelOptions(availableModels) : [], [availableModels]);
  const currentModel = discoveryConfig?.discovery_questions_model_name || 'demo';
  const discoveryMode = (discoveryConfig?.discovery_mode || 'analysis') as 'analysis' | 'social';
  const followupsEnabled = discoveryConfig?.discovery_followups_enabled ?? true;

  const currentAnalysis = analyses?.[0] ?? null;

  // Group feedback by trace
  const feedbackByTrace = useMemo(() => {
    const map = new Map<string, typeof allFeedback>();
    if (!allFeedback) return map;
    for (const fb of allFeedback) {
      if (!map.has(fb.trace_id)) map.set(fb.trace_id, []);
      map.get(fb.trace_id)!.push(fb);
    }
    return map;
  }, [allFeedback]);

  // Filter traces to active discovery traces
  const activeTraces = useMemo(() => {
    if (!traces) return [];
    const activeIds = discoveryConfig?.active_discovery_trace_ids;
    if (activeIds?.length) {
      return traces.filter((t) => activeIds.includes(t.id));
    }
    return traces;
  }, [traces, discoveryConfig?.active_discovery_trace_ids]);

  // Split analysis findings: trace-specific vs cross-trace
  const findingsByTrace = useMemo(() => {
    if (!currentAnalysis) return new Map<string, DiscoveryAnalysis['findings']>();
    const map = new Map<string, DiscoveryAnalysis['findings']>();
    for (const f of currentAnalysis.findings) {
      if (f.evidence_trace_ids.length === 1) {
        const tid = f.evidence_trace_ids[0];
        if (!map.has(tid)) map.set(tid, []);
        map.get(tid)!.push(f);
      }
    }
    return map;
  }, [currentAnalysis]);

  const questionOriginByRef = useMemo(() => {
    const map = new Map<string, string>();

    const normalizeMilestoneRefForTrace = (traceId: string, rawRef: unknown): string | null => {
      if (typeof rawRef !== 'string') return null;
      const tokenRaw = rawRef.trim().toLowerCase();
      if (!tokenRaw) return null;
      const token = tokenRaw.includes(':') ? tokenRaw.split(':').pop() || '' : tokenRaw;
      if (!token) return null;
      if (token === 'all' || token === 'whole' || token === 'full') return `${traceId}:all`;
      if (/^m\d+$/i.test(token)) return `${traceId}:${token.toLowerCase()}`;
      if (/^\d+$/.test(token)) return `${traceId}:m${token}`;
      return `${traceId}:all`;
    };

    for (const trace of activeTraces) {
      const feedbackForTrace = feedbackByTrace.get(trace.id) ?? [];
      let questionCounter = 0;
      for (const fb of feedbackForTrace) {
        const qna = fb.followup_qna ?? [];
        for (const pair of qna) {
          questionCounter += 1;
          const key = `${trace.id}#q${questionCounter}`;
          const refs = (pair as { milestone_references?: unknown[] }).milestone_references;
          const normalizedRefs = Array.isArray(refs)
            ? refs
                .map((r) => normalizeMilestoneRefForTrace(trace.id, r))
                .filter((r): r is string => !!r)
            : [];

          const specificMilestone = normalizedRefs.find((r) => /:m\d+$/i.test(r));
          map.set(key, specificMilestone || `${trace.id}:all`);
        }
      }
    }

    return map;
  }, [activeTraces, feedbackByTrace]);

  // Disagreements by trace
  const disagreementsByTrace = useMemo(() => {
    if (!currentAnalysis) return new Map();
    const map = new Map();
    const allDisagreements = [
      ...(currentAnalysis.disagreements?.high ?? []),
      ...(currentAnalysis.disagreements?.medium ?? []),
      ...(currentAnalysis.disagreements?.lower ?? []),
    ];
    for (const d of allDisagreements) {
      if (d.trace_id) {
        if (!map.has(d.trace_id)) map.set(d.trace_id, []);
        map.get(d.trace_id)!.push(d);
      }
    }
    return map;
  }, [currentAnalysis]);

  // Stats
  const participantCount = allFeedback
    ? new Set(allFeedback.map((f) => f.user_id)).size
    : 0;
  const feedbackCount = allFeedback?.length ?? 0;

  // Handlers
  const handleRunAnalysis = (template: string) => {
    runAnalysis.mutate(
      { template, model: currentModel },
      {
        onSuccess: () => toast.success('Analysis completed'),
        onError: (err) => toast.error(err.message || 'Analysis failed'),
      }
    );
  };

  const handlePromote = useCallback((payload: PromotePayload) => {
    const key = payload.key;
    // 1. Add key to promoted set → triggers CSS collapse
    setPromotedKeys((prev) => new Set(prev).add(key));

    // 2. Create draft item via API
    createDraftItem.mutate(
      {
        text: payload.text,
        source_type: payload.source_type,
        source_trace_ids: Array.from(
          new Set([
            ...(payload.source_trace_ids || []),
            ...(payload.source_milestone_refs || []),
          ])
        ),
        promoted_by: user?.id || '',
      },
      {
        onSuccess: (newItem) => {
          // Track as new for sidebar highlight
          setNewItemIds((prev) => new Set(prev).add(newItem.id));
          // Clear highlight after animation completes
          setTimeout(() => {
            setNewItemIds((prev) => {
              const next = new Set(prev);
              next.delete(newItem.id);
              return next;
            });
          }, 1200);

          // 3. Show toast with undo action
          toast('Added to draft rubric', {
            action: {
              label: 'Undo',
              onClick: () => {
                // Remove from promoted keys → finding re-expands
                setPromotedKeys((prev) => {
                  const next = new Set(prev);
                  next.delete(key);
                  return next;
                });
                // Delete the draft item
                deleteDraftItem.mutate(newItem.id);
              },
            },
            duration: 5000,
          });
        },
        onError: (err) => {
          // Revert on failure — remove from promoted keys
          setPromotedKeys((prev) => {
            const next = new Set(prev);
            next.delete(key);
            return next;
          });
          toast.error(err.message || 'Failed to promote');
        },
      }
    );
  }, [createDraftItem, deleteDraftItem, user?.id]);

  const handleNavigateToOrigin = useCallback((originRef: string) => {
    const ref = (originRef || '').trim();
    if (!ref) return;

    if (/^https?:\/\//i.test(ref)) {
      window.open(ref, '_blank', 'noopener,noreferrer');
      return;
    }

    const normalizedRef = ref.startsWith('#') ? ref.slice(1) : ref;
    const parseTraceAndSegment = (value: string): { traceId: string; segment: string | null } => {
      if (value.includes('#')) {
        const [rawTraceId, rawSegment] = value.split('#', 2);
        const traceId = rawTraceId.split('/').filter(Boolean).pop() || rawTraceId;
        return { traceId, segment: rawSegment || null };
      }
      if (value.includes(':')) {
        const [traceId, segment] = value.split(':', 2);
        return { traceId, segment: segment || null };
      }
      return { traceId: value, segment: null };
    };

    const { traceId, segment } = parseTraceAndSegment(normalizedRef);
    if (!traceId) return;

    let targetId: string | null = null;
    if (segment) {
      if (segment.toLowerCase() === 'all') {
        targetId = `discovery-trace-${traceId}`;
      } else if (/^q\d+$/i.test(segment)) {
        const questionRef = `${traceId}#${segment.toLowerCase()}`;
        const resolvedOrigin = questionOriginByRef.get(questionRef) || `${traceId}:all`;
        const [, resolvedSegment] = resolvedOrigin.split(':', 2);
        if (resolvedSegment && /^m\d+$/i.test(resolvedSegment)) {
          targetId = `discovery-trace-${traceId}-${resolvedSegment.toLowerCase()}`;
        } else {
          targetId = `discovery-trace-${traceId}`;
        }
      } else if (segment.toLowerCase().startsWith('m')) {
        targetId = `discovery-trace-${traceId}-${segment.toLowerCase()}`;
      } else {
        targetId = `discovery-trace-${traceId}`;
      }
    } else {
      targetId = `discovery-trace-${traceId}`;
    }

    const target = targetId ? document.getElementById(targetId) : null;
    if (target) {
      target.scrollIntoView({ behavior: 'smooth', block: 'center' });
      return;
    }

    // Fallback: if milestone anchor isn't currently mounted, scroll to trace card.
    const traceCard = document.getElementById(`discovery-trace-${traceId}`);
    traceCard?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  }, [questionOriginByRef]);

  const handleModelChange = (value: string) => {
    updateModelMutation.mutate({ model_name: value });
  };

  const handleModeChange = (mode: 'analysis' | 'social') => {
    if (mode === discoveryMode) return;
    updateDiscoverySettings.mutate(
      { discovery_mode: mode },
      {
        onSuccess: () => toast.success(`Switched to ${mode} mode`),
        onError: (err) => toast.error(err.message || 'Failed to switch discovery mode'),
      },
    );
  };

  const handleFollowupsToggle = () => {
    updateDiscoverySettings.mutate(
      { discovery_followups_enabled: !followupsEnabled },
      {
        onSuccess: () => toast.success(`Auto follow-up questions ${!followupsEnabled ? 'enabled' : 'disabled'}`),
        onError: (err) => toast.error(err.message || 'Failed to update follow-up setting'),
      },
    );
  };

  const handleCreateRubric = useCallback(async () => {
    try {
      await createRubricFromDraft.mutateAsync(user?.id || '');
      onNavigate('rubric');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create rubric from draft');
    }
  }, [createRubricFromDraft, user?.id, onNavigate]);

  const isPaused = phaseData?.completed_phases?.includes('discovery') ?? false;

  const handlePauseToggle = async () => {
    if (!workshopId) return;
    const endpoint = isPaused
      ? `/workshops/${workshopId}/resume-phase/discovery`
      : `/workshops/${workshopId}/complete-phase/discovery`;
    try {
      const response = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update phase status');
      }
      queryClient.setQueryData<Workshop>(['workshop', workshopId], (old) => {
        if (!old) return old;
        const phases = old.completed_phases || [];
        const newPhases = isPaused
          ? phases.filter((p) => p !== 'discovery')
          : [...phases, 'discovery'];
        return { ...old, completed_phases: newPhases };
      });
      void queryClient.refetchQueries({ queryKey: ['workshop', workshopId] });
      toast.success(`Discovery ${isPaused ? 'resumed' : 'paused'}`);
    } catch (error: unknown) {
      void queryClient.refetchQueries({ queryKey: ['workshop', workshopId] });
      toast.error(error instanceof Error ? error.message : 'Failed to update phase');
    }
  };

  const handleAddTracesConfirm = async () => {
    const count = parseInt(tracesCountInput);
    if (!count || count <= 0 || !workshopId) return;
    setIsAddingTraces(true);
    try {
      const response = await fetch(`/workshops/${workshopId}/add-traces`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ additional_count: count, phase: 'discovery' }),
      });
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to add traces');
      }
      const result = await response.json();
      setTracesCountInput('');
      setShowAddTracesDialog(false);
      await queryClient.refetchQueries({ queryKey: ['workshop', workshopId] });
      await queryClient.refetchQueries({ queryKey: ['traces', workshopId] });
      void queryClient.invalidateQueries({ queryKey: ['findings', workshopId] });
      toast.success('Traces added', {
        description: `${result.traces_added} traces added. Total: ${result.total_active_traces}.`,
      });
    } catch (error: unknown) {
      toast.error(error instanceof Error ? error.message : 'Failed to add traces');
    } finally {
      setIsAddingTraces(false);
    }
  };

  return (
    <div className="flex h-full bg-slate-50/50">
      {/* Main content — scrollable trace feed */}
      <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar" ref={scrollRef}>
        <DiscoveryOverviewBar
          participantCount={participantCount}
          traceCount={activeTraces.length}
          feedbackCount={feedbackCount}
          currentModel={currentModel}
          modelOptions={modelOptions}
          onRunAnalysis={handleRunAnalysis}
          onModelChange={handleModelChange}
          onPauseToggle={handlePauseToggle}
          onAddTraces={() => setShowAddTracesDialog(true)}
          isPaused={isPaused}
          isAnalysisRunning={runAnalysis.isPending}
          hasMlflowConfig={modelOptions.length > 0}
          discoveryMode={discoveryMode}
          followupsEnabled={followupsEnabled}
          onModeChange={handleModeChange}
          onFollowupsToggle={handleFollowupsToggle}
        />

        {discoveryMode === 'analysis' && currentAnalysis && (
          <div className="animate-in fade-in slide-in-from-top-4">
            <CrossTraceAnalysisSummary
              analysis={currentAnalysis}
              onPromote={handlePromote}
              onNavigateToOrigin={handleNavigateToOrigin}
              promotedKeys={promotedKeys}
            />
          </div>
        )}

        <div className="space-y-6 max-w-6xl mx-auto w-full">
          {activeTraces.map((trace) => (
            <DiscoveryTraceCard
              key={trace.id}
              workshopId={workshopId!}
              currentUserId={user?.id || ''}
              canModerateComments={isFacilitator}
              mode={discoveryMode}
              trace={trace}
              feedback={feedbackByTrace.get(trace.id) ?? []}
              findings={findingsByTrace.get(trace.id)}
              disagreements={disagreementsByTrace.get(trace.id)}
              onPromote={handlePromote}
              onNavigateToOrigin={handleNavigateToOrigin}
              promotedKeys={promotedKeys}
              followupsEnabled={discoveryConfig?.discovery_followups_enabled ?? true}
            />
          ))}
        </div>

        {activeTraces.length === 0 && (
          <div className="flex flex-col items-center justify-center py-20 text-slate-400 bg-white rounded-xl border border-slate-200 border-dashed max-w-5xl mx-auto">
            <div className="h-16 w-16 rounded-full bg-slate-100 flex items-center justify-center mb-4">
              <svg className="w-8 h-8 text-slate-300" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
              </svg>
            </div>
            <h3 className="text-lg font-semibold text-slate-700 mb-1">No Traces Yet</h3>
            <p className="text-sm max-w-sm text-center">Add discovery traces to start analyzing feedback and collaborating with your team.</p>
            <Button onClick={() => setShowAddTracesDialog(true)} className="mt-6 bg-indigo-600 hover:bg-indigo-700">
              Add Traces Now
            </Button>
          </div>
        )}
      </div>

      {/* Draft Rubric Sidebar: docked by default, can pop out into a modal */}
      {discoveryMode === 'analysis' && !isDraftPaneModalOpen && (
        <div className={`${isDraftPaneExpanded ? 'w-[40rem]' : 'w-80'} transition-[width] duration-200 border-l bg-slate-50 overflow-y-auto shrink-0`}>
          <DraftRubricSidebar
            items={draftItems}
            workshopId={workshopId!}
            userId={user?.id || ''}
            onCreateRubric={handleCreateRubric}
            newItemIds={newItemIds}
            onFocusWithinChange={setIsDraftPaneExpanded}
            onTogglePopout={() => setIsDraftPaneModalOpen(true)}
            onNavigateToOrigin={handleNavigateToOrigin}
          />
        </div>
      )}

      <Dialog open={isDraftPaneModalOpen && discoveryMode === 'analysis'} onOpenChange={setIsDraftPaneModalOpen}>
        <DialogContent className="w-[95vw] max-w-5xl h-[85vh] p-0">
          <DraftRubricSidebar
            items={draftItems}
            workshopId={workshopId!}
            userId={user?.id || ''}
            onCreateRubric={handleCreateRubric}
            newItemIds={newItemIds}
            isModal
            onTogglePopout={() => setIsDraftPaneModalOpen(false)}
            onNavigateToOrigin={handleNavigateToOrigin}
          />
        </DialogContent>
      </Dialog>

      <Dialog open={showAddTracesDialog} onOpenChange={setShowAddTracesDialog}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>Add Discovery Traces</DialogTitle>
            <DialogDescription>
              How many additional traces should be added to the discovery phase?
            </DialogDescription>
          </DialogHeader>
          <Input
            type="number"
            min="1"
            placeholder="Number of traces"
            value={tracesCountInput}
            onChange={(e) => setTracesCountInput(e.target.value)}
            disabled={isAddingTraces}
            autoFocus
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddTracesDialog(false)} disabled={isAddingTraces}>
              Cancel
            </Button>
            <Button onClick={handleAddTracesConfirm} disabled={isAddingTraces || !tracesCountInput}>
              {isAddingTraces ? 'Adding...' : 'Add Traces'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};
