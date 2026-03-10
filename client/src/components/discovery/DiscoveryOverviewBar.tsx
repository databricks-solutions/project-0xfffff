import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Pause, Plus, Loader2 } from 'lucide-react';
import type { ModelOption } from '@/utils/modelMapping';

interface DiscoveryOverviewBarProps {
  participantCount: number;
  traceCount: number;
  feedbackCount: number;
  currentModel: string;
  modelOptions: ModelOption[];
  onRunAnalysis: (template: string) => void;
  onModelChange: (model: string) => void;
  onPauseToggle: () => void;
  onAddTraces: () => void;
  isPaused: boolean;
  isAnalysisRunning: boolean;
  hasMlflowConfig: boolean;
}

export const DiscoveryOverviewBar: React.FC<DiscoveryOverviewBarProps> = ({
  participantCount,
  traceCount,
  feedbackCount,
  currentModel,
  modelOptions,
  onRunAnalysis,
  onModelChange,
  onPauseToggle,
  onAddTraces,
  isPaused,
  isAnalysisRunning,
  hasMlflowConfig,
}) => {
  const [template, setTemplate] = useState('evaluation_criteria');

  return (
    <div className="rounded-lg border bg-white px-5 py-3 space-y-2">
      <div className="flex items-center gap-3 text-sm text-slate-600">
        <span className="font-semibold text-slate-900">Discovery</span>
        <span className="text-slate-400">&middot;</span>
        <span>{participantCount} participants</span>
        <span className="text-slate-400">&middot;</span>
        <span>{traceCount} traces</span>
        <span className="text-slate-400">&middot;</span>
        <span>{feedbackCount} findings</span>
      </div>

      <div className="flex items-center gap-2 flex-wrap">
        <Select value={template} onValueChange={setTemplate}>
          <SelectTrigger className="w-44 h-8 text-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="evaluation_criteria">Eval Criteria</SelectItem>
            <SelectItem value="themes_patterns">Themes &amp; Patterns</SelectItem>
          </SelectContent>
        </Select>

        <Button
          size="sm"
          className="h-8 text-xs"
          disabled={isAnalysisRunning || !hasMlflowConfig}
          onClick={() => onRunAnalysis(template)}
        >
          {isAnalysisRunning ? (
            <>
              <Loader2 className="w-3 h-3 mr-1 animate-spin" />
              Analyzing...
            </>
          ) : (
            <>
              <Play className="w-3 h-3 mr-1" />
              Run Analysis
            </>
          )}
        </Button>

        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onAddTraces}>
          <Plus className="w-3 h-3 mr-1" />
          Add Traces
        </Button>

        <Button variant="outline" size="sm" className="h-8 text-xs" onClick={onPauseToggle}>
          {isPaused ? <Play className="w-3 h-3 mr-1" /> : <Pause className="w-3 h-3 mr-1" />}
          {isPaused ? 'Resume' : 'Pause'}
        </Button>

        <Select value={currentModel} onValueChange={onModelChange}>
          <SelectTrigger className="w-44 h-8 text-xs" data-testid="model-selector">
            <SelectValue placeholder="Model" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="demo">Demo (static questions)</SelectItem>
            {modelOptions.map((opt) => (
              <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled}>
                {opt.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>
    </div>
  );
};
