/**
 * JsonPathSettings Component
 *
 * Allows facilitators to configure JSONPath queries for extracting specific
 * values from trace inputs and outputs for cleaner display in the TraceViewer.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
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
    <Card>
      <CardHeader>
        <CardTitle className="flex items-center gap-2">
          <Code className="w-5 h-5" />
          Trace Display Settings
        </CardTitle>
        <CardDescription>
          Configure JSONPath queries to extract specific content from trace inputs and outputs for cleaner display.
          Leave empty to show the original trace data.
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Input JSONPath */}
        <div className="space-y-2">
          <Label htmlFor="input-jsonpath" className="flex items-center gap-2">
            Input JSONPath
            <Badge variant="outline" className="text-xs font-normal">optional</Badge>
          </Label>
          <Input
            id="input-jsonpath"
            placeholder="$.messages[0].content"
            value={inputJsonPath}
            onChange={(e) => setInputJsonPath(e.target.value)}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Extract specific content from trace input JSON (e.g., $.messages[0].content)
          </p>
        </div>

        {/* Output JSONPath */}
        <div className="space-y-2">
          <Label htmlFor="output-jsonpath" className="flex items-center gap-2">
            Output JSONPath
            <Badge variant="outline" className="text-xs font-normal">optional</Badge>
          </Label>
          <Input
            id="output-jsonpath"
            placeholder="$.response.text"
            value={outputJsonPath}
            onChange={(e) => setOutputJsonPath(e.target.value)}
            className="font-mono text-sm"
          />
          <p className="text-xs text-muted-foreground">
            Extract specific content from trace output JSON (e.g., $.response.text)
          </p>
        </div>

        {/* Action Buttons */}
        <div className="flex gap-2">
          <Button
            variant="outline"
            onClick={handlePreview}
            disabled={previewJsonPath.isPending || (!inputJsonPath && !outputJsonPath)}
          >
            {previewJsonPath.isPending ? (
              <div className="w-4 h-4 border border-slate-300 border-t-slate-600 rounded-full animate-spin mr-2" />
            ) : (
              <Eye className="w-4 h-4 mr-2" />
            )}
            Preview
          </Button>
          <Button
            onClick={handleSave}
            disabled={updateSettings.isPending || !hasChanges}
          >
            {updateSettings.isPending ? (
              <div className="w-4 h-4 border border-white/30 border-t-white rounded-full animate-spin mr-2" />
            ) : (
              <Save className="w-4 h-4 mr-2" />
            )}
            Save Settings
          </Button>
          {hasChanges && (
            <Button variant="ghost" onClick={handleClear}>
              <X className="w-4 h-4 mr-2" />
              Clear
            </Button>
          )}
        </div>

        {/* Preview Results */}
        {showPreview && previewResult && (
          <div className="border rounded-lg p-4 bg-slate-50 space-y-4">
            <div className="flex items-center justify-between">
              <h4 className="font-medium text-sm">
                Preview Results
                {previewResult.trace_id && (
                  <span className="text-muted-foreground ml-2 font-normal">
                    (Trace: {previewResult.trace_id.slice(0, 8)}...)
                  </span>
                )}
              </h4>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowPreview(false)}
                className="h-6 w-6 p-0"
              >
                <X className="h-4 w-4" />
              </Button>
            </div>

            {previewResult.error ? (
              <div className="flex items-center gap-2 text-amber-600">
                <AlertCircle className="w-4 h-4" />
                <span className="text-sm">{previewResult.error}</span>
              </div>
            ) : (
              <>
                {/* Input Preview */}
                {inputJsonPath && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">Input Result:</span>
                      {previewResult.input_success ? (
                        <Badge variant="default" className="text-xs bg-green-100 text-green-700">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Extracted
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-amber-600">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Showing original
                        </Badge>
                      )}
                    </div>
                    <div className="bg-white border rounded p-3 max-h-32 overflow-y-auto">
                      <pre className="text-xs whitespace-pre-wrap break-words">
                        {previewResult.input_result?.slice(0, 500)}
                        {(previewResult.input_result?.length || 0) > 500 && '...'}
                      </pre>
                    </div>
                  </div>
                )}

                {/* Output Preview */}
                {outputJsonPath && (
                  <div className="space-y-1">
                    <div className="flex items-center gap-2 text-sm">
                      <span className="font-medium">Output Result:</span>
                      {previewResult.output_success ? (
                        <Badge variant="default" className="text-xs bg-green-100 text-green-700">
                          <CheckCircle className="w-3 h-3 mr-1" />
                          Extracted
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="text-xs text-amber-600">
                          <AlertCircle className="w-3 h-3 mr-1" />
                          Showing original
                        </Badge>
                      )}
                    </div>
                    <div className="bg-white border rounded p-3 max-h-32 overflow-y-auto">
                      <pre className="text-xs whitespace-pre-wrap break-words">
                        {previewResult.output_result?.slice(0, 500)}
                        {(previewResult.output_result?.length || 0) > 500 && '...'}
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
          <div className="border-t pt-4">
            <h4 className="text-sm font-medium mb-2 text-muted-foreground">Current Saved Settings</h4>
            <div className="flex flex-wrap gap-2">
              {workshop.input_jsonpath && (
                <Badge variant="secondary" className="font-mono text-xs">
                  Input: {workshop.input_jsonpath}
                </Badge>
              )}
              {workshop.output_jsonpath && (
                <Badge variant="secondary" className="font-mono text-xs">
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
