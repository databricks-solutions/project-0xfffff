import React, { useState, useMemo, useCallback } from 'react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useUser } from '@/context/UserContext';
import {
  useAllTraces,
  useFacilitatorDiscoveryFeedback,
  useDiscoveryAnalyses,
  useRunDiscoveryAnalysis,
  useDraftRubricItems,
  useCreateDraftRubricItem,
  useDeleteDraftRubricItem,
  useWorkshop,
  useUpdateDiscoveryModel,
  useCreateRubricFromDraft,
  useAvailableModels,
  type DiscoveryAnalysis,
} from '@/hooks/useWorkshopApi';
import type { Trace } from '@/client';
import { buildModelOptions } from '@/utils/modelMapping';
import { toast } from 'sonner';

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

  // Data
  const { data: workshop } = useWorkshop(workshopId!);
  const { data: traces } = useAllTraces(workshopId!) as { data: Trace[] | undefined };
  const { data: allFeedback } = useFacilitatorDiscoveryFeedback(workshopId!);
  const { data: analyses } = useDiscoveryAnalyses(workshopId!);
  const { data: draftItems = [] } = useDraftRubricItems(workshopId!);
  const { data: availableModels } = useAvailableModels(workshopId!);

  // Mutations
  const runAnalysis = useRunDiscoveryAnalysis(workshopId!);
  const createDraftItem = useCreateDraftRubricItem(workshopId!);
  const updateModelMutation = useUpdateDiscoveryModel(workshopId!);
  const deleteDraftItem = useDeleteDraftRubricItem(workshopId!);
  const createRubricFromDraft = useCreateRubricFromDraft(workshopId!);
  const [newItemIds, setNewItemIds] = useState<Set<string>>(new Set());

  // State
  const [promotedKeys, setPromotedKeys] = useState<Set<string>>(new Set());

  const modelOptions = useMemo(() => availableModels ? buildModelOptions(availableModels) : [], [availableModels]);
  const currentModel = workshop?.discovery_questions_model_name || 'demo';

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
    const activeIds = workshop?.active_discovery_trace_ids;
    if (activeIds?.length) {
      return traces.filter((t) => activeIds.includes(t.id));
    }
    return traces;
  }, [traces, workshop?.active_discovery_trace_ids]);

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
        source_trace_ids: payload.source_trace_ids,
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

  const handleModelChange = (value: string) => {
    updateModelMutation.mutate({ model_name: value });
  };

  const handleCreateRubric = useCallback(async () => {
    try {
      await createRubricFromDraft.mutateAsync(user?.id || '');
      onNavigate('rubric');
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Failed to create rubric from draft');
    }
  }, [createRubricFromDraft, user?.id, onNavigate]);

  const isPaused = workshop?.completed_phases?.includes('discovery') ?? false;

  return (
    <div className="flex h-full">
      {/* Main content — scrollable trace feed */}
      <div className="flex-1 overflow-y-auto p-5 space-y-4">
        <DiscoveryOverviewBar
          participantCount={participantCount}
          traceCount={activeTraces.length}
          feedbackCount={feedbackCount}
          currentModel={currentModel}
          modelOptions={modelOptions}
          onRunAnalysis={handleRunAnalysis}
          onModelChange={handleModelChange}
          onPauseToggle={() => {/* wire to phase control */}}
          onAddTraces={() => {/* wire to add traces */}}
          isPaused={isPaused}
          isAnalysisRunning={runAnalysis.isPending}
          hasMlflowConfig={modelOptions.length > 0}
        />

        {currentAnalysis && (
          <CrossTraceAnalysisSummary
            analysis={currentAnalysis}
            onPromote={handlePromote}
            promotedKeys={promotedKeys}
          />
        )}

        {activeTraces.map((trace) => (
          <DiscoveryTraceCard
            key={trace.id}
            trace={trace}
            feedback={feedbackByTrace.get(trace.id) ?? []}
            findings={findingsByTrace.get(trace.id)}
            disagreements={disagreementsByTrace.get(trace.id)}
            onPromote={handlePromote}
            promotedKeys={promotedKeys}
          />
        ))}

        {activeTraces.length === 0 && (
          <div className="text-center py-12 text-slate-500">
            <p className="text-sm">No discovery traces yet. Add traces to get started.</p>
          </div>
        )}
      </div>

      {/* Draft Rubric Sidebar */}
      <div className="w-80 border-l bg-slate-50 overflow-y-auto shrink-0">
        <DraftRubricSidebar
          items={draftItems}
          workshopId={workshopId!}
          userId={user?.id || ''}
          onCreateRubric={handleCreateRubric}
          newItemIds={newItemIds}
        />
      </div>
    </div>
  );
};
