import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Play, Pause, Plus, Loader2, Sparkles, Settings2 } from 'lucide-react';
import { DropdownMenu, DropdownMenuContent, DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { GenerativeBlob, getHash } from '@/components/GenerativeBlob';
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
  discoveryMode: 'analysis' | 'social';
  followupsEnabled: boolean;
  onModeChange: (mode: 'analysis' | 'social') => void;
  onFollowupsToggle: () => void;
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
  discoveryMode,
  followupsEnabled,
  onModeChange,
  onFollowupsToggle,
}) => {
  const [template, setTemplate] = useState('evaluation_criteria');

  return (
    <div className="rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-slate-50/80 border-b border-slate-100 px-6 py-3 flex flex-wrap items-center justify-between gap-4">
        <div className="flex items-center gap-4">
          <GenerativeBlob 
            hash={getHash('workspace')} 
            sizeClassName="w-10 h-10"
          />
          <div className="flex items-center gap-3 text-sm font-medium text-slate-600">
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-emerald-500"></span> {participantCount} participants</span>
            <span className="text-slate-300">&bull;</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-indigo-500"></span> {traceCount} active traces</span>
            <span className="text-slate-300">&bull;</span>
            <span className="flex items-center gap-1.5"><span className="w-2 h-2 rounded-full bg-amber-500"></span> {feedbackCount} feedback items</span>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button 
                variant="outline" 
                size="sm" 
                className="h-9 w-9 p-0 bg-white border-slate-200 text-slate-700 hover:bg-slate-50 hover:text-slate-900 shadow-sm transition-all"
              >
                <Settings2 className="w-4 h-4" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-64 p-2">
              <DropdownMenuLabel className="text-xs font-bold uppercase tracking-wider text-slate-500 mb-2">Workspace Settings</DropdownMenuLabel>
              
              <div className="px-2 py-1.5">
                <div className="flex items-center justify-between mb-2">
                  <span className="text-sm font-medium text-slate-700">Mode</span>
                </div>
                <div className="flex items-center bg-slate-100 p-1 rounded-lg">
                  <button
                    className={`flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      discoveryMode === 'analysis'
                        ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/50'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                    onClick={() => onModeChange('analysis')}
                  >
                    Analysis
                  </button>
                  <button
                    className={`flex-1 px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                      discoveryMode === 'social'
                        ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/50'
                        : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
                    }`}
                    onClick={() => onModeChange('social')}
                  >
                    Social
                  </button>
                </div>
              </div>

              <DropdownMenuSeparator className="my-2" />
              
              <div className="px-2 py-1.5 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-sm font-medium text-slate-700">Auto Follow-ups</span>
                  <span className="text-[10px] text-slate-500">Agent asks questions</span>
                </div>
                <button
                  className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:ring-offset-2 ${
                    followupsEnabled ? 'bg-indigo-600' : 'bg-slate-300'
                  }`}
                  onClick={onFollowupsToggle}
                >
                  <span className="sr-only">Toggle follow-ups</span>
                  <span
                    className={`inline-block h-3 w-3 transform rounded-full bg-white transition-transform ${
                      followupsEnabled ? 'translate-x-5' : 'translate-x-1'
                    }`}
                  />
                </button>
              </div>
            </DropdownMenuContent>
          </DropdownMenu>

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
                <GenerativeBlob hash={getHash('run')} sizeClassName="w-4 h-4 mr-2" subtle />
                Run AI Analysis
              </>
            )}
          </Button>
        </div>
      </div>
    </div>
  );
};
