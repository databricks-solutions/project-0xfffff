import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Pause, Plus, Loader2, Sparkles } from 'lucide-react';
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
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-slate-50/80 border-b border-slate-100 px-6 py-4 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <div className="h-10 w-10 rounded-xl bg-indigo-600 text-white flex items-center justify-center shadow-md shadow-indigo-600/20">
            <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor">
              <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 11H5m14 0a2 2 0 012 2v6a2 2 0 01-2 2H5a2 2 0 01-2-2v-6a2 2 0 012-2m14 0V9a2 2 0 00-2-2M5 11V9a2 2 0 002-2m0 0V5a2 2 0 012-2h6a2 2 0 012 2v2M7 7h10" />
            </svg>
          </div>
          <div>
            <h2 className="text-lg font-bold text-slate-900 tracking-tight">Discovery Workspace</h2>
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500 mt-0.5">
              <span className="flex items-center gap-1"><span className="w-1.5 h-1.5 rounded-full bg-emerald-500"></span> {participantCount} participants</span>
              <span className="text-slate-300">&bull;</span>
              <span>{traceCount} active traces</span>
              <span className="text-slate-300">&bull;</span>
              <span>{feedbackCount} feedback items</span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <Button 
            variant="outline" 
            size="sm" 
            className="h-9 text-xs font-semibold bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-sm transition-all" 
            onClick={onAddTraces}
          >
            <Plus className="w-3.5 h-3.5 mr-1.5" />
            Add Traces
          </Button>

          <Button 
            variant={isPaused ? "default" : "outline"} 
            size="sm" 
            className={`h-9 text-xs font-semibold shadow-sm transition-all ${
              isPaused 
                ? 'bg-emerald-600 hover:bg-emerald-700 text-white border-transparent' 
                : 'bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900'
            }`} 
            onClick={onPauseToggle}
          >
            {isPaused ? <Play className="w-3.5 h-3.5 mr-1.5" /> : <Pause className="w-3.5 h-3.5 mr-1.5" />}
            {isPaused ? 'Resume Phase' : 'Pause Phase'}
          </Button>
        </div>
      </div>

      <div className="px-6 py-4 bg-white flex flex-wrap items-center gap-4">
        <div className="flex-1 flex items-center gap-3">
          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Analysis Template</label>
            <Select value={template} onValueChange={setTemplate}>
              <SelectTrigger className="w-[200px] h-9 text-sm font-medium bg-slate-50/50 border-slate-200 focus:ring-indigo-500">
                <SelectValue />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="evaluation_criteria" className="text-sm font-medium">Evaluation Criteria</SelectItem>
                <SelectItem value="themes_patterns" className="text-sm font-medium">Themes &amp; Patterns</SelectItem>
              </SelectContent>
            </Select>
          </div>

          <div className="flex flex-col gap-1.5">
            <label className="text-[10px] font-bold uppercase tracking-wider text-slate-500">AI Model</label>
            <Select value={currentModel} onValueChange={onModelChange}>
              <SelectTrigger className="w-[200px] h-9 text-sm font-medium bg-slate-50/50 border-slate-200 focus:ring-indigo-500" data-testid="model-selector">
                <SelectValue placeholder="Model" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="demo" className="text-sm font-medium">Demo (static questions)</SelectItem>
                {modelOptions.map((opt) => (
                  <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled} className="text-sm font-medium">
                    {opt.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>
        </div>

        <div className="flex items-end pb-0.5">
          <Button
            size="sm"
            className="h-9 px-5 text-sm font-semibold bg-indigo-600 hover:bg-indigo-700 text-white shadow-md shadow-indigo-600/20 transition-all"
            disabled={isAnalysisRunning || !hasMlflowConfig}
            onClick={() => onRunAnalysis(template)}
          >
            {isAnalysisRunning ? (
              <>
                <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                Analyzing Data...
              </>
            ) : (
              <>
                <Sparkles className="w-4 h-4 mr-2" />
                Run AI Analysis
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
