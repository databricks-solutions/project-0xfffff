import React from 'react';
import type { TraceEvalScore, TraceRubric } from '@/hooks/useWorkshopApi';

type Props = {
  rubric: TraceRubric | null;
  score: TraceEvalScore | null;
};

export function TraceRubricView({ rubric, score }: Props) {
  return (
    <div className="space-y-4">
      <div className="rounded-md border p-4">
        <h3 className="font-medium mb-2">Rendered Rubric</h3>
        <pre className="text-xs whitespace-pre-wrap text-muted-foreground">{rubric?.markdown || 'No rubric yet.'}</pre>
      </div>

      <div className="rounded-md border p-4">
        <h3 className="font-medium mb-2">Score Snapshot</h3>
        {score ? (
          <div className="text-sm space-y-1">
            <div>Hurdle passed: {score.hurdle_passed ? 'yes' : 'no'}</div>
            <div>Raw score: {score.raw_score.toFixed(2)}</div>
            <div>Max possible: {score.max_possible.toFixed(2)}</div>
            <div>Normalized: {score.normalized_score.toFixed(2)}</div>
          </div>
        ) : (
          <p className="text-sm text-muted-foreground">No score computed yet.</p>
        )}
      </div>
    </div>
  );
}
