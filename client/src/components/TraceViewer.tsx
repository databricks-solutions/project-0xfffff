/**
 * TraceViewer Component
 *
 * Simple, clean view of LLM conversations for the discovery phase.
 * Shows one trace at a time with minimal formatting to help assess quality.
 *
 * Supports optional JSONPath extraction for cleaner display when configured
 * by facilitators via workshop settings.
 * 
 * Smart JSON rendering: automatically detects and formats any JSON schema:
 * - Markdown strings are rendered as formatted markdown
 * - Nested objects/arrays are shown as collapsible pretty JSON
 * - URLs are rendered as clickable links
 */

import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  MessageCircle,
  User,
  Bot,
  FileText,
  History,
  ChevronDown,
  ChevronUp,
  ExternalLink,
  Database,
  RefreshCw,
  Link,
  Code,
  Hash
} from "lucide-react";
import { toast } from 'sonner';
import { useInvalidateTraces, useWorkshop } from '@/hooks/useWorkshopApi';
import { useMLflowConfig } from '@/hooks/useWorkshopApi';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useJsonPathExtraction } from '@/hooks/useJsonPathExtraction';

// ============================================================================
// SMART JSON RENDERER - Handles arbitrary JSON schemas
// ============================================================================

/**
 * Detect if a string looks like markdown content
 */
const isMarkdownContent = (str: string): boolean => {
  if (!str || typeof str !== 'string') return false;
  
  // Check for common markdown patterns
  const markdownPatterns = [
    /^#{1,6}\s+/m,           // Headers: # Header
    /\*\*[^*]+\*\*/,         // Bold: **text**
    /\*[^*]+\*/,             // Italic: *text*
    /^\s*[-*+]\s+/m,         // Unordered lists: - item
    /^\s*\d+\.\s+/m,         // Ordered lists: 1. item
    /\[.+\]\(.+\)/,          // Links: [text](url)
    /```[\s\S]*```/,         // Code blocks: ```code```
    /`[^`]+`/,               // Inline code: `code`
    /^\s*>\s+/m,             // Blockquotes: > quote
    /\|.+\|/,                // Tables: | cell |
    /\n\n/,                  // Multiple paragraphs
  ];
  
  // If the string has multiple markdown patterns, it's likely markdown
  const matchCount = markdownPatterns.filter(pattern => pattern.test(str)).length;
  return matchCount >= 2 || str.length > 200; // Long text or multiple patterns
};

/**
 * Check if a string is a URL
 */
const isUrl = (str: string): boolean => {
  if (!str || typeof str !== 'string') return false;
  try {
    const url = new URL(str);
    return url.protocol === 'http:' || url.protocol === 'https:';
  } catch {
    return false;
  }
};

/**
 * Check if a string looks like JSON
 */
const isJsonString = (str: string): boolean => {
  if (!str || typeof str !== 'string') return false;
  const trimmed = str.trim();
  return (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
         (trimmed.startsWith('[') && trimmed.endsWith(']'));
};

/**
 * Try to parse a string as JSON
 */
const tryParseJson = (str: string): { success: boolean; data: any } => {
  try {
    const data = JSON.parse(str);
    return { success: true, data };
  } catch {
    return { success: false, data: null };
  }
};

/**
 * Format a field name for display (convert camelCase/snake_case to Title Case)
 */
const formatFieldName = (name: string): string => {
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
};

/**
 * Collapsible section for any content
 */
const CollapsibleSection: React.FC<{
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  badge?: string;
}> = ({ title, defaultExpanded = false, children, badge }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="border rounded-lg overflow-hidden bg-white">
      <Button
        variant="ghost"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 h-auto text-gray-700 hover:bg-gray-50"
      >
        <div className="flex items-center gap-2">
          <Code className="h-4 w-4 text-gray-500" />
          <span className="font-medium text-sm">{title}</span>
          {badge && (
            <span className="text-xs bg-gray-100 text-gray-600 px-1.5 py-0.5 rounded">
              {badge}
            </span>
          )}
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>
      {expanded && (
        <div className="border-t bg-gray-50 p-3 max-h-96 overflow-auto">
          {children}
        </div>
      )}
    </div>
  );
};

/**
 * Smart renderer for any value - recursively handles objects, arrays, strings
 */
const SmartValueRenderer: React.FC<{
  value: any;
  fieldName?: string;
  depth?: number;
  defaultExpanded?: boolean;
}> = ({ value, fieldName, depth = 0, defaultExpanded = false }) => {
  // Handle null/undefined
  if (value === null || value === undefined) {
    return <span className="text-gray-400 italic">null</span>;
  }

  // Handle booleans
  if (typeof value === 'boolean') {
    return (
      <span className={value ? 'text-green-600' : 'text-red-600'}>
        {value.toString()}
      </span>
    );
  }

  // Handle numbers
  if (typeof value === 'number') {
    return <span className="text-blue-600">{value}</span>;
  }

  // Handle strings
  if (typeof value === 'string') {
    // Check if it's a URL
    if (isUrl(value)) {
      return (
        <a
          href={value}
          target="_blank"
          rel="noopener noreferrer"
          className="text-blue-600 hover:underline flex items-center gap-1 break-all"
        >
          <ExternalLink className="h-3 w-3 flex-shrink-0" />
          {value}
        </a>
      );
    }

    // Check if it's embedded JSON
    if (isJsonString(value)) {
      const { success, data } = tryParseJson(value);
      if (success) {
        return (
          <CollapsibleSection 
            title={fieldName ? formatFieldName(fieldName) : 'JSON Data'} 
            badge="JSON"
            defaultExpanded={defaultExpanded}
          >
            <SmartValueRenderer value={data} depth={depth + 1} />
          </CollapsibleSection>
        );
      }
    }

    // Check if it's markdown
    if (isMarkdownContent(value)) {
      return (
        <div className="prose prose-sm max-w-none text-gray-800">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {value}
          </ReactMarkdown>
        </div>
      );
    }

    // Plain string
    return <span className="text-gray-800 whitespace-pre-wrap">{value}</span>;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-gray-400 italic">[]</span>;
    }

    // Check if it's an array of simple values
    const isSimpleArray = value.every(v => 
      typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
    );

    if (isSimpleArray && value.length <= 5) {
      return (
        <div className="flex flex-wrap gap-1">
          {value.map((item, idx) => (
            <span key={idx} className="bg-gray-100 px-2 py-0.5 rounded text-sm">
              <SmartValueRenderer value={item} depth={depth + 1} />
            </span>
          ))}
        </div>
      );
    }

    // Complex array - show as collapsible
    return (
      <CollapsibleSection 
        title={fieldName ? formatFieldName(fieldName) : 'Array'} 
        badge={`${value.length} items`}
        defaultExpanded={defaultExpanded || depth === 0}
      >
        <div className="space-y-2">
          {value.map((item, idx) => (
            <div key={idx} className="border-l-2 border-gray-200 pl-3">
              <div className="text-xs text-gray-500 mb-1">Item {idx + 1}</div>
              <SmartValueRenderer value={item} depth={depth + 1} />
            </div>
          ))}
        </div>
      </CollapsibleSection>
    );
  }

  // Handle objects
  if (typeof value === 'object') {
    const entries = Object.entries(value);
    
    if (entries.length === 0) {
      return <span className="text-gray-400 italic">{'{}'}</span>;
    }

    // Identify "main content" fields that should be rendered prominently
    const mainContentKeys = ['answer', 'response', 'result', 'output', 'content', 'text', 'message'];
    const mainEntry = entries.find(([key]) => mainContentKeys.includes(key.toLowerCase()));
    const otherEntries = entries.filter(([key]) => !mainContentKeys.includes(key.toLowerCase()));

    // If we're at the top level and there's a main content field, show it prominently
    if (depth === 0 && mainEntry) {
      return (
        <div className="space-y-4">
          {/* Main content rendered prominently */}
          <div>
            <SmartValueRenderer value={mainEntry[1]} fieldName={mainEntry[0]} depth={depth + 1} defaultExpanded />
          </div>
          
          {/* Other fields as collapsible sections */}
          {otherEntries.length > 0 && (
            <div className="space-y-2 mt-4 pt-4 border-t">
              <div className="text-xs font-medium text-gray-500 uppercase tracking-wider mb-2">
                Additional Data
              </div>
              {otherEntries.map(([key, val]) => (
                <SmartObjectField key={key} fieldKey={key} value={val} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      );
    }

    // For nested objects, show all fields
    return (
      <div className="space-y-2">
        {entries.map(([key, val]) => (
          <SmartObjectField key={key} fieldKey={key} value={val} depth={depth + 1} />
        ))}
      </div>
    );
  }

  // Fallback - stringify
  return <span className="text-gray-600">{String(value)}</span>;
};

/**
 * Render a single object field with smart formatting
 */
const SmartObjectField: React.FC<{
  fieldKey: string;
  value: any;
  depth: number;
}> = ({ fieldKey, value, depth }) => {
  const [expanded, setExpanded] = useState(false);
  
  // Determine if this field should be collapsible
  const isComplexValue = typeof value === 'object' && value !== null;
  const isLongString = typeof value === 'string' && value.length > 200;
  const shouldCollapse = isComplexValue || isLongString;

  // Check if string value is markdown or JSON
  const isMarkdown = typeof value === 'string' && isMarkdownContent(value);
  const valueIsJson = typeof value === 'string' && isJsonString(value);

  if (shouldCollapse) {
    const badge = Array.isArray(value) 
      ? `${value.length} items` 
      : isMarkdown 
        ? 'Markdown' 
        : valueIsJson 
          ? 'JSON' 
          : typeof value === 'object' 
            ? `${Object.keys(value).length} fields` 
            : undefined;

    return (
      <div className="border rounded-lg overflow-hidden bg-white">
        <Button
          variant="ghost"
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between p-2 h-auto text-gray-700 hover:bg-gray-50"
        >
          <div className="flex items-center gap-2">
            <Hash className="h-3 w-3 text-gray-400" />
            <span className="font-medium text-sm">{formatFieldName(fieldKey)}</span>
            {badge && (
              <span className="text-xs bg-gray-100 text-gray-500 px-1.5 py-0.5 rounded">
                {badge}
              </span>
            )}
          </div>
          {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
        </Button>
        {expanded && (
          <div className="border-t bg-gray-50 p-3 max-h-96 overflow-auto">
            <SmartValueRenderer value={value} fieldName={fieldKey} depth={depth} />
          </div>
        )}
      </div>
    );
  }

  // Simple value - show inline
  return (
    <div className="flex items-start gap-2 py-1">
      <span className="text-sm font-medium text-gray-600 min-w-0 flex-shrink-0">
        {formatFieldName(fieldKey)}:
      </span>
      <div className="flex-1 min-w-0">
        <SmartValueRenderer value={value} depth={depth} />
      </div>
    </div>
  );
};

/**
 * Main smart JSON renderer - entry point for rendering any JSON data
 */
const SmartJsonRenderer: React.FC<{
  data: string;
  fallbackRenderer?: (data: string) => React.ReactNode;
}> = ({ data, fallbackRenderer }) => {
  // Try to parse as JSON
  const { success, data: parsed } = tryParseJson(data);
  
  if (success) {
    return <SmartValueRenderer value={parsed} depth={0} defaultExpanded />;
  }
  
  // Not JSON - check if it's markdown
  if (isMarkdownContent(data)) {
    return (
      <div className="prose prose-sm max-w-none text-gray-800">
        <ReactMarkdown remarkPlugins={[remarkGfm]}>
          {data}
        </ReactMarkdown>
      </div>
    );
  }
  
  // Use fallback or show as plain text
  if (fallbackRenderer) {
    return <>{fallbackRenderer(data)}</>;
  }
  
  return <span className="text-gray-800 whitespace-pre-wrap">{data}</span>;
};

// ============================================================================
// LEGACY COMPONENTS (kept for backward compatibility)
// ============================================================================

// Citations display component
const CitationsDisplay: React.FC<{
  citations: Array<{ url: string; title: string; type?: string }>;
}> = ({ citations }) => {
  const [expanded, setExpanded] = useState(true);
  
  if (!citations || citations.length === 0) return null;

  return (
    <div className="border rounded-lg overflow-hidden border-blue-200 bg-blue-50/50">
      <Button
        variant="ghost"
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 h-auto text-blue-700 hover:bg-blue-100"
      >
        <div className="flex items-center gap-2">
          <Link className="h-4 w-4" />
          <span className="font-medium text-sm">Citations ({citations.length})</span>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>
      {expanded && (
        <div className="border-t border-blue-200 p-3 space-y-2">
          {citations.map((citation, idx) => (
            <a
              key={idx}
              href={citation.url}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-start gap-2 p-2 rounded hover:bg-blue-100 transition-colors group"
            >
              <ExternalLink className="h-4 w-4 text-blue-500 mt-0.5 flex-shrink-0" />
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-blue-700 group-hover:underline truncate">
                  {citation.title || citation.url}
                </div>
                {citation.type && (
                  <span className="text-xs text-blue-500 bg-blue-100 px-1.5 py-0.5 rounded">
                    {citation.type}
                  </span>
                )}
              </div>
            </a>
          ))}
        </div>
      )}
    </div>
  );
};

// ============================================================================
// TRACE VIEWER COMPONENT
// ============================================================================

export interface TraceData {
  id: string;
  input: string;
  output: string;
  context?: {
    retrieved_content?: string;
    conversation_history?: Array<{
      role: 'user' | 'assistant';
      content: string;
    }>;
    [key: string]: any;
  };
  mlflow_trace_id?: string;
  mlflow_url?: string;
  mlflow_experiment_id?: string;
  mlflow_host?: string;
}

interface TraceViewerProps {
  trace: TraceData;
  /** Optional JSONPath for extracting input display (from workshop settings) */
  inputJsonPath?: string | null;
  /** Optional JSONPath for extracting output display (from workshop settings) */
  outputJsonPath?: string | null;
}

export const TraceViewer: React.FC<TraceViewerProps> = ({
  trace,
  inputJsonPath,
  outputJsonPath,
}) => {
  const [showRetrievedContent, setShowRetrievedContent] = useState(false);
  const [showConversationHistory, setShowConversationHistory] = useState(false);
  const invalidateTraces = useInvalidateTraces();
  const { workshopId } = useWorkshopContext();
  const { data: mlflowConfig } = useMLflowConfig(workshopId!);
  const { data: workshop } = useWorkshop(workshopId!);

  // Get JSONPath settings from props or workshop settings
  const effectiveInputJsonPath = inputJsonPath ?? workshop?.input_jsonpath;
  const effectiveOutputJsonPath = outputJsonPath ?? workshop?.output_jsonpath;

  // Apply JSONPath extraction to input and output
  const displayInput = useJsonPathExtraction(trace.input, effectiveInputJsonPath);
  const displayOutput = useJsonPathExtraction(trace.output, effectiveOutputJsonPath);

  // Check if input/output are JSON for badge display
  const isInputJson = useMemo(() => {
    try {
      JSON.parse(displayInput);
      return true;
    } catch {
      return false;
    }
  }, [displayInput]);

  const isOutputJson = useMemo(() => {
    try {
      JSON.parse(displayOutput);
      return true;
    } catch {
      return false;
    }
  }, [displayOutput]);

  const handleRefresh = () => {
    invalidateTraces();
    toast.success('Refreshing trace data...');
  };

  const handleMLflowLink = () => {
    // Prefer server-provided URL when available
    if (trace.mlflow_url) {
      window.open(trace.mlflow_url, '_blank');
      return;
    }

    // Build from trace fields or workshop MLflow config as fallback
    const hostCandidate = trace.mlflow_host || mlflowConfig?.databricks_host;
    const experimentId = trace.mlflow_experiment_id || mlflowConfig?.experiment_id;
    const traceId = trace.mlflow_trace_id;

    const normalizeHost = (host?: string) => {
      if (!host) return undefined;
      const h = host.replace(/^https?:\/\//, '');
      return `https://${h}`;
    };

    if (traceId && hostCandidate && experimentId) {
      const host = normalizeHost(hostCandidate);
      const mlflowUrl = `${host}/ml/experiments/${experimentId}/traces?selectedEvaluationId=${traceId}`;
      
      window.open(mlflowUrl, '_blank');
      return;
    }

    if (traceId) {
      
      
      toast.warning('MLflow URL not available. Configure MLflow in Intake or re-ingest traces.');
      return;
    }

    
    toast.warning('MLflow trace information not available for this trace.');
  };

  return (
    <Card className="w-full max-w-4xl mx-auto">
      <CardHeader>
        <CardTitle className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-lg">
            <MessageCircle className="h-5 w-5" />
            Trace {trace.mlflow_trace_id || trace.id}
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="ghost"
              size="sm"
              onClick={handleRefresh}
              className="flex items-center gap-2"
              title="Refresh trace data"
            >
              <RefreshCw className="h-4 w-4" />
            </Button>
            {trace.mlflow_trace_id && (
              <Button
                variant="outline"
                size="sm"
                onClick={handleMLflowLink}
                className="flex items-center gap-2"
              >
                <Database className="h-4 w-4" />
                View in MLflow
                <ExternalLink className="h-3 w-3" />
              </Button>
            )}
          </div>
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-6">
        {/* Context sections */}
        {trace.context?.conversation_history && (
          <div className="space-y-3">
            <Button
              variant="ghost"
              onClick={() => setShowConversationHistory(!showConversationHistory)}
              className="flex items-center gap-2 p-0 h-auto text-purple-600 hover:text-purple-800"
            >
              <History className="h-4 w-4" />
              <span className="font-medium">Conversation History</span>
              {showConversationHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            {showConversationHistory && (
              <div className="bg-purple-50 border-l-4 border-purple-400 p-4 rounded-r-lg">
                <div className="space-y-3">
                  {trace.context.conversation_history.map((turn, index) => (
                    <div key={index} className="flex items-start gap-2">
                      {turn.role === 'user' ? (
                        <User className="h-4 w-4 text-blue-600 mt-0.5" />
                      ) : (
                        <Bot className="h-4 w-4 text-green-600 mt-0.5" />
                      )}
                      <div className="flex-1">
                        <span className="text-xs font-medium text-gray-600 uppercase">
                          {turn.role}
                        </span>
                        <div className="text-sm text-gray-800 mt-1 prose prose-sm max-w-none">
                          <ReactMarkdown remarkPlugins={[remarkGfm]}>
                            {turn.content}
                          </ReactMarkdown>
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        )}

        {trace.context?.retrieved_content && (
          <div className="space-y-3">
            <Button
              variant="ghost"
              onClick={() => setShowRetrievedContent(!showRetrievedContent)}
              className="flex items-center gap-2 p-0 h-auto text-orange-600 hover:text-orange-800"
            >
              <FileText className="h-4 w-4" />
              <span className="font-medium">Retrieved Content</span>
              {showRetrievedContent ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
            </Button>
            {showRetrievedContent && (
              <div className="bg-orange-50 border-l-4 border-orange-400 p-4 rounded-r-lg">
                <div className="text-gray-800 leading-relaxed text-sm prose prose-sm max-w-none">
                  <ReactMarkdown remarkPlugins={[remarkGfm]}>
                    {trace.context.retrieved_content}
                  </ReactMarkdown>
                </div>
              </div>
            )}
          </div>
        )}

        {/* Input */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <User className="h-4 w-4 text-blue-600" />
            <span className="font-medium text-blue-800">Input</span>
            {isInputJson && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                Structured
              </span>
            )}
          </div>
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
            <SmartJsonRenderer data={displayInput} />
          </div>
        </div>

        {/* Output */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-green-600" />
            <span className="font-medium text-green-800">Output</span>
            {isOutputJson && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                Structured
              </span>
            )}
          </div>
          <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded-r-lg">
            <SmartJsonRenderer data={displayOutput} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
};