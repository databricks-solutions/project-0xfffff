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
  Link
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
 * Detect if a string should be rendered as markdown
 * Be conservative - only render as markdown if there's clear formatting that benefits from it
 */
const isMarkdownContent = (str: string): boolean => {
  if (!str || typeof str !== 'string') return false;
  
  // Don't render short strings as markdown (likely just field values)
  if (str.length < 100) return false;
  
  // Check for markdown patterns that actually benefit from rendering
  const beneficialPatterns = [
    /\*\*[^*]+\*\*/,         // Bold: **text**
    /^\s*[-*+]\s+.+$/m,      // Unordered lists with content: - item
    /^\s*\d+\.\s+.+$/m,      // Ordered lists with content: 1. item
    /\[.+\]\(https?:\/\/.+\)/,  // Links with URLs: [text](url)
    /```[\s\S]+```/,         // Code blocks with content
    /^\s*>\s+.+$/m,          // Blockquotes with content
    /\|.+\|.+\|/,            // Tables with multiple cells
  ];
  
  // Only render as markdown if it has actual formatting
  const hasFormatting = beneficialPatterns.some(pattern => pattern.test(str));
  
  // Also check for multiple paragraphs (line breaks) in longer text
  const hasMultipleParagraphs = str.length > 200 && /\n\n/.test(str);
  
  return hasFormatting || hasMultipleParagraphs;
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
 * Format a field name for display (convert camelCase/snake_case to readable text)
 */
const formatFieldName = (name: string): string => {
  // Common technical field name mappings to friendly names
  const friendlyNames: Record<string, string> = {
    'url_citations': 'Sources',
    'url': 'Link',
    'trajectory': 'Reasoning Steps',
    'thought': 'Thinking',
    'tool_name': 'Tool Used',
    'tool_args': 'Tool Input',
    'tool_response': 'Tool Output',
    'observation': 'Result',
    'annotations': 'References',
    'state': 'Status',
    'context': 'Context',
    'args': 'Arguments',
    'kwargs': 'Parameters',
    'content': 'Content',
    'message': 'Message',
    'messages': 'Messages',
    'role': 'Role',
    'type': 'Type',
  };
  
  const lowerName = name.toLowerCase();
  if (friendlyNames[lowerName]) {
    return friendlyNames[lowerName];
  }
  
  return name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
};

/**
 * Collapsible section for any content - clean, user-friendly design
 */
const CollapsibleSection: React.FC<{
  title: string;
  defaultExpanded?: boolean;
  children: React.ReactNode;
  itemCount?: number;
}> = ({ title, defaultExpanded = false, children, itemCount }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);

  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 transition-colors"
      >
        <div className="flex items-center gap-2">
          <span className="font-medium text-gray-700">{title}</span>
          {itemCount !== undefined && itemCount > 0 && (
            <span className="text-xs text-gray-500">
              ({itemCount})
            </span>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
      </button>
      {expanded && (
        <div className="border-t border-gray-100 bg-gray-50/50 p-4 max-h-[500px] overflow-auto">
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
          className="text-blue-600 hover:underline inline-flex items-center gap-1 break-all"
        >
          {value}
          <ExternalLink className="h-3 w-3 flex-shrink-0" />
        </a>
      );
    }

    // Check if it's embedded JSON string
    if (isJsonString(value)) {
      const { success, data } = tryParseJson(value);
      if (success) {
        return (
          <CollapsibleSection 
            title={fieldName ? formatFieldName(fieldName) : 'Details'} 
            defaultExpanded={defaultExpanded}
          >
            <SmartValueRenderer value={data} depth={depth + 1} />
          </CollapsibleSection>
        );
      }
    }

    // Only render as markdown if it has actual markdown formatting
    if (isMarkdownContent(value)) {
      return (
        <div className="prose prose-sm max-w-none text-gray-800 prose-headings:text-gray-900 prose-headings:font-semibold prose-p:text-gray-700 prose-li:text-gray-700 prose-a:text-blue-600">
          <ReactMarkdown remarkPlugins={[remarkGfm]}>
            {value}
          </ReactMarkdown>
        </div>
      );
    }

    // Plain text - render as-is with proper line breaks
    return <span className="text-gray-800 whitespace-pre-wrap">{value}</span>;
  }

  // Handle arrays
  if (Array.isArray(value)) {
    if (value.length === 0) {
      return <span className="text-gray-400 italic">Empty</span>;
    }

    // Check if it's an array of simple values (strings, numbers, booleans)
    const isSimpleArray = value.every(v => 
      typeof v === 'string' || typeof v === 'number' || typeof v === 'boolean'
    );

    // For short simple arrays, show inline
    if (isSimpleArray && value.length <= 5) {
      return (
        <div className="flex flex-wrap gap-2">
          {value.map((item, idx) => (
            <span key={idx} className="bg-gray-100 px-2 py-1 rounded text-sm text-gray-700">
              <SmartValueRenderer value={item} depth={depth + 1} />
            </span>
          ))}
        </div>
      );
    }

    // Check if it's an array of message objects - render directly without extra nesting
    const isMessageArray = value.every(v => 
      typeof v === 'object' && v !== null && ('content' in v || 'text' in v)
    );

    if (isMessageArray) {
      return (
        <div className="space-y-3">
          {value.map((item, idx) => (
            <div key={idx} className="bg-white rounded-lg p-3 border border-gray-100">
              <SmartValueRenderer value={item} depth={depth + 1} />
            </div>
          ))}
        </div>
      );
    }

    // For complex arrays with 1-2 items, show directly without collapsing
    if (value.length <= 2) {
      return (
        <div className="space-y-3">
          {value.map((item, idx) => (
            <div key={idx} className="bg-white rounded-lg p-3 border border-gray-100">
              <SmartValueRenderer value={item} depth={depth + 1} />
            </div>
          ))}
        </div>
      );
    }

    // For larger complex arrays, show as collapsible list
    return (
      <CollapsibleSection 
        title={fieldName ? formatFieldName(fieldName) : 'Items'} 
        itemCount={value.length}
        defaultExpanded={defaultExpanded || depth === 0}
      >
        <div className="space-y-3">
          {value.map((item, idx) => (
            <div key={idx} className="bg-white rounded-lg p-3 border border-gray-100">
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
      return <span className="text-gray-400 italic">Empty</span>;
    }

    // Check if this is a message object (has role/content pattern)
    const isMessageObject = 'content' in value && ('role' in value || 'type' in value);
    if (isMessageObject) {
      const content = value.content || value.text || '';
      const role = value.role || value.type || '';
      const otherFields = Object.entries(value).filter(([k]) => !['content', 'text', 'role', 'type'].includes(k));
      
      return (
        <div className="space-y-2">
          {/* Show role/type as a small label */}
          {role && (
            <div className="text-xs text-gray-500 uppercase tracking-wide">{role}</div>
          )}
          {/* Show main content */}
          <div className="text-gray-800">
            <SmartValueRenderer value={content} depth={depth + 1} />
          </div>
          {/* Show any other fields inline */}
          {otherFields.length > 0 && (
            <div className="flex flex-wrap gap-3 text-xs text-gray-500 pt-1">
              {otherFields.map(([key, val]) => (
                <span key={key}>
                  {formatFieldName(key)}: {typeof val === 'string' ? val : JSON.stringify(val)}
                </span>
              ))}
            </div>
          )}
        </div>
      );
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
          
          {/* Other fields as collapsible sections - only if there are any */}
          {otherEntries.length > 0 && (
            <div className="space-y-2 mt-4 pt-4 border-t border-gray-200">
              {otherEntries.map(([key, val]) => (
                <SmartObjectField key={key} fieldKey={key} value={val} depth={depth + 1} />
              ))}
            </div>
          )}
        </div>
      );
    }

    // Check if all values are simple (strings, numbers, booleans) - display as inline table
    const allSimple = entries.every(([, val]) => 
      typeof val === 'string' || typeof val === 'number' || typeof val === 'boolean' || val === null
    );
    
    if (allSimple && entries.length <= 6) {
      return (
        <div className="grid grid-cols-[auto_1fr] gap-x-4 gap-y-1">
          {entries.map(([key, val]) => (
            <React.Fragment key={key}>
              <span className="text-sm font-medium text-gray-500">{formatFieldName(key)}:</span>
              <span className="text-sm text-gray-800">
                <SmartValueRenderer value={val} depth={depth + 1} />
              </span>
            </React.Fragment>
          ))}
        </div>
      );
    }

    // For nested objects, show all fields
    return (
      <div className="space-y-1">
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
 * Render a single object field with smart formatting - clean, user-friendly design
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

  // Get count for display
  const itemCount = Array.isArray(value) 
    ? value.length 
    : typeof value === 'object' && value !== null
      ? Object.keys(value).length 
      : undefined;

  if (shouldCollapse) {
    return (
      <div className="border border-gray-200 rounded-lg overflow-hidden bg-white shadow-sm">
        <button
          onClick={() => setExpanded(!expanded)}
          className="w-full flex items-center justify-between p-3 text-left hover:bg-gray-50 transition-colors"
        >
          <div className="flex items-center gap-2">
            <span className="font-medium text-gray-700">{formatFieldName(fieldKey)}</span>
            {itemCount !== undefined && (
              <span className="text-xs text-gray-500">
                ({itemCount})
              </span>
            )}
          </div>
          <ChevronDown className={`h-4 w-4 text-gray-400 transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </button>
        {expanded && (
          <div className="border-t border-gray-100 bg-gray-50/50 p-4 max-h-[500px] overflow-auto">
            <SmartValueRenderer value={value} fieldName={fieldKey} depth={depth} />
          </div>
        )}
      </div>
    );
  }

  // Simple value - show inline on same line
  return (
    <div className="flex items-baseline gap-2 py-0.5">
      <span className="text-sm font-medium text-gray-500 whitespace-nowrap">
        {formatFieldName(fieldKey)}:
      </span>
      <span className="text-sm text-gray-800">
        <SmartValueRenderer value={value} depth={depth} />
      </span>
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