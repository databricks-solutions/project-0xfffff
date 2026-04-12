/**
 * SummarizationSettings Component
 *
 * Allows facilitators to configure LLM-powered trace summarization for a workshop.
 * When enabled, traces are automatically summarized into milestone views at ingestion time.
 */

import React, { useState, useEffect, useMemo } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Sparkles, Save } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkshopContext } from '@/context/WorkshopContext';
import {
  useWorkshop,
  useAvailableModels,
  useUpdateSummarizationSettings,
} from '@/hooks/useWorkshopApi';
import { buildModelOptions } from '@/utils/modelMapping';

export const SummarizationSettings: React.FC = () => {
  const { workshopId } = useWorkshopContext();
  const { data: workshop } = useWorkshop(workshopId!);
  const { data: availableModels } = useAvailableModels(workshopId!);
  const updateSettings = useUpdateSummarizationSettings(workshopId!);

  const [enabled, setEnabled] = useState(false);
  const [model, setModel] = useState<string>('');
  const [guidance, setGuidance] = useState('');

  // Sync form state with workshop data
  useEffect(() => {
    if (workshop) {
      setEnabled(workshop.summarization_enabled ?? false);
      setModel(workshop.summarization_model ?? '');
      setGuidance(workshop.summarization_guidance ?? '');
    }
  }, [workshop]);

  const modelOptions = useMemo(() => availableModels ? buildModelOptions(availableModels) : [], [availableModels]);

  const hasChanges = (
    (enabled !== (workshop?.summarization_enabled ?? false)) ||
    (model !== (workshop?.summarization_model ?? '')) ||
    (guidance !== (workshop?.summarization_guidance ?? ''))
  );

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
      </CardContent>
    </Card>
  );
};
