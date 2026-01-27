/**
 * TraceViewer Component
 *
 * Simple, clean view of LLM conversations for the discovery phase.
 * Shows one trace at a time with minimal formatting to help assess quality.
 *
 * Supports optional JSONPath extraction for cleaner display when configured
 * by facilitators via workshop settings.
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
  Brain,
  Info
} from "lucide-react";
import { toast } from 'sonner';
import { useInvalidateTraces, useWorkshop } from '@/hooks/useWorkshopApi';
import { useMLflowConfig } from '@/hooks/useWorkshopApi';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useJsonPathExtraction } from '@/hooks/useJsonPathExtraction';

// Interface for parsed structured output
interface ParsedStructuredOutput {
  answer: string;
  annotations?: {
    url_citations?: Array<{
      url: string;
      title: string;
      type?: string;
    }>;
    [key: string]: any;
  };
  state?: any;
  trajectory?: any;
  [key: string]: any;
}

// Collapsible JSON section component
const CollapsibleJsonSection: React.FC<{
  title: string;
  icon: React.ReactNode;
  data: any;
  defaultExpanded?: boolean;
  colorClass?: string;
}> = ({ title, icon, data, defaultExpanded = false, colorClass = 'text-gray-600' }) => {
  const [expanded, setExpanded] = useState(defaultExpanded);
  
  if (!data || (typeof data === 'object' && Object.keys(data).length === 0)) {
    return null;
  }

  return (
    <div className="border rounded-lg overflow-hidden">
      <Button
        variant="ghost"
        onClick={() => setExpanded(!expanded)}
        className={`w-full flex items-center justify-between p-3 h-auto ${colorClass} hover:bg-gray-50`}
      >
        <div className="flex items-center gap-2">
          {icon}
          <span className="font-medium text-sm">{title}</span>
        </div>
        {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
      </Button>
      {expanded && (
        <div className="border-t bg-gray-50 p-3 max-h-96 overflow-auto">
          <pre className="text-xs text-gray-700 whitespace-pre-wrap font-mono">
            {JSON.stringify(data, null, 2)}
          </pre>
        </div>
      )}
    </div>
  );
};

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
  const rawDisplayInput = useJsonPathExtraction(trace.input, effectiveInputJsonPath);
  const rawDisplayOutput = useJsonPathExtraction(trace.output, effectiveOutputJsonPath);

  // Parse structured input for smart rendering
  const parsedInput = useMemo((): { isStructured: boolean; userMessage: string; context: any; state: any; rawText: string } => {
    try {
      const parsed = JSON.parse(rawDisplayInput);
      
      if (typeof parsed === 'object' && parsed !== null) {
        // Pattern 1: {"args": [[{"role": "user", "content": "...", "type": "message"}]], "context": {}, "state": {}}
        if ('args' in parsed && Array.isArray(parsed.args)) {
          const messages = parsed.args.flat().filter((m: any) => m && typeof m === 'object');
          const userMessages = messages
            .filter((m: any) => m.role === 'user' || m.type === 'message')
            .map((m: any) => m.content || m.text || '')
            .filter(Boolean);
          
          if (userMessages.length > 0) {
            return {
              isStructured: true,
              userMessage: userMessages.join('\n\n'),
              context: parsed.context,
              state: parsed.state,
              rawText: rawDisplayInput
            };
          }
        }
        
        // Pattern 2: {"messages": [{"role": "user", "content": "..."}], ...}
        if ('messages' in parsed && Array.isArray(parsed.messages)) {
          const userMessages = parsed.messages
            .filter((m: any) => m.role === 'user')
            .map((m: any) => m.content || '')
            .filter(Boolean);
          
          if (userMessages.length > 0) {
            return {
              isStructured: true,
              userMessage: userMessages.join('\n\n'),
              context: parsed.context,
              state: parsed.state,
              rawText: rawDisplayInput
            };
          }
        }
        
        // Pattern 3: {"input": "...", ...} or {"query": "...", ...} or {"question": "...", ...}
        const inputContent = parsed.input || parsed.query || parsed.question || parsed.prompt;
        if (typeof inputContent === 'string') {
          return {
            isStructured: true,
            userMessage: inputContent,
            context: parsed.context,
            state: parsed.state,
            rawText: rawDisplayInput
          };
        }
      }
      
      return { isStructured: false, userMessage: rawDisplayInput, context: null, state: null, rawText: rawDisplayInput };
    } catch {
      return { isStructured: false, userMessage: rawDisplayInput, context: null, state: null, rawText: rawDisplayInput };
    }
  }, [rawDisplayInput]);

  // Get the main display text for input
  const displayInput = parsedInput.userMessage;

  // Parse structured output for smart rendering
  const parsedOutput = useMemo((): { isStructured: boolean; data: ParsedStructuredOutput | null; rawText: string } => {
    try {
      const parsed = JSON.parse(rawDisplayOutput);
      
      // Check if it's a structured agent response with answer field
      if (typeof parsed === 'object' && parsed !== null) {
        // Common patterns for agent responses
        if ('answer' in parsed || 'response' in parsed || 'result' in parsed || 'output' in parsed) {
          const answer = parsed.answer || parsed.response || parsed.result || parsed.output || '';
          return {
            isStructured: true,
            data: {
              answer: typeof answer === 'string' ? answer : JSON.stringify(answer, null, 2),
              annotations: parsed.annotations,
              state: parsed.state,
              trajectory: parsed.trajectory,
              // Capture any other fields
              ...Object.fromEntries(
                Object.entries(parsed).filter(([key]) => 
                  !['answer', 'response', 'result', 'output', 'annotations', 'state', 'trajectory'].includes(key)
                )
              )
            },
            rawText: rawDisplayOutput
          };
        }
      }
      
      // Not a structured response, just return raw
      return { isStructured: false, data: null, rawText: rawDisplayOutput };
    } catch {
      // Not JSON, return as plain text
      return { isStructured: false, data: null, rawText: rawDisplayOutput };
    }
  }, [rawDisplayOutput]);

  // Get the main display text (answer for structured, raw for plain)
  const displayOutput = parsedOutput.isStructured && parsedOutput.data 
    ? parsedOutput.data.answer 
    : parsedOutput.rawText;

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
            {parsedInput.isStructured && (
              <span className="text-xs bg-blue-100 text-blue-700 px-2 py-0.5 rounded">
                Structured Request
              </span>
            )}
          </div>
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
            <div className="text-gray-800 leading-relaxed prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {displayInput}
              </ReactMarkdown>
            </div>
          </div>

          {/* Structured Input Metadata Sections */}
          {parsedInput.isStructured && (parsedInput.context || parsedInput.state) && (
            <div className="space-y-2 mt-2">
              {/* Context */}
              <CollapsibleJsonSection
                title="Request Context"
                icon={<Info className="h-4 w-4" />}
                data={parsedInput.context}
                colorClass="text-blue-600"
              />

              {/* State */}
              <CollapsibleJsonSection
                title="Request State"
                icon={<Database className="h-4 w-4" />}
                data={parsedInput.state}
                colorClass="text-blue-500"
              />
            </div>
          )}
        </div>

        {/* Output */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-green-600" />
            <span className="font-medium text-green-800">Output</span>
            {parsedOutput.isStructured && (
              <span className="text-xs bg-green-100 text-green-700 px-2 py-0.5 rounded">
                Structured Response
              </span>
            )}
          </div>
          
          {/* Main Answer/Response */}
          <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded-r-lg">
            <div className="text-gray-800 leading-relaxed prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {displayOutput}
              </ReactMarkdown>
            </div>
          </div>

          {/* Structured Output Metadata Sections */}
          {parsedOutput.isStructured && parsedOutput.data && (
            <div className="space-y-2 mt-4">
              {/* Citations */}
              {parsedOutput.data.annotations?.url_citations && (
                <CitationsDisplay citations={parsedOutput.data.annotations.url_citations} />
              )}

              {/* Trajectory/Reasoning */}
              <CollapsibleJsonSection
                title="Agent Reasoning & Trajectory"
                icon={<Brain className="h-4 w-4" />}
                data={parsedOutput.data.trajectory}
                colorClass="text-purple-600"
              />

              {/* State */}
              <CollapsibleJsonSection
                title="State Information"
                icon={<Info className="h-4 w-4" />}
                data={parsedOutput.data.state}
                colorClass="text-amber-600"
              />

              {/* Other annotations (non-citation) */}
              {parsedOutput.data.annotations && 
               Object.keys(parsedOutput.data.annotations).filter(k => k !== 'url_citations').length > 0 && (
                <CollapsibleJsonSection
                  title="Additional Annotations"
                  icon={<FileText className="h-4 w-4" />}
                  data={Object.fromEntries(
                    Object.entries(parsedOutput.data.annotations).filter(([k]) => k !== 'url_citations')
                  )}
                  colorClass="text-gray-600"
                />
              )}

              {/* Any other fields */}
              {(() => {
                const otherFields = Object.fromEntries(
                  Object.entries(parsedOutput.data).filter(([key]) => 
                    !['answer', 'annotations', 'state', 'trajectory'].includes(key)
                  )
                );
                return Object.keys(otherFields).length > 0 ? (
                  <CollapsibleJsonSection
                    title="Additional Data"
                    icon={<Database className="h-4 w-4" />}
                    data={otherFields}
                    colorClass="text-gray-500"
                  />
                ) : null;
              })()}
            </div>
          )}
        </div>
      </CardContent>
    </Card>
  );
};