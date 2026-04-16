import React from 'react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import {
  useAllTraces,
  useCreateTraceCriterion,
  useDeleteTraceCriterion,
  useEvalResults,
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

  const currentScore = scores.find((score) => score.trace_id === traceId) || null;

  if (!workshopId) {
    return <div className="p-6 text-sm text-muted-foreground">Select a workshop to use eval mode.</div>;
  }

  if (traces.length === 0) {
    return <div className="p-6 text-sm text-muted-foreground">No traces available in this workshop yet.</div>;
  }

  return (
    <div className="p-6 space-y-4">
      <h2 className="text-lg font-semibold">Eval Mode Workspace</h2>
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
