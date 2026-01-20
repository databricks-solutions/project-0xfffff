/**
 * TraceViewer Component
 *
 * Simple, clean view of LLM conversations for the discovery phase.
 * Shows one trace at a time with minimal formatting to help assess quality.
 *
 * Supports optional JSONPath extraction for cleaner display when configured
 * by facilitators via workshop settings.
 */

import React, { useState } from 'react';
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
  RefreshCw
} from "lucide-react";
import { toast } from 'sonner';
import { useInvalidateTraces, useWorkshop } from '@/hooks/useWorkshopApi';
import { useMLflowConfig } from '@/hooks/useWorkshopApi';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useJsonPathExtraction } from '@/hooks/useJsonPathExtraction';

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
          </div>
          <div className="bg-blue-50 border-l-4 border-blue-400 p-4 rounded-r-lg">
            <div className="text-gray-800 leading-relaxed prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {displayInput}
              </ReactMarkdown>
            </div>
          </div>
        </div>

        {/* Output */}
        <div className="space-y-3">
          <div className="flex items-center gap-2">
            <Bot className="h-4 w-4 text-green-600" />
            <span className="font-medium text-green-800">Output</span>
          </div>
          <div className="bg-green-50 border-l-4 border-green-400 p-4 rounded-r-lg">
            <div className="text-gray-800 leading-relaxed prose prose-sm max-w-none">
              <ReactMarkdown remarkPlugins={[remarkGfm]}>
                {displayOutput}
              </ReactMarkdown>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
};