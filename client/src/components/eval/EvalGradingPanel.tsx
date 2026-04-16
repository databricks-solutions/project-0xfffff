import React, { useEffect, useRef } from 'react';
import { useTraceCriteria, useEvalResults, useCreateCriterionEvaluation } from '@/hooks/useWorkshopApi';
import { Badge } from '@/components/ui/badge';
import { Check, X, AlertTriangle, ChevronRight } from 'lucide-react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface EvalGradingPanelProps {
  workshopId: string;
  traceId: string;
  activeMilestoneRef?: string | null;
  onHoverCriterion?: (milestoneRef: string | null) => void;
  onClose?: () => void;
}

export const EvalGradingPanel: React.FC<EvalGradingPanelProps> = ({
  workshopId,
  traceId,
  activeMilestoneRef,
  onHoverCriterion,
  onClose,
}) => {
  const { data: criteria = [], isLoading: criteriaLoading } = useTraceCriteria(workshopId, traceId);
  const { data: evalResults = [], isLoading: resultsLoading } = useEvalResults(workshopId, traceId, 'HUMAN');
  const createEval = useCreateCriterionEvaluation(workshopId, traceId);
  const scrollContainerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (activeMilestoneRef && scrollContainerRef.current) {
      const el = scrollContainerRef.current.querySelector(`[data-milestone-ref="${activeMilestoneRef}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }
  }, [activeMilestoneRef]);

  const traceScore = evalResults.find(r => r.trace_id === traceId);
  const criteriaResults = traceScore?.criteria_results || [];
  const hurdleResults = traceScore?.hurdle_results || [];
  
  // Combine all results for easy lookup
  const allResults = [...criteriaResults, ...hurdleResults];
  const resultsByCriterionId = new Map(allResults.map(r => [r.criterion_id, r]));

  const handleToggle = (criterionId: string, met: boolean) => {
    createEval.mutate({
      criterion_id: criterionId,
      judge_model: 'HUMAN',
      met,
    });
  };

  if (criteriaLoading || resultsLoading) {
    return (
      <div className="flex items-center justify-center h-full text-slate-400">
        Loading criteria...
      </div>
    );
  }

  if (criteria.length === 0) {
    return (
      <div className="flex flex-col items-center justify-center h-full p-6 text-center text-slate-500">
        <AlertTriangle className="w-8 h-8 mb-3 text-slate-300" />
        <p className="text-sm font-medium text-slate-600">No criteria defined</p>
        <p className="text-xs mt-1 max-w-[200px]">
          Create criteria in the Discussion tab to start grading.
        </p>
      </div>
    );
  }

  // Calculate scores for the slider
  const rawScore = traceScore?.raw_score || 0;
  const maxPossible = traceScore?.max_possible || 0;
  const normalizedScore = traceScore?.normalized_score || 0;
  const hurdlePassed = traceScore?.hurdle_passed ?? true;

  return (
    <div className="flex flex-col h-full overflow-hidden bg-white/80 backdrop-blur-2xl rounded-2xl">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <h3 className="text-lg font-bold text-slate-900 tracking-tight">
          Grading
        </h3>
        {onClose && (
          <button onClick={onClose} className="p-1.5 hover:bg-slate-100 rounded-full text-slate-400 hover:text-slate-600 transition-colors">
            <ChevronRight className="w-5 h-5" />
          </button>
        )}
      </div>
      <div 
        ref={scrollContainerRef}
        className="flex-1 overflow-y-auto px-4 py-4 custom-scrollbar"
      >
        <table className="w-full text-sm text-left">
          <thead className="text-xs text-slate-500 uppercase bg-slate-50/50 sticky top-0 z-10 backdrop-blur-md">
            <tr>
              <th className="px-4 py-3 font-semibold rounded-tl-lg">Criterion</th>
              <th className="px-4 py-3 font-semibold w-24 text-center">Points</th>
              <th className="px-4 py-3 font-semibold w-32 text-center rounded-tr-lg">Present</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {criteria.map((criterion) => {
              const result = resultsByCriterionId.get(criterion.id);
              const isHurdle = criterion.criterion_type === 'hurdle';
              const isMet = result?.met;
              
              const milestoneRefs: string[] = (criterion as any).milestone_refs || [];
              const milestoneRef = milestoneRefs.length > 0
                ? milestoneRefs[0].split(':').pop() || null
                : null;

              return (
                <tr 
                  key={criterion.id} 
                  data-milestone-ref={milestoneRef}
                  className="hover:bg-slate-50/50 transition-colors group"
                  onMouseEnter={() => onHoverCriterion?.(milestoneRef)}
                  onMouseLeave={() => onHoverCriterion?.(null)}
                >
                  <td className="px-4 py-4">
                    <div className="prose prose-sm prose-slate max-w-none">
                      <ReactMarkdown
                        remarkPlugins={[remarkGfm]}
                        components={{
                          p: ({ children }) => <p className="m-0 leading-relaxed font-medium text-slate-700">{children}</p>,
                          a: ({ children }) => <span className="text-indigo-600 font-semibold">{children}</span>
                        }}
                      >
                        {criterion.text}
                      </ReactMarkdown>
                    </div>
                  </td>
                  <td className="px-4 py-4 text-center">
                    {isHurdle ? (
                      <Badge variant="outline" className="bg-rose-50 text-rose-700 border-rose-200 uppercase tracking-wider text-[10px]">
                        Gate
                      </Badge>
                    ) : (
                      <span className={`font-mono font-bold ${criterion.weight > 0 ? 'text-emerald-600' : 'text-rose-600'}`}>
                        {criterion.weight > 0 ? '+' : ''}{criterion.weight}
                      </span>
                    )}
                  </td>
                  <td className="px-4 py-4">
                    <div className="flex items-center justify-center gap-1 bg-slate-100/50 p-1 rounded-lg border border-slate-200/50">
                      <button
                        type="button"
                        onClick={() => handleToggle(criterion.id, true)}
                        className={`flex-1 flex items-center justify-center py-1.5 rounded-md transition-all ${
                          isMet === true
                            ? 'bg-emerald-500 text-white shadow-sm'
                            : 'text-slate-400 hover:text-emerald-600 hover:bg-emerald-50'
                        }`}
                      >
                        <Check className="w-4 h-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => handleToggle(criterion.id, false)}
                        className={`flex-1 flex items-center justify-center py-1.5 rounded-md transition-all ${
                          isMet === false
                            ? 'bg-rose-500 text-white shadow-sm'
                            : 'text-slate-400 hover:text-rose-600 hover:bg-rose-50'
                        }`}
                      >
                        <X className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>

      {/* Score Bar (HealthBench style) */}
      <div className="mt-auto border-t border-slate-200 bg-slate-50/80 p-6">
        <div className="flex items-center justify-between mb-2">
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Actual Score</span>
          <span className="text-xs font-bold text-slate-500 uppercase tracking-wider">Max Score</span>
        </div>
        
        <div className="relative h-2 bg-slate-200 rounded-full overflow-hidden mb-2">
          <div 
            className={`absolute top-0 left-0 h-full rounded-full transition-all duration-500 ${
              !hurdlePassed ? 'bg-rose-500' : 'bg-emerald-500'
            }`}
            style={{ width: `${!hurdlePassed ? 0 : normalizedScore * 100}%` }}
          />
        </div>
        
        <div className="flex items-center justify-between">
          <span className={`text-lg font-bold font-mono ${!hurdlePassed ? 'text-rose-600' : 'text-slate-900'}`}>
            {!hurdlePassed ? '0 (Gate Failed)' : rawScore}
          </span>
          <span className="text-sm font-bold font-mono text-slate-400">
            {maxPossible}
          </span>
        </div>
      </div>
    </div>
  );
};
