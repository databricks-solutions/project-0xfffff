import React from 'react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import {
  useAllTraces,
  useCreateTraceCriterion,
  useDeleteTraceCriterion,
  useEvalAlignmentStatus,
  useEvalIRR,
  useEvalJobStatus,
  useEvalResults,
  useStartEvalAlignment,
  useStartEvalJudgeRun,
  useTraceCriteria,
  useTraceRubric,
  useUpdateTraceCriterion,
} from '@/hooks/useWorkshopApi';
import { CriterionEditor } from './CriterionEditor';
import { TraceRubricView } from './TraceRubricView';

export function EvalModeWorkspace() {
  const { workshopId } = useWorkshopContext();
  const { data: traces = [] } = useAllTraces(workshopId || '');
  const [selectedTraceId, setSelectedTraceId] = React.useState<string | null>(null);
  const [evalJobId, setEvalJobId] = React.useState<string | null>(null);

  React.useEffect(() => {
    if (!selectedTraceId && traces.length > 0) {
      setSelectedTraceId(traces[0].id);
    }
  }, [selectedTraceId, traces]);

  const traceId = selectedTraceId || '';
  const { data: criteria = [] } = useTraceCriteria(workshopId || '', traceId);
  const { data: rubric = null } = useTraceRubric(workshopId || '', traceId);
  const { data: scores = [] } = useEvalResults(workshopId || '', traceId || undefined);

  const createCriterion = useCreateTraceCriterion(workshopId || '', traceId);
  const updateCriterion = useUpdateTraceCriterion(workshopId || '');
  const deleteCriterion = useDeleteTraceCriterion(workshopId || '');

  const startJudgeRun = useStartEvalJudgeRun(workshopId || '');
  const { data: evalJob } = useEvalJobStatus(workshopId || '', evalJobId);
  const { data: evalIrr } = useEvalIRR(workshopId || '');
  const { data: alignmentStatus } = useEvalAlignmentStatus(workshopId || '');
  const startAlignment = useStartEvalAlignment(workshopId || '');

  const currentScore = scores.find((score) => score.trace_id === traceId) || null;

  const handleRunEvaluation = async () => {
    try {
      const result = await startJudgeRun.mutateAsync({ model_name: 'demo' });
      setEvalJobId(result.job_id);
    } catch {
      // Error handled by mutation
    }
  };

  const handleRunAlignment = async () => {
    try {
      await startAlignment.mutateAsync({ evaluation_model_name: 'demo' });
    } catch {
      // Error handled by mutation
    }
  };

  if (!workshopId) {
    return <div className="p-6 text-sm text-muted-foreground">Select a workshop to use eval mode.</div>;
  }

  if (traces.length === 0) {
    return <div className="p-6 text-sm text-muted-foreground">No traces available in this workshop yet.</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <div className="flex items-center justify-between">
        <h2 className="text-lg font-semibold">Eval Mode Workspace</h2>
        <div className="flex items-center gap-2">
          <button
            className="px-3 py-1.5 text-sm rounded-md bg-indigo-600 text-white hover:bg-indigo-700 disabled:opacity-50"
            onClick={handleRunEvaluation}
            disabled={startJudgeRun.isPending || (evalJob?.status === 'running')}
          >
            {evalJob?.status === 'running'
              ? `Evaluating ${evalJob.completed}/${evalJob.total}...`
              : 'Run Evaluation'}
          </button>
          <button
            className="px-3 py-1.5 text-sm rounded-md bg-emerald-600 text-white hover:bg-emerald-700 disabled:opacity-50"
            onClick={handleRunAlignment}
            disabled={startAlignment.isPending || !alignmentStatus?.ready_for_alignment}
          >
            Run Alignment
          </button>
        </div>
      </div>

      {/* IRR and Alignment Status Bar */}
      <div className="flex gap-4 text-sm">
        {evalIrr && evalIrr.total_pairs > 0 && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-100">
            <span className="font-medium text-slate-600">IRR:</span>
            <span className={`font-bold ${evalIrr.ready_to_proceed ? 'text-emerald-600' : 'text-amber-600'}`}>
              {evalIrr.agreement_pct}%
            </span>
            <span className="text-slate-500">
              ({evalIrr.agreeing_pairs}/{evalIrr.total_pairs} agree)
            </span>
          </div>
        )}
        {alignmentStatus && (
          <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-slate-100">
            <span className="font-medium text-slate-600">Alignment:</span>
            <span className="text-slate-500">{alignmentStatus.message}</span>
          </div>
        )}
      </div>

      <div className="grid grid-cols-[260px_1fr_1fr] gap-4">
        <div className="rounded-md border p-3 space-y-2">
          <h3 className="font-medium">Traces</h3>
          {traces.map((trace: { id: string }) => (
            <button
              key={trace.id}
              className={`w-full text-left text-sm rounded px-2 py-1 ${
                trace.id === selectedTraceId ? 'bg-primary/10 font-medium' : 'hover:bg-muted'
              }`}
              onClick={() => setSelectedTraceId(trace.id)}
            >
              {trace.id}
            </button>
          ))}
        </div>

        <CriterionEditor
          criteria={criteria}
          onCreate={async (data) => {
            await createCriterion.mutateAsync({
              ...data,
              created_by: 'facilitator',
            });
          }}
          onUpdate={async (criterionId, data) => {
            await updateCriterion.mutateAsync({ criterionId, updates: data });
          }}
          onDelete={async (criterionId) => {
            await deleteCriterion.mutateAsync(criterionId);
          }}
        />

        <TraceRubricView rubric={rubric} score={currentScore} />
      </div>
    </div>
  );
}
