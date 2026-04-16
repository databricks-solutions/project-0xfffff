/**
 * JsonPathSettings Component
 *
 * Allows facilitators to configure JSONPath queries for extracting specific
 * values from trace inputs and outputs for cleaner display in the TraceViewer.
 * Also supports span attribute filters to select a specific span's inputs/outputs.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Code, Eye, Save, X, CheckCircle, AlertCircle, Filter } from 'lucide-react';
import { toast } from 'sonner';
import { useWorkshopContext } from '@/context/WorkshopContext';
import {
  useWorkshopDisplayConfig,
  useUpdateJsonPathSettings,
  usePreviewJsonPath,
  useUpdateSpanAttributeFilter,
  usePreviewSpanFilter,
} from '@/hooks/useWorkshopApi';

export const JsonPathSettings: React.FC = () => {
  const { workshopId } = useWorkshopContext();
  const { data: workshop } = useWorkshopDisplayConfig(workshopId!);
  const updateSettings = useUpdateJsonPathSettings(workshopId!);
  const previewJsonPath = usePreviewJsonPath(workshopId!);
  const updateSpanFilter = useUpdateSpanAttributeFilter(workshopId!);
  const previewSpanFilter = usePreviewSpanFilter(workshopId!);

  // Local state for JSONPath form
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

  // Local state for span filter form
  const [spanName, setSpanName] = useState<string>('');
  const [spanType, setSpanType] = useState<string>('');
  const [attrKey, setAttrKey] = useState<string>('');
  const [attrValue, setAttrValue] = useState<string>('');
  const [showSpanPreview, setShowSpanPreview] = useState(false);
  const [spanPreviewResult, setSpanPreviewResult] = useState<{
    trace_id?: string;
    matched?: boolean;
    input_result?: string | null;
    output_result?: string | null;
    error?: string;
  } | null>(null);

  // Sync form state with workshop data
  useEffect(() => {
    if (workshop) {
      setInputJsonPath(workshop.input_jsonpath || '');
      setOutputJsonPath(workshop.output_jsonpath || '');
      const filter = workshop.span_attribute_filter;
      if (filter) {
        setSpanName(filter.span_name || '');
        setSpanType(filter.span_type || '');
        setAttrKey(filter.attribute_key || '');
        setAttrValue(filter.attribute_value || '');
      }
    }
  }, [workshop]);

  // Build span filter config from form state
  const buildSpanFilter = (): Record<string, string> | null => {
    const filter: Record<string, string> = {};
    if (spanName.trim()) filter.span_name = spanName.trim();
    if (spanType.trim()) filter.span_type = spanType.trim();
    if (attrKey.trim()) {
      filter.attribute_key = attrKey.trim();
      if (attrValue.trim()) filter.attribute_value = attrValue.trim();
    }
    return Object.keys(filter).length > 0 ? filter : null;
  };

  const hasSpanFilterInput = spanName || spanType || attrKey;

  const savedFilter = workshop?.span_attribute_filter;
  const hasSpanFilterChanges = (() => {
    const current = buildSpanFilter();
    if (!current && !savedFilter) return false;
    if (!current || !savedFilter) return true;
    return JSON.stringify(current) !== JSON.stringify(savedFilter);
  })();

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

  const handleSpanPreview = async () => {
    try {
      const result = await previewSpanFilter.mutateAsync({
        span_attribute_filter: buildSpanFilter(),
      });
      setSpanPreviewResult(result);
      setShowSpanPreview(true);
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to preview span filter';
      toast.error(message);
    }
  };

  const handleSpanSave = async () => {
    try {
      await updateSpanFilter.mutateAsync({
        span_attribute_filter: buildSpanFilter(),
      });
      toast.success('Span filter saved successfully');
    } catch (error: unknown) {
      const message = error instanceof Error ? error.message : 'Failed to save span filter';
      toast.error(message);
    }
  };

  const handleSpanClear = () => {
    setSpanName('');
    setSpanType('');
    setAttrKey('');
    setAttrValue('');
    setShowSpanPreview(false);
    setSpanPreviewResult(null);
  };

  const hasJsonPathChanges = (
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
            Configure how trace inputs and outputs are displayed. Use span filters to show a specific span's data, or JSONPath to extract specific fields.
          </p>
        </div>

        {/* Span Attribute Filter Section */}
        <div className="border rounded-md p-3 space-y-3">
          <div className="flex items-center gap-2 mb-1">
            <Filter className="w-3.5 h-3.5 text-blue-600" />
            <h4 className="text-sm font-medium text-gray-800">Span Attribute Filter</h4>
            <Badge variant="outline" className="text-[10px] font-normal border-gray-300 text-gray-500">optional</Badge>
          </div>
          <p className="text-xs text-gray-400">
            Select a specific span by name, type, or attribute to display its inputs/outputs instead of the root trace.
          </p>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label htmlFor="span-name" className="text-xs font-medium text-gray-600">Span Name</Label>
              <Input
                id="span-name"
                placeholder="e.g. AzureChatOpenAI"
                value={spanName}
                onChange={(e) => setSpanName(e.target.value)}
                className="font-mono text-xs h-8"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="span-type" className="text-xs font-medium text-gray-600">Span Type</Label>
              <Input
                id="span-type"
                placeholder="e.g. CHAT_MODEL"
                value={spanType}
                onChange={(e) => setSpanType(e.target.value)}
                className="font-mono text-xs h-8"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="attr-key" className="text-xs font-medium text-gray-600">Attribute Key</Label>
              <Input
                id="attr-key"
                placeholder="e.g. model"
                value={attrKey}
                onChange={(e) => setAttrKey(e.target.value)}
                className="font-mono text-xs h-8"
              />
            </div>
            <div className="space-y-1">
              <Label htmlFor="attr-value" className="text-xs font-medium text-gray-600">Attribute Value</Label>
              <Input
                id="attr-value"
                placeholder="e.g. gpt-4"
                value={attrValue}
                onChange={(e) => setAttrValue(e.target.value)}
                className="font-mono text-xs h-8"
                disabled={!attrKey}
              />
            </div>
          </div>

          <div className="flex gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={handleSpanPreview}
              disabled={previewSpanFilter.isPending || !hasSpanFilterInput}
            >
              {previewSpanFilter.isPending ? (
                <div className="w-3.5 h-3.5 border border-gray-300 border-t-gray-600 rounded-full animate-spin mr-2" />
              ) : (
                <Eye className="w-3.5 h-3.5 mr-2" />
              )}
              Preview
            </Button>
            <Button
              size="sm"
              onClick={handleSpanSave}
              disabled={updateSpanFilter.isPending || !hasSpanFilterChanges}
            >
              {updateSpanFilter.isPending ? (
                <div className="w-3.5 h-3.5 border border-white/30 border-t-white rounded-full animate-spin mr-2" />
              ) : (
                <Save className="w-3.5 h-3.5 mr-2" />
              )}
              Save
            </Button>
            {hasSpanFilterInput && (
              <Button variant="ghost" size="sm" onClick={handleSpanClear}>
                <X className="w-3.5 h-3.5 mr-2" />
                Clear
              </Button>
            )}
          </div>

          {/* Span Filter Preview */}
          {showSpanPreview && spanPreviewResult && (
            <div className="border rounded-md p-3 bg-gray-50 space-y-2">
              <div className="flex items-center justify-between">
                <h4 className="text-xs font-semibold text-gray-700">
                  Span Filter Preview
                  {spanPreviewResult.trace_id && (
                    <span className="text-gray-400 ml-2 font-normal">
                      (Trace: {spanPreviewResult.trace_id.slice(0, 8)}...)
                    </span>
                  )}
                </h4>
                <Button variant="ghost" size="sm" onClick={() => setShowSpanPreview(false)} className="h-5 w-5 p-0">
                  <X className="h-3 w-3" />
                </Button>
              </div>

              {spanPreviewResult.error ? (
                <div className="flex items-center gap-2 text-amber-600">
                  <AlertCircle className="w-3.5 h-3.5" />
                  <span className="text-xs">{spanPreviewResult.error}</span>
                </div>
              ) : spanPreviewResult.matched ? (
                <>
                  <Badge className="text-[10px] bg-green-50 text-green-700 border border-green-200">
                    <CheckCircle className="w-2.5 h-2.5 mr-1" />
                    Span matched
                  </Badge>
                  {spanPreviewResult.input_result && (
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-gray-700">Span Input:</span>
                      <div className="bg-white border border-gray-200 rounded p-2 max-h-24 overflow-y-auto">
                        <pre className="text-[11px] whitespace-pre-wrap break-words text-gray-600">
                          {spanPreviewResult.input_result.slice(0, 400)}
                          {spanPreviewResult.input_result.length > 400 && '...'}
                        </pre>
                      </div>
                    </div>
                  )}
                  {spanPreviewResult.output_result && (
                    <div className="space-y-1">
                      <span className="text-xs font-medium text-gray-700">Span Output:</span>
                      <div className="bg-white border border-gray-200 rounded p-2 max-h-24 overflow-y-auto">
                        <pre className="text-[11px] whitespace-pre-wrap break-words text-gray-600">
                          {spanPreviewResult.output_result.slice(0, 400)}
                          {spanPreviewResult.output_result.length > 400 && '...'}
                        </pre>
                      </div>
                    </div>
                  )}
                </>
              ) : (
                <Badge variant="outline" className="text-[10px] text-amber-600 border-amber-300">
                  <AlertCircle className="w-2.5 h-2.5 mr-1" />
                  No matching span found
                </Badge>
              )}
            </div>
          )}

          {/* Current Span Filter Display */}
          {savedFilter && (
            <div className="border-t border-gray-100 pt-2">
              <h4 className="text-xs font-medium mb-1.5 text-gray-500">Active Span Filter</h4>
              <div className="flex flex-wrap gap-1.5">
                {savedFilter.span_name && (
                  <Badge variant="secondary" className="font-mono text-[10px] bg-blue-50 text-blue-700">
                    name: {savedFilter.span_name}
                  </Badge>
                )}
                {savedFilter.span_type && (
                  <Badge variant="secondary" className="font-mono text-[10px] bg-blue-50 text-blue-700">
                    type: {savedFilter.span_type}
                  </Badge>
                )}
                {savedFilter.attribute_key && (
                  <Badge variant="secondary" className="font-mono text-[10px] bg-blue-50 text-blue-700">
                    {savedFilter.attribute_key}={savedFilter.attribute_value || '*'}
                  </Badge>
                )}
              </div>
            </div>
          )}
        </div>

        {/* JSONPath Section */}
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

        {/* JSONPath Action Buttons */}
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
            disabled={updateSettings.isPending || !hasJsonPathChanges}
          >
            {updateSettings.isPending ? (
              <div className="w-3.5 h-3.5 border border-white/30 border-t-white rounded-full animate-spin mr-2" />
            ) : (
              <Save className="w-3.5 h-3.5 mr-2" />
            )}
            Save Settings
          </Button>
          {hasJsonPathChanges && (
            <Button variant="ghost" size="sm" onClick={handleClear}>
              <X className="w-3.5 h-3.5 mr-2" />
              Clear
            </Button>
          )}
        </div>

        {/* JSONPath Preview Results */}
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

        {/* Current JSONPath Settings Display */}
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
