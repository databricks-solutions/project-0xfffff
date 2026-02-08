/**
 * JsonPathSettings Component
 *
 * Allows facilitators to configure JSONPath queries for extracting specific
 * values from trace inputs and outputs for cleaner display in the TraceViewer.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Code, Eye, Save, X, CheckCircle, AlertCircle } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useWorkshop, useUpdateJsonPathSettings, usePreviewJsonPath } from '@/hooks/useWorkshopApi';

export const JsonPathSettings: React.FC = () => {
  const { workshopId } = useWorkshopContext();
  const { data: workshop } = useWorkshop(workshopId!);
  const updateSettings = useUpdateJsonPathSettings(workshopId!);
  const previewJsonPath = usePreviewJsonPath(workshopId!);

  // Local state for form
  const [inputJsonPath, setInputJsonPath] = useState<string>('');
  const [outputJsonPath, setOutputJsonPath] = useState<string>('');
  const [showPreview, setShowPreview] = useState(false);
  const [previewResult, setPreviewResult] = useState<{
    trace_id?: string;
    input_result?: string;
    input_success?: boolean;
    output_result?: string;
    output_success?: boolean;
    error?: string;
  } | null>(null);

  // Sync form state with workshop data
  useEffect(() => {
    if (workshop) {
      setInputJsonPath(workshop.input_jsonpath || '');
      setOutputJsonPath(workshop.output_jsonpath || '');
    }
  }, [workshop]);

  const handlePreview = async () => {
    try {
      const result = await previewJsonPath.mutateAsync({
        input_jsonpath: inputJsonPath || null,
        output_jsonpath: outputJsonPath || null,
      });
      setPreviewResult(result);
      setShowPreview(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to preview';
      toast.error(message);
    }
  };

  const handleSave = async () => {
    try {
      await updateSettings.mutateAsync({
        input_jsonpath: inputJsonPath || null,
        output_jsonpath: outputJsonPath || null,
      });
      toast.success('JSONPath settings saved successfully');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save settings';
      toast.error(message);
    }
  };

  const handleClear = () => {
    setInputJsonPath('');
    setOutputJsonPath('');
    setShowPreview(false);
    setPreviewResult(null);
  };

  const hasChanges = (
    (inputJsonPath || '') !== (workshop?.input_jsonpath || '') ||
    (outputJsonPath || '') !== (workshop?.output_jsonpath || '')
  );

  return (
    <Card className="border-l-4 border-gray-500">
      <CardContent className="p-4 space-y-4">
        <div>
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-1">
            <Code className="w-4 h-4 text-gray-600" />
            Trace Display Settings
          </h3>
          <p className="text-xs text-gray-500">
            Configure JSONPath queries to extract specific content from trace inputs and outputs for cleaner display. Leave empty to show the original trace data.
          </p>
        </div>

        {/* Input JSONPath */}
        <div className="space-y-1.5">
          <Label htmlFor="input-jsonpath" className="flex items-center gap-2 text-xs font-medium text-gray-600">
            Input JSONPath
            <Badge variant="outline" className="text-[10px] font-normal border-gray-300 text-gray-500">optional</Badge>
          </Label>
          <Input
            id="input-jsonpath"
            placeholder="$.messages[0].content"
            value={inputJsonPath}
            onChange={(e) => setInputJsonPath(e.target.value)}
            className="font-mono text-xs h-9"
          />
          <p className="text-xs text-gray-400">
            Extract specific content from trace input JSON (e.g., $.messages[0].content)
          </p>
        </div>

        {/* Output JSONPath */}
        <div className="space-y-1.5">
          <Label htmlFor="output-jsonpath" className="flex items-center gap-2 text-xs font-medium text-gray-600">
            Output JSONPath
            <Badge variant="outline" className="text-[10px] font-normal border-gray-300 text-gray-500">optional</Badge>
          </Label>
          <Input
            id="output-jsonpath"
            placeholder="$.response.text"
            value={outputJsonPath}
            onChange={(e) => setOutputJsonPath(e.target.value)}
            className="font-mono text-xs h-9"
          />
          <p className="text-xs text-gray-400">
            Extract specific content from trace output JSON (e.g., $.response.text)
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            onClick={handlePreview}
            disabled={previewJsonPath.isPending || (!inputJsonPath && !outputJsonPath)}
          >
            {previewJsonPath.isPending ? (
              <div className="w-3.5 h-3.5 border border-gray-300 border-t-gray-600 rounded-full animate-spin mr-2" />
            ) : (
              <Eye className="w-3.5 h-3.5 mr-2" />
            )}
            Preview
          </Button>
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
          {hasChanges && (
            <Button variant="ghost" size="sm" onClick={handleClear}>
              <X className="w-3.5 h-3.5 mr-2" />
              Clear
            </Button>
          )}
        </div>

        {/* Preview Results */}
        {showPreview && previewResult && (
          <div className="border rounded-md p-3 bg-gray-50 space-y-3">
            <div className="flex items-center justify-between">
              <h4 className="text-xs font-semibold text-gray-700">
                Preview Results
                {previewResult.trace_id && (
                  <span className="text-gray-400 ml-2 font-normal">
                    (Trace: {previewResult.trace_id.slice(0, 8)}...)
                  </span>
                )}
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(false)}
                className="h-5 w-5 p-0"
              >
                <X className="h-3 w-3" />
              </Button>
            </div>

            {previewResult.error ? (
              <div className="flex items-center gap-2 text-amber-600">
                <AlertCircle className="w-3.5 h-3.5" />
                <span className="text-xs">{previewResult.error}</span>
              </div>
            ) : (
              <>
                {/* Input Preview */}
                {inputJsonPath && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-gray-700">Input:</span>
                      {previewResult.input_success ? (
                        <Badge className="text-[10px] bg-green-50 text-green-700 border border-green-200">
                          <CheckCircle className="w-2.5 h-2.5 mr-1" />
                          Extracted
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                          <AlertCircle className="w-2.5 h-2.5 mr-1" />
                          Original
                        </Badge>
                      )}
                    </div>
                    <div className="bg-white border border-gray-200 rounded p-2 max-h-24 overflow-y-auto">
                      <pre className="text-[11px] whitespace-pre-wrap break-words text-gray-600">
                        {previewResult.input_result?.slice(0, 400)}
                        {(previewResult.input_result?.length || 0) > 400 && '...'}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Output Preview */}
                {outputJsonPath && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-xs">
                      <span className="font-medium text-gray-700">Output:</span>
                      {previewResult.output_success ? (
                        <Badge className="text-[10px] bg-green-50 text-green-700 border border-green-200">
                          <CheckCircle className="w-2.5 h-2.5 mr-1" />
                          Extracted
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                          <AlertCircle className="w-2.5 h-2.5 mr-1" />
                          Original
                        </Badge>
                      )}
                    </div>
                    <div className="bg-white border border-gray-200 rounded p-2 max-h-24 overflow-y-auto">
                      <pre className="text-[11px] whitespace-pre-wrap break-words text-gray-600">
                        {previewResult.output_result?.slice(0, 400)}
                        {(previewResult.output_result?.length || 0) > 400 && '...'}
                      </pre>
                    </div>
                  </div>
                )}
              </>
            )}
          </div>
        )}

        {/* Current Settings Display */}
        {(workshop?.input_jsonpath || workshop?.output_jsonpath) && (
          <div className="border-t border-gray-100 pt-3">
            <h4 className="text-xs font-medium mb-2 text-gray-500">Current Saved Settings</h4>
            <div className="flex flex-wrap gap-1.5">
              {workshop.input_jsonpath && (
                <Badge variant="secondary" className="font-mono text-[10px] bg-gray-100">
                  Input: {workshop.input_jsonpath}
                </Badge>
              )}
              {workshop.output_jsonpath && (
                <Badge variant="secondary" className="font-mono text-[10px] bg-gray-100">
                  Output: {workshop.output_jsonpath}
                </Badge>
              )}
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
};
