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
 * Fix malformed JSON where nested objects are incorrectly quoted as strings
 * e.g., "content": "{ "key": "value" }" should become "content": { "key": "value" }
 */
const fixQuotedJsonObjects = (str: string): string => {
  // Pattern to find string values that contain JSON objects/arrays
  // Matches: ": "{ or ": "[  followed by content and ending with }",  or ]",
  return str.replace(
    /:\s*"\s*(\{[\s\S]*?\}|\[[\s\S]*?\])\s*"(\s*[,}\]])/g,
    (match, jsonContent, trailing) => {
      // Check if the content looks like valid JSON structure
      const trimmedContent = jsonContent.trim();
      if ((trimmedContent.startsWith('{') && trimmedContent.endsWith('}')) ||
          (trimmedContent.startsWith('[') && trimmedContent.endsWith(']'))) {
        // Unescape any escaped quotes inside
        const unescaped = trimmedContent.replace(/\\"/g, '"');
        return `: ${unescaped}${trailing}`;
      }
      return match;
    }
  );
};

/**
 * Fix JSON strings that have unescaped newlines inside string values.
 * JSON spec requires newlines in strings to be escaped as \n
 */
const fixUnescapedNewlines = (str: string): string => {
  // This regex finds string values and escapes any literal newlines inside them
  // It's a simplified approach that works for common cases
  let result = '';
  let inString = false;
  let escapeNext = false;
  
  for (let i = 0; i < str.length; i++) {
    const char = str[i];
    
    if (escapeNext) {
      result += char;
      escapeNext = false;
      continue;
    }
    
    if (char === '\\') {
      result += char;
      escapeNext = true;
      continue;
    }
    
    if (char === '"') {
      inString = !inString;
      result += char;
      continue;
    }
    
    // If we're inside a string and hit a newline, escape it
    if (inString && (char === '\n' || char === '\r')) {
      if (char === '\r' && str[i + 1] === '\n') {
        // Handle \r\n as a single newline
        result += '\\n';
        i++; // Skip the \n
      } else {
        result += '\\n';
      }
      continue;
    }
    
    result += char;
  }
  
  return result;
};

/**
 * Extract judge result (result + rationale) from malformed JSON string
 * This handles the case where judge output was stored with improper escaping
 */
const extractJudgeResultFromMalformed = (str: string): { result?: number; rationale?: string } | null => {
  // Look for the pattern: "content": "{"result":X.X,"rationale":"..."}"
  // where the inner quotes are not properly escaped

  // First, check if this looks like a malformed judge output
  if (!str.includes('"content": "{"result"') && !str.includes('"content":"{"result"')) {
    return null;
  }

  // Extract result value
  const resultMatch = str.match(/"result"\s*:\s*([\d.]+)/);
  const result = resultMatch ? parseFloat(resultMatch[1]) : undefined;

  // Extract rationale - find the start after "rationale":"
  const rationaleStart = str.indexOf('"rationale":"');
  if (rationaleStart === -1) {
    return result !== undefined ? { result } : null;
  }

  const valueStart = rationaleStart + '"rationale":"'.length;

  // Find the end of the rationale - look for the closing pattern
  // The rationale ends with "}" followed by ", "role" or similar
  // But we need to handle escaped quotes inside the rationale

  // Find potential end markers
  let valueEnd = -1;
  const endPatterns = ['}", "role"', '}","role"', '}"}, "role"', '}"},"role"'];
  for (const pattern of endPatterns) {
    const idx = str.indexOf(pattern, valueStart);
    if (idx !== -1 && (valueEnd === -1 || idx < valueEnd)) {
      valueEnd = idx;
    }
  }

  if (valueEnd === -1) {
    // Try to find just the closing "}
    const closeIdx = str.lastIndexOf('"}');
    if (closeIdx > valueStart) {
      valueEnd = closeIdx;
    }
  }

  if (valueEnd === -1) {
    return result !== undefined ? { result } : null;
  }

  // Extract the rationale value
  let rationale = str.substring(valueStart, valueEnd);

  // Clean up escape sequences - handle various malformed patterns
  rationale = rationale
    .replace(/\\\n/g, '\n')    // backslash followed by actual newline -> just newline
    .replace(/\\\\"/g, '"')    // \\" -> "
    .replace(/\\"/g, '"')      // \" -> " (single escaped quote)
    .replace(/\\\\n/g, '\n')   // \\n -> newline
    .replace(/\\n/g, '\n')     // \n -> newline
    .replace(/\\\\r/g, '\r')   // \\r -> carriage return
    .replace(/\\r/g, '\r')     // \r -> carriage return
    .replace(/\\\\t/g, '\t')   // \\t -> tab
    .replace(/\\t/g, '\t')     // \t -> tab
    .replace(/\\\\/g, '\\');   // \\\\ -> \

  return { result, rationale };
};

/**
 * Try to parse a string as JSON
 * Also handles some common non-JSON formats like Python dict notation
 */
const tryParseJson = (str: string): { success: boolean; data: any } => {
  if (!str || typeof str !== 'string') {
    return { success: false, data: null };
  }

  // Clean the string - remove BOM and trim
  let cleanStr = str.replace(/^\uFEFF/, '').trim();

  // First, try direct JSON parse
  try {
    let data = JSON.parse(cleanStr);
    // Handle double-stringified JSON (string containing JSON string)
    if (typeof data === 'string') {
      try {
        data = JSON.parse(data);
      } catch {
        // It was a regular string, not double-encoded
      }
    }
    return { success: true, data };
  } catch {
    // Try fixing malformed content JSON (common issue with judge outputs)
    try {
      const fixed = fixMalformedContentJson(cleanStr);
      if (fixed !== cleanStr) {
        const data = JSON.parse(fixed);
        return { success: true, data };
      }
    } catch {
      // Still failed after fix attempt
    }
    // Continue to try other alternatives
  }

  // Try fixing unescaped newlines in string values
  try {
    const fixedNewlines = fixUnescapedNewlines(cleanStr);
    // Always try to parse the fixed version (even if it looks the same)
    const data = JSON.parse(fixedNewlines);
    return { success: true, data };
  } catch {
    // Continue to other methods
  }

  // Try fixing quoted JSON objects (e.g., "content": "{ "key": "value" }")
  try {
    const fixed = fixQuotedJsonObjects(cleanStr);
    if (fixed !== cleanStr) {
      const data = JSON.parse(fixed);
      return { success: true, data };
    }
  } catch {
    // Continue to other methods
  }

  // Try combining fixes: first fix newlines, then quoted objects
  try {
    const fixedNewlines = fixUnescapedNewlines(cleanStr);
    const fixedBoth = fixQuotedJsonObjects(fixedNewlines);
    if (fixedBoth !== cleanStr) {
      const data = JSON.parse(fixedBoth);
      return { success: true, data };
    }
  } catch {
    // Continue to other methods
  }

  const trimmed = cleanStr;

  // Handle multiple top-level objects like "outputs: {...} inputs: {...}"
  // Convert to a single object: {"outputs": {...}, "inputs": {...}}
  const multiObjectPattern = /^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*\{/;
  if (multiObjectPattern.test(trimmed)) {
    try {
      // Split on patterns like "}\nkey:" or "} key:"
      const sections = trimmed.split(/\}\s*(?=[a-zA-Z_][a-zA-Z0-9_]*\s*:\s*\{)/);
      const parsed: Record<string, any> = {};

      for (const section of sections) {
        const match = section.match(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:\s*(\{[\s\S]*)/);
        if (match) {
          const key = match[1];
          let value = match[2];
          // Add closing brace if missing
          if (!value.trim().endsWith('}')) {
            value = value + '}';
          }
          try {
            parsed[key] = JSON.parse(value);
          } catch {
            // If parsing fails, store as string
            parsed[key] = value;
          }
        }
      }

      if (Object.keys(parsed).length > 0) {
        return { success: true, data: parsed };
      }
    } catch {
      // Continue to other methods
    }
  }

  // Try to fix common issues with object-like notation
  if ((trimmed.includes('{') || trimmed.includes('[')) &&
      (trimmed.includes(':') || trimmed.includes(','))) {
    try {
      // Try to convert unquoted keys to quoted keys
      const fixed = cleanStr
        .replace(/([{,]\s*)([a-zA-Z_][a-zA-Z0-9_]*)\s*:/g, '$1"$2":')
        .replace(/^([a-zA-Z_][a-zA-Z0-9_]*)\s*:/gm, '"$1":');

      const data = JSON.parse(fixed);
      return { success: true, data };
    } catch {
      // Still failed
    }
  }

  // Last resort: try to extract content from JSON-like structure manually
  // This handles cases where the JSON has issues but we can still extract the main content
  const simpleObjectMatch = trimmed.match(/^\{\s*"([^"]+)"\s*:\s*"([\s\S]*)"\s*\}$/);
  if (simpleObjectMatch) {
    const key = simpleObjectMatch[1];
    // Unescape common escape sequences in the value
    const value = simpleObjectMatch[2]
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
    return { success: true, data: { [key]: value } };
  }

  return { success: false, data: null };
};

/**
 * Format a field name for display (convert camelCase/snake_case/dotted to readable text)
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
    'answer': 'Answer',
    'request_id': 'Request ID',
    'trace_id': 'Trace ID',
    'span_id': 'Span ID',
    'user_id': 'User ID',
    'workspace_id': 'Workspace ID',
    'parent_span_id': 'Parent Span ID',
  };

  const lowerName = name.toLowerCase();
  if (friendlyNames[lowerName]) {
    return friendlyNames[lowerName];
  }

  // Handle dotted names like "mlflow.trace.inputs" - extract the last meaningful part
  if (name.includes('.')) {
    const parts = name.split('.');
    // Skip common prefixes like "mlflow", "trace", "span", "databricks"
    const skipPrefixes = ['mlflow', 'trace', 'span', 'databricks', 'source'];
    let meaningfulParts = parts.filter(p => !skipPrefixes.includes(p.toLowerCase()));

    // If all parts were prefixes, use the last 1-2 parts
    if (meaningfulParts.length === 0) {
      meaningfulParts = parts.slice(-2);
    }

    // Format the meaningful parts
    return meaningfulParts
      .map(part => part
        .replace(/_/g, ' ')
        .replace(/([a-z])([A-Z])/g, '$1 $2')
        .replace(/\b\w/g, c => c.toUpperCase())
      )
      .join(' ');
  }

  return name
    .replace(/_/g, ' ')
    .replace(/([a-z])([A-Z])/g, '$1 $2')
    .replace(/\b\w/g, c => c.toUpperCase());
};

/**
 * Check if a value looks like a broken/partial JSON fragment
 */
const isBrokenValue = (value: any): boolean => {
  if (typeof value !== 'string') return false;
  const trimmed = value.trim();
  // Check for partial JSON fragments
  if (trimmed === '{' || trimmed === '[' || trimmed === '{\\' || trimmed === '[\\') return true;
  if (trimmed === '\\' || trimmed === '{}' || trimmed === '[]') return true;
  // Check for values that are just escape sequences
  if (/^\\+$/.test(trimmed)) return true;
  return false;
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

  // Handle objects - display with key as label, value in collapsible block
  if (typeof value === 'object') {
    const entries = Object.entries(value);

    // Filter out broken/empty values
    const validEntries = entries.filter(([_, val]) =>
      !isBrokenValue(val) && val !== '' && val !== null && val !== undefined
    );

    if (validEntries.length === 0) {
      return <span className="text-gray-400 italic">Empty</span>;
    }

    // Use SmartObjectField for each entry to enable collapsible behavior
    return (
      <div className="space-y-3">
        {validEntries.map(([key, val]) => (
          <SmartObjectField key={key} fieldKey={key} value={val} depth={depth} />
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
  // Skip rendering broken/partial values entirely
  if (isBrokenValue(value)) {
    return null;
  }

  // Skip empty strings
  if (value === '' || value === null || value === undefined) {
    return null;
  }

  // Determine if this field should be collapsible
  const isComplexValue = typeof value === 'object' && value !== null;
  const isLongString = typeof value === 'string' && value.length > 200;
  const shouldCollapse = isComplexValue || isLongString;

  // Top-level fields (depth 0-1) start expanded so users see content immediately
  const [expanded, setExpanded] = useState(depth <= 1);

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
 * Extract string content from JSON-like data when full parsing fails
 * Returns an object with extracted key-value pairs
 */
const extractContentFromJsonLike = (str: string): { success: boolean; data: Record<string, string> } => {
  const result: Record<string, string> = {};

  // Pattern to match "key": "value" pairs where value might contain newlines
  // This is more lenient than JSON parsing
  const keyValuePattern = /"([^"]+)"\s*:\s*"((?:[^"\\]|\\.|[\r\n])*)"/g;

  let match;
  while ((match = keyValuePattern.exec(str)) !== null) {
    const key = match[1];
    let value = match[2];
    // Unescape common escape sequences
    value = value
      .replace(/\\n/g, '\n')
      .replace(/\\r/g, '\r')
      .replace(/\\t/g, '\t')
      .replace(/\\"/g, '"')
      .replace(/\\\\/g, '\\');
    result[key] = value;
  }

  return { success: Object.keys(result).length > 0, data: result };
};

/**
 * Extract actual content from LLM response formats (OpenAI/ChatCompletion, Anthropic, etc.)
 * Returns the extracted content if found, null otherwise
 */
const extractLLMResponseContent = (output: any): { content: string | null; metadata: Record<string, any> | null } => {
  if (!output || typeof output !== 'object') {
    return { content: null, metadata: null };
  }

  // Helper to extract content from a string that might be JSON-encoded
  const extractContentFromString = (str: string): string => {
    const trimmed = str.trim();
    if (trimmed.startsWith('{')) {
      try {
        const parsed = JSON.parse(trimmed);
        if (parsed.rationale && typeof parsed.rationale === 'string') {
          const resultLabel = parsed.result !== undefined ? `**Rating: ${parsed.result}**\n\n` : '';
          return resultLabel + parsed.rationale;
        }
        if (parsed.content && typeof parsed.content === 'string') {
          return parsed.content;
        }
      } catch {
        // Not valid JSON
      }
    }
    return str;
  };

  // Handle FLATTENED format where choices have been unwrapped:
  // { id, model, object, finish_reason, role, content }
  // This happens when the ChatCompletion response gets flattened during storage
  if (output.object === 'chat.completion' && output.role === 'assistant' && !output.choices) {
    // Look for content in various places
    let content: string | null = null;

    if (typeof output.content === 'string') {
      content = extractContentFromString(output.content);
    } else if (output.message?.content) {
      if (typeof output.message.content === 'string') {
        content = extractContentFromString(output.message.content);
      }
    }

    if (content) {
      const metadata: Record<string, any> = {};
      if (output.id) metadata.id = output.id;
      if (output.model) metadata.model = output.model;
      if (output.object) metadata.object = output.object;
      if (output.finish_reason) metadata.finish_reason = output.finish_reason;
      if (output.usage) metadata.usage = output.usage;
      return { content, metadata: Object.keys(metadata).length > 0 ? metadata : null };
    }
  }

  // Handle OpenAI/ChatCompletion format: { choices: [{ message: { content: "..." } }] }
  if (output.choices && Array.isArray(output.choices) && output.choices.length > 0) {
    const firstChoice = output.choices[0];
    let content: string | null = null;

    // Check message.content - handle both string and array formats
    if (firstChoice.message?.content !== undefined && firstChoice.message?.content !== null) {
      const msgContent = firstChoice.message.content;

      if (typeof msgContent === 'string') {
        const trimmedContent = msgContent.trim();
        // Check if the content is a JSON-encoded judge result
        if (trimmedContent.startsWith('{')) {
          try {
            const parsed = JSON.parse(trimmedContent);
            if (parsed.rationale && typeof parsed.rationale === 'string') {
              const resultLabel = parsed.result !== undefined ? `**Rating: ${parsed.result}**\n\n` : '';
              content = resultLabel + parsed.rationale;
            } else if (parsed.content && typeof parsed.content === 'string') {
              // Handle nested content field
              content = parsed.content;
            } else {
              // It's JSON but not a judge result - just use the original message content
              content = msgContent;
            }
          } catch {
            // Not valid JSON, use as-is
            content = msgContent;
          }
        } else {
          // Regular string content
          content = msgContent;
        }
      } else if (typeof msgContent === 'object' && msgContent !== null) {
        // Handle content that's already parsed as an object (e.g., judge result)
        if (msgContent.rationale && typeof msgContent.rationale === 'string') {
          const resultLabel = msgContent.result !== undefined ? `**Rating: ${msgContent.result}**\n\n` : '';
          content = resultLabel + msgContent.rationale;
        } else if (Array.isArray(msgContent)) {
          // Handle content as array of blocks (Anthropic/Databricks style)
          const textParts = msgContent
            .filter((c: any) => c.type === 'text' || c.type === 'output_text')
            .map((c: any) => c.text)
            .filter(Boolean);
          if (textParts.length > 0) {
            content = textParts.join('\n');
          }
        }
      }
    }
    // Handle judge output format: { choices: [{ result: ..., rationale: "..." }] }
    else if (firstChoice.rationale && typeof firstChoice.rationale === 'string') {
      // This is a judge evaluation output - show rationale as main content
      const resultLabel = firstChoice.result !== undefined ? `**Rating: ${firstChoice.result}**\n\n` : '';
      content = resultLabel + firstChoice.rationale;
    }
    // Alternative format with direct content on choice
    else if (typeof firstChoice.content === 'string') {
      content = firstChoice.content;
    }
    // Text completion format
    else if (typeof firstChoice.text === 'string') {
      content = firstChoice.text;
    }

    if (content) {
      // Extract metadata (everything except the actual content)
      const metadata: Record<string, any> = {};
      if (output.id) metadata.id = output.id;
      if (output.model) metadata.model = output.model;
      if (output.object) metadata.object = output.object;
      if (output.usage) metadata.usage = output.usage;
      if (firstChoice.finish_reason) metadata.finish_reason = firstChoice.finish_reason;
      if (output.finish_reason) metadata.finish_reason = output.finish_reason;

      return { content, metadata: Object.keys(metadata).length > 0 ? metadata : null };
    }
  }

  // Handle Anthropic/Claude format: { content: [{ type: "text", text: "..." }] }
  if (output.content && Array.isArray(output.content)) {
    // Try type: "text" format
    let textContent = output.content
      .filter((c: any) => c.type === 'text' && c.text)
      .map((c: any) => c.text)
      .join('\n');

    // Also try type: "output_text" format (Databricks/MLflow style)
    if (!textContent) {
      textContent = output.content
        .filter((c: any) => c.type === 'output_text' && c.text)
        .map((c: any) => c.text)
        .join('\n');
    }

    if (textContent) {
      const metadata: Record<string, any> = {};
      if (output.id) metadata.id = output.id;
      if (output.model) metadata.model = output.model;
      if (output.type) metadata.type = output.type;
      if (output.object) metadata.object = output.object;
      if (output.role) metadata.role = output.role;
      if (output.usage) metadata.usage = output.usage;
      if (output.stop_reason) metadata.stop_reason = output.stop_reason;
      if (output.finish_reason) metadata.finish_reason = output.finish_reason;

      return { content: textContent, metadata: Object.keys(metadata).length > 0 ? metadata : null };
    }
  }

  // Handle messages array format: { messages: [{ role: "assistant", content: "..." }] }
  if (output.messages && Array.isArray(output.messages)) {
    // Find assistant message
    const assistantMsg = output.messages.find((m: any) => m.role === 'assistant');
    if (assistantMsg) {
      let content: string | null = null;
      if (typeof assistantMsg.content === 'string') {
        content = assistantMsg.content;
      } else if (Array.isArray(assistantMsg.content)) {
        content = assistantMsg.content
          .filter((c: any) => (c.type === 'text' || c.type === 'output_text') && c.text)
          .map((c: any) => c.text)
          .join('\n');
      }
      if (content) {
        const metadata: Record<string, any> = {};
        if (output.id) metadata.id = output.id;
        if (output.model) metadata.model = output.model;
        return { content, metadata: Object.keys(metadata).length > 0 ? metadata : null };
      }
    }
  }

  // Handle direct content string
  if (output.content && typeof output.content === 'string') {
    const metadata: Record<string, any> = {};
    if (output.id) metadata.id = output.id;
    if (output.model) metadata.model = output.model;
    if (output.role) metadata.role = output.role;

    return { content: output.content, metadata: Object.keys(metadata).length > 0 ? metadata : null };
  }

  // Handle response with text field directly
  if (output.text && typeof output.text === 'string') {
    return { content: output.text, metadata: null };
  }

  // Handle Databricks agent response format: { output: [{ type: "message", content: [...] }] }
  if (output.output && Array.isArray(output.output)) {
    for (const item of output.output) {
      if (item.type === 'message' && item.role === 'assistant' && item.content) {
        let content: string | null = null;
        if (typeof item.content === 'string') {
          content = item.content;
        } else if (Array.isArray(item.content)) {
          content = item.content
            .filter((c: any) => (c.type === 'text' || c.type === 'output_text') && c.text)
            .map((c: any) => c.text)
            .join('\n');
        }
        if (content) {
          const metadata: Record<string, any> = {};
          if (output.id) metadata.id = output.id;
          if (output.model) metadata.model = output.model;
          return { content, metadata: Object.keys(metadata).length > 0 ? metadata : null };
        }
      }
    }
  }

  // LAST RESORT: Recursively search for content/rationale fields anywhere in the structure
  // This handles deeply nested or unusual data formats
  const findContentRecursively = (obj: any, depth: number = 0): string | null => {
    if (depth > 5 || !obj || typeof obj !== 'object') return null;

    // Check for rationale (judge output)
    if (obj.rationale && typeof obj.rationale === 'string') {
      const resultLabel = obj.result !== undefined ? `**Rating: ${obj.result}**\n\n` : '';
      return resultLabel + obj.rationale;
    }

    // Check for content field
    if (obj.content !== undefined && obj.content !== null) {
      if (typeof obj.content === 'string') {
        const trimmed = obj.content.trim();
        // Try to parse as JSON (for judge results)
        if (trimmed.startsWith('{')) {
          try {
            const parsed = JSON.parse(trimmed);
            if (parsed.rationale && typeof parsed.rationale === 'string') {
              const resultLabel = parsed.result !== undefined ? `**Rating: ${parsed.result}**\n\n` : '';
              return resultLabel + parsed.rationale;
            }
          } catch {
            // Not JSON
          }
        }
        // Return content if it's substantial (not just metadata)
        if (trimmed.length > 50) {
          return trimmed;
        }
      }
    }

    // Check arrays
    if (Array.isArray(obj)) {
      for (const item of obj) {
        const found = findContentRecursively(item, depth + 1);
        if (found) return found;
      }
    }

    // Check object properties
    for (const key of Object.keys(obj)) {
      if (['id', 'model', 'object', 'usage', 'created'].includes(key)) continue; // Skip metadata
      const found = findContentRecursively(obj[key], depth + 1);
      if (found) return found;
    }

    return null;
  };

  const foundContent = findContentRecursively(output);
  if (foundContent) {
    const metadata: Record<string, any> = {};
    if (output.id) metadata.id = output.id;
    if (output.model) metadata.model = output.model;
    if (output.object) metadata.object = output.object;
    if (output.finish_reason) metadata.finish_reason = output.finish_reason;
    return { content: foundContent, metadata: Object.keys(metadata).length > 0 ? metadata : null };
  }

  return { content: null, metadata: null };
};

/**
 * Render extracted LLM content prominently with collapsible metadata
 */
const LLMContentRenderer: React.FC<{
  content: string;
  metadata: Record<string, any> | null;
}> = ({ content, metadata }) => {
  const [showMetadata, setShowMetadata] = useState(false);

  return (
    <div className="space-y-3">
      {/* Main response content - prominently displayed */}
      <div className="text-gray-800 whitespace-pre-wrap leading-relaxed">
        {isMarkdownContent(content) ? (
          <div className="prose prose-sm max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]}>
              {content}
            </ReactMarkdown>
          </div>
        ) : (
          content
        )}
      </div>

      {/* Collapsible metadata section */}
      {metadata && (
        <div className="border-t border-gray-200 pt-2 mt-3">
          <button
            onClick={() => setShowMetadata(!showMetadata)}
            className="flex items-center gap-2 text-xs text-gray-500 hover:text-gray-700"
          >
            <ChevronDown className={`h-3 w-3 transition-transform ${showMetadata ? 'rotate-180' : ''}`} />
            Response Metadata
          </button>
          {showMetadata && (
            <div className="mt-2 bg-gray-50 p-2 rounded text-xs text-gray-600">
              <pre className="whitespace-pre-wrap">
                {JSON.stringify(metadata, null, 2)}
              </pre>
            </div>
          )}
        </div>
      )}
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
    // Check if this is an LLM response format and extract content
    const llmResponse = extractLLMResponseContent(parsed);
    if (llmResponse.content) {
      return <LLMContentRenderer content={llmResponse.content} metadata={llmResponse.metadata} />;
    }

    // Not an LLM response format, render normally
    return <SmartValueRenderer value={parsed} depth={0} defaultExpanded />;
  }

  // If data looks like JSON but failed to parse
  const trimmed = data?.trim() || '';
  const looksLikeJson = (trimmed.startsWith('{') && trimmed.endsWith('}')) ||
                        (trimmed.startsWith('[') && trimmed.endsWith(']'));

  if (looksLikeJson) {
    // Try to extract content from the JSON-like structure
    const { success: extractSuccess, data: extracted } = extractContentFromJsonLike(trimmed);

    if (extractSuccess) {
      // We extracted content - render it nicely
      return (
        <div className="space-y-3">
          {Object.entries(extracted).map(([key, value]) => (
            <SmartObjectField key={key} fieldKey={key} value={value} depth={0} />
          ))}
        </div>
      );
    }

    // Couldn't extract content - show as formatted code block
    let formattedData = data;
    try {
      // Simple pretty-print: add newlines after { and , and before }
      formattedData = data
        .replace(/,\s*"/g, ',\n  "')
        .replace(/\{\s*"/g, '{\n  "')
        .replace(/"\s*\}/g, '"\n}')
        .replace(/\[\{/g, '[\n  {')
        .replace(/\}\]/g, '}\n]');
    } catch {
      // Keep original
    }

    // Show as formatted code block with word wrapping
    return (
      <pre className="text-sm text-gray-800 whitespace-pre-wrap break-words font-mono bg-gray-50 p-3 rounded overflow-auto max-h-[500px]">
        {formattedData}
      </pre>
    );
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

/**
 * OutputRenderer - Smart component for displaying trace outputs
 *
 * This component first tries to extract LLM content from the RAW output
 * (before JSONPath transformation), which is important for detecting
 * ChatCompletion and other LLM response formats. Only if that fails
 * does it fall back to the JSONPath-transformed displayOutput.
 */
const OutputRenderer: React.FC<{
  rawOutput: string | object;
  displayOutput: string;
}> = ({ rawOutput, displayOutput }) => {
  // Try to extract LLM content from the raw output first
  const llmExtraction = useMemo(() => {
    // First, try to extract judge result from malformed JSON string
    if (typeof rawOutput === 'string') {
      const judgeResult = extractJudgeResultFromMalformed(rawOutput);
      if (judgeResult && judgeResult.rationale) {
        const resultLabel = judgeResult.result !== undefined ? `**Rating: ${judgeResult.result}**\n\n` : '';
        const content = resultLabel + judgeResult.rationale;

        // Extract basic metadata from the raw string
        const idMatch = rawOutput.match(/"id":\s*"([^"]+)"/);
        const modelMatch = rawOutput.match(/"model":\s*"([^"]+)"/);
        const metadata: Record<string, any> = {};
        if (idMatch) metadata.id = idMatch[1];
        if (modelMatch) metadata.model = modelMatch[1];

        return { content, metadata: Object.keys(metadata).length > 0 ? metadata : null };
      }
    }

    try {
      // Handle both string and already-parsed object
      let parsed: any;
      if (typeof rawOutput === 'string') {
        parsed = JSON.parse(rawOutput);
        // Handle double-stringified JSON (string containing JSON string)
        if (typeof parsed === 'string') {
          try {
            parsed = JSON.parse(parsed);
          } catch {
            // It was a regular string, not double-encoded
          }
        }
      } else if (typeof rawOutput === 'object' && rawOutput !== null) {
        parsed = rawOutput;
      } else {
        return { content: null, metadata: null };
      }

      return extractLLMResponseContent(parsed);
    } catch {
      return { content: null, metadata: null };
    }
  }, [rawOutput]);

  // If we found LLM content in raw output, render it prominently
  if (llmExtraction.content) {
    return <LLMContentRenderer content={llmExtraction.content} metadata={llmExtraction.metadata} />;
  }

  // Otherwise fall back to SmartJsonRenderer with the (possibly JSONPath-transformed) displayOutput
  return <SmartJsonRenderer data={displayOutput} />;
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
  const [showRawOutput, setShowRawOutput] = useState(false);
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
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Bot className="h-4 w-4 text-green-600" />
              <span className="font-medium text-green-800">Output</span>
              {isOutputJson && (
                <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                  Structured
                </span>
              )}
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowRawOutput(!showRawOutput)}
              className="text-xs text-gray-500 hover:text-gray-700"
            >
              {showRawOutput ? 'Show Formatted' : 'Show Raw JSON'}
            </Button>
          </div>
          <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded-r-lg">
            {showRawOutput ? (
              <pre className="text-sm text-gray-800 whitespace-pre-wrap overflow-x-auto font-mono">
                {typeof trace.output === 'string'
                  ? (() => {
                      try {
                        return JSON.stringify(JSON.parse(trace.output), null, 2);
                      } catch {
                        return trace.output;
                      }
                    })()
                  : JSON.stringify(trace.output, null, 2)
                }
              </pre>
            ) : (
              <OutputRenderer rawOutput={trace.output} displayOutput={displayOutput} />
            )}
          </div>
        </div>
      </CardContent>
    </Card>
  );
};