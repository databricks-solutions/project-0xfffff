/**
 * SummarizationSettings Component
 *
 * Allows facilitators to configure LLM-powered trace summarization for a workshop.
 * When enabled, traces are automatically summarized into milestone views at ingestion time.
 * Shows progress during active summarization jobs and allows manual re-summarization.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Save, CheckCircle, RefreshCw, BarChart3, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkshopContext } from '@/context/WorkshopContext';
import {
  useWorkshopSummarizationConfig,
  useAvailableModels,
  useUpdateSummarizationSettings,
  useSummarizationJob,
  useSummarizationStatus,
  useResummarize,
  useCancelSummarizationJob,
} from '@/hooks/useWorkshopApi';
import { buildModelOptions } from '@/utils/modelMapping';

export const SummarizationSettings: React.FC = () => {
  const { workshopId } = useWorkshopContext();
  const { data: workshop } = useWorkshopSummarizationConfig(workshopId!);
  const { data: availableModels } = useAvailableModels(workshopId!);
  const updateSettings = useUpdateSummarizationSettings(workshopId!);
  const { data: summaryStatus } = useSummarizationStatus(workshopId!);
  const resummarize = useResummarize(workshopId!);
  const cancelJob = useCancelSummarizationJob(workshopId!);

  const [enabled, setEnabled] = useState(false);
  const [model, setModel] = useState<string>('');
  const [guidance, setGuidance] = useState('');

  // Track the active job ID — either from a resummarize action or from the last job
  const [activeJobId, setActiveJobId] = useState<string | null>(null);
  const { data: activeJob } = useSummarizationJob(workshopId!, activeJobId);

  // Confirmation dialog state
  const [showConfirmDialog, setShowConfirmDialog] = useState(false);
  const [resummarizeMode, setResummarizeMode] = useState<'all' | 'unsummarized'>('unsummarized');

  // Sync form state with workshop data
  useEffect(() => {
    if (workshop) {
      setEnabled(workshop.summarization_enabled ?? false);
      setModel(workshop.summarization_model ?? '');
      setGuidance(workshop.summarization_guidance ?? '');
    }
  }, [workshop]);

  // On mount, check if there's an in-progress job from the last status
  useEffect(() => {
    if (summaryStatus?.last_job) {
      const lastJob = summaryStatus.last_job;
      if (lastJob.status === 'pending' || lastJob.status === 'running') {
        setActiveJobId(lastJob.id);
      }
    }
  }, [summaryStatus?.last_job]);

  const modelOptions = useMemo(() => availableModels ? buildModelOptions(availableModels) : [], [availableModels]);

  const hasChanges = (
    (enabled !== (workshop?.summarization_enabled ?? false)) ||
    (model !== (workshop?.summarization_model ?? '')) ||
    (guidance !== (workshop?.summarization_guidance ?? ''))
  );

  const isJobActive = activeJob && (activeJob.status === 'pending' || activeJob.status === 'running');

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        summarization_enabled: enabled,
        summarization_model: model || null,
        summarization_guidance: guidance || null,
      });
      toast.success('Summarization settings saved successfully');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save settings';
      toast.error(message);
    }
  };

  const handleResummarize = async (mode: 'all' | 'unsummarized' | 'failed') => {
    try {
      const result = await resummarize.mutateAsync({ mode });
      if (result.job_id) {
        setActiveJobId(result.job_id);
        toast.success(result.message);
      } else {
        toast.info(result.message);
      }
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to start summarization';
      toast.error(message);
    }
    setShowConfirmDialog(false);
  };

  const handleCancel = async () => {
    if (!activeJobId) return;
    try {
      await cancelJob.mutateAsync(activeJobId);
      toast.success('Summarization job cancelled');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to cancel job';
      toast.error(message);
    }
  };

  const totalTraces = summaryStatus
    ? summaryStatus.traces_with_summaries + summaryStatus.traces_without_summaries
    : 0;

  return (
    <Card className="border-l-4 border-indigo-500">
      <CardContent className="p-4 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-1">
            <Sparkles className="w-4 h-4 text-indigo-600" />
            Trace Summarization
          </h3>
          <p className="text-xs text-gray-500">
            When enabled, traces will be automatically summarized into a milestone view at ingestion time using an LLM.
          </p>
        </div>

        {/* Enable/Disable Toggle */}
        <div className="flex items-center gap-3">
          <Switch
            id="summarization-toggle"
            checked={enabled}
            onCheckedChange={setEnabled}
          />
          <Label htmlFor="summarization-toggle" className="text-sm font-medium text-gray-700 cursor-pointer">
            {enabled ? 'Enabled' : 'Disabled'}
          </Label>
        </div>

        {/* Model and Guidance — shown when enabled */}
        {enabled && (
          <>
            {/* Model Selector */}
            <div className="space-y-1.5">
              <Label htmlFor="summarization-model" className="text-xs font-medium text-gray-600">
                Summarization Model
              </Label>
              <Select value={model} onValueChange={setModel}>
                <SelectTrigger id="summarization-model" data-testid="summarization-model-selector">
                  <SelectValue placeholder="Select a model..." />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map((option) => (
                    <SelectItem
                      key={option.value}
                      value={option.value}
                      disabled={option.disabled}
                    >
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              {modelOptions.length === 0 && (
                <p className="text-xs text-amber-600">
                  MLflow configuration required to use Databricks models. Configure it in the intake settings.
                </p>
              )}
            </div>

            {/* Guidance Textarea */}
            <div className="space-y-1.5">
              <Label htmlFor="summarization-guidance" className="text-xs font-medium text-gray-600">
                Guidance (optional)
              </Label>
              <Textarea
                id="summarization-guidance"
                value={guidance}
                onChange={(e) => setGuidance(e.target.value)}
                placeholder="e.g., Focus on tool call decisions and error recovery..."
                rows={3}
                className="text-sm"
              />
              <p className="text-xs text-gray-400">
                Provide optional instructions to guide how the LLM summarizes traces.
              </p>
            </div>
          </>
        )}

        {/* Save Button */}
        <div className="flex gap-2">
          <Button
            size="sm"
            onClick={handleSave}
            disabled={updateSettings.isPending || !hasChanges}
          >
            {updateSettings.isPending ? (
              <div className="w-3.5 h-3.5 border border-white/30 border-t-white rounded-full animate-spin mr-2" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-2" />
            )}
            Save Settings
          </Button>
        </div>

        {/* Summarization Status & Progress */}
        {enabled && summaryStatus && (
          <div className="border-t pt-4 space-y-3">
            {/* Aggregate coverage */}
            <div className="flex items-center gap-2 text-xs text-gray-500">
              <BarChart3 className="w-3.5 h-3.5" />
              <span>
                {summaryStatus.traces_with_summaries} / {totalTraces} traces summarized
              </span>
              {summaryStatus.last_job && (
                <span className="text-gray-400">
                  &middot; Last run: {new Date(summaryStatus.last_job.created_at).toLocaleDateString()}
                </span>
              )}
            </div>

            {/* Active job progress */}
            {isJobActive && (
              <div className="bg-indigo-50 border border-indigo-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-indigo-900 flex items-center gap-2">
                    <div className="w-3.5 h-3.5 border-2 border-indigo-300 border-t-indigo-600 rounded-full animate-spin" />
                    Summarizing traces...
                  </span>
                  <div className="flex items-center gap-3">
                    <span className="text-indigo-700">
                      {activeJob.completed}/{activeJob.total} complete
                      {activeJob.failed > 0 && (
                        <span className="text-red-600 ml-1">({activeJob.failed} failed)</span>
                      )}
                    </span>
                    <Button
                      size="sm"
                      variant="ghost"
                      className="h-6 px-2 text-xs text-red-600 hover:text-red-700 hover:bg-red-50"
                      onClick={handleCancel}
                      disabled={cancelJob.isPending}
                    >
                      <XCircle className="w-3.5 h-3.5 mr-1" />
                      Cancel
                    </Button>
                  </div>
                </div>
                <div className="w-full bg-indigo-200 rounded-full h-1.5">
                  <div
                    className="bg-indigo-600 h-1.5 rounded-full transition-all duration-500"
                    style={{
                      width: `${activeJob.total > 0 ? ((activeJob.completed + activeJob.failed) / activeJob.total) * 100 : 0}%`,
                    }}
                  />
                </div>
              </div>
            )}

            {/* Completed job result */}
            {activeJob && activeJob.status === 'completed' && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-green-900 flex items-center gap-2">
                    <CheckCircle className="w-3.5 h-3.5 text-green-600" />
                    Summarization complete
                  </span>
                  <span className="text-green-700">
                    {activeJob.completed} succeeded
                    {activeJob.failed > 0 && (
                      <span className="text-red-600 ml-1">, {activeJob.failed} failed</span>
                    )}
                  </span>
                </div>

                {/* Failed traces detail */}
                {activeJob.failed > 0 && (
                  <div className="mt-2 space-y-1">
                    <p className="text-xs font-medium text-red-700">Failed traces:</p>
                    <div className="max-h-32 overflow-y-auto space-y-1">
                      {activeJob.failed_traces.map((ft: { trace_id: string; error: string; events?: Array<{ event?: string; tool_name?: string; phase?: string; result_summary?: string }> }) => (
                        <div key={ft.trace_id} className="text-xs text-red-600 bg-red-50 rounded px-2 py-1 space-y-1">
                          <div>
                            <span className="font-mono">{ft.trace_id.slice(0, 12)}...</span>: {ft.error}
                          </div>
                          {Array.isArray(ft.events) && ft.events.length > 0 && (
                            <div className="text-[11px] text-red-700/90">
                              {ft.events.slice(-4).map((evt, idx) => (
                                <div key={`${ft.trace_id}-evt-${idx}`} className="font-mono">
                                  {evt.phase ? `[${evt.phase}] ` : ''}
                                  {evt.event || 'event'}
                                  {evt.tool_name ? ` ${evt.tool_name}` : ''}
                                  {evt.result_summary ? `: ${evt.result_summary}` : ''}
                                </div>
                              ))}
                            </div>
                          )}
                        </div>
                      ))}
                    </div>
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-xs mt-1"
                      onClick={() => handleResummarize('failed')}
                      disabled={resummarize.isPending}
                    >
                      <RefreshCw className="w-3 h-3 mr-1" />
                      Retry failed traces
                    </Button>
                  </div>
                )}
              </div>
            )}

            {/* Cancelled job result */}
            {activeJob && activeJob.status === 'cancelled' && (
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 space-y-2">
                <div className="flex items-center justify-between text-sm">
                  <span className="font-medium text-amber-900 flex items-center gap-2">
                    <XCircle className="w-3.5 h-3.5 text-amber-600" />
                    Summarization cancelled
                  </span>
                  <span className="text-amber-700">
                    {activeJob.completed}/{activeJob.total} completed before cancellation
                  </span>
                </div>
              </div>
            )}

            {/* Re-summarize controls */}
            <div className="flex gap-2">
              <Button
                size="sm"
                variant="outline"
                disabled={!!isJobActive || resummarize.isPending}
                onClick={() => setShowConfirmDialog(true)}
              >
                <RefreshCw className="w-3.5 h-3.5 mr-2" />
                Re-summarize
              </Button>
            </div>
          </div>
        )}

        {/* Confirmation Dialog */}
        {showConfirmDialog && (
          <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
            <div className="bg-white rounded-lg p-6 max-w-sm mx-4 space-y-4">
              <h3 className="font-semibold text-gray-900">Re-summarize Traces</h3>
              <div className="space-y-2">
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="resummarize-mode"
                    checked={resummarizeMode === 'unsummarized'}
                    onChange={() => setResummarizeMode('unsummarized')}
                  />
                  Only unsummarized traces
                  {summaryStatus && (
                    <Badge variant="secondary" className="text-xs">
                      {summaryStatus.traces_without_summaries}
                    </Badge>
                  )}
                </label>
                <label className="flex items-center gap-2 text-sm cursor-pointer">
                  <input
                    type="radio"
                    name="resummarize-mode"
                    checked={resummarizeMode === 'all'}
                    onChange={() => setResummarizeMode('all')}
                  />
                  All traces (overwrites existing summaries)
                </label>
              </div>
              <div className="flex gap-2 justify-end">
                <Button size="sm" variant="outline" onClick={() => setShowConfirmDialog(false)}>
                  Cancel
                </Button>
                <Button size="sm" onClick={() => handleResummarize(resummarizeMode)}>
                  Start
                </Button>
              </div>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
