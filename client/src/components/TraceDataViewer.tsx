import React, { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Table, 
  TableBody, 
  TableCell, 
  TableHead, 
  TableHeader, 
  TableRow 
} from '@/components/ui/table';
import {
  Copy,
  Download,
  FileText,
  Database
} from 'lucide-react';

interface TraceData {
  id: string;
  input: string;
  output: string;
  context?: any;
  mlflow_trace_id?: string;
}

interface TraceDataViewerProps {
  trace: TraceData;
  className?: string;
  showContext?: boolean;
}

interface ParsedOutput {
  result: any[];
  query_text?: string;
  [key: string]: any;
}

// Helper to extract actual content from various LLM response formats
function extractLLMContent(output: any): { content: string | null; metadata: Record<string, any> | null } {
  if (!output || typeof output !== 'object') {
    return { content: null, metadata: null };
  }

  // Handle OpenAI/ChatCompletion format: { choices: [{ message: { content: "..." } }] }
  if (output.choices && Array.isArray(output.choices) && output.choices.length > 0) {
    const firstChoice = output.choices[0];
    let content: string | null = null;

    // Check message.content - handle both string and array formats
    if (firstChoice.message?.content) {
      if (typeof firstChoice.message.content === 'string') {
        content = firstChoice.message.content;
      } else if (Array.isArray(firstChoice.message.content)) {
        // Handle content as array of blocks (Anthropic/Databricks style)
        const textParts = firstChoice.message.content
          .filter((c: any) => c.type === 'text' || c.type === 'output_text')
          .map((c: any) => c.text)
          .filter(Boolean);
        if (textParts.length > 0) {
          content = textParts.join('\n');
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

  return { content: null, metadata: null };
}

export function TraceDataViewer({
  trace,
  className = '',
  showContext = false
}: TraceDataViewerProps) {
  const [activeTab, setActiveTab] = useState('content');

  // Parse the output JSON
  const parsedOutput: ParsedOutput | null = useMemo(() => {
    try {
      if (typeof trace.output === 'string') {
        return JSON.parse(trace.output);
      }
      return trace.output;
    } catch (error) {
      
      return null;
    }
  }, [trace.output]);

  // Parse the input JSON
  const parsedInput: any = useMemo(() => {
    try {
      if (typeof trace.input === 'string') {
        return JSON.parse(trace.input);
      }
      return trace.input;
    } catch (error) {
      
      return trace.input;
    }
  }, [trace.input]);

  // Check if output contains result data
  const hasResultData = parsedOutput && Array.isArray(parsedOutput.result);
  const hasQueryText = parsedOutput && parsedOutput.query_text;

  // Extract LLM content if this is a chat completion response
  const llmContent = useMemo(() => {
    if (!parsedOutput) return { content: null, metadata: null };
    return extractLLMContent(parsedOutput);
  }, [parsedOutput]);

  const hasLLMContent = llmContent.content !== null;

  // Generate table headers from the first result item
  const tableHeaders = useMemo(() => {
    if (!hasResultData || parsedOutput.result.length === 0) return [];
    
    const firstItem = parsedOutput.result[0];
    return Object.keys(firstItem);
  }, [parsedOutput, hasResultData]);

  // Format SQL query for display
  const formatSQL = (sql: string) => {
    return sql
      .replace(/\bSELECT\b/gi, '\nSELECT')
      .replace(/\bFROM\b/gi, '\nFROM')
      .replace(/\bWHERE\b/gi, '\nWHERE')
      .replace(/\bGROUP BY\b/gi, '\nGROUP BY')
      .replace(/\bORDER BY\b/gi, '\nORDER BY')
      .replace(/\bHAVING\b/gi, '\nHAVING')
      .replace(/\bJOIN\b/gi, '\nJOIN')
      .replace(/\bLEFT JOIN\b/gi, '\nLEFT JOIN')
      .replace(/\bRIGHT JOIN\b/gi, '\nRIGHT JOIN')
      .replace(/\bINNER JOIN\b/gi, '\nINNER JOIN')
      .replace(/\bUNION\b/gi, '\nUNION')
      .replace(/\bLIMIT\b/gi, '\nLIMIT')
      .trim();
  };

  // Copy data to clipboard
  const copyToClipboard = async (text: string, type: string) => {
    try {
      await navigator.clipboard.writeText(text);
      // You could add a toast notification here
      
    } catch (error) {
      
    }
  };

  // Download data as CSV
  const downloadAsCSV = () => {
    if (!hasResultData) return;

    const headers = tableHeaders;
    const csvContent = [
      headers.join(','),
      ...parsedOutput.result.map(row => 
        headers.map(header => {
          const value = row[header];
          // Escape commas and quotes in CSV
          if (typeof value === 'string' && (value.includes(',') || value.includes('"'))) {
            return `"${value.replace(/"/g, '""')}"`;
          }
          return value;
        }).join(',')
      )
    ].join('\n');

    const blob = new Blob([csvContent], { type: 'text/csv' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trace_${trace.id}_data.csv`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  // Download SQL query
  const downloadSQL = () => {
    if (!hasQueryText || !parsedOutput.query_text) return;

    const blob = new Blob([parsedOutput.query_text], { type: 'text/sql' });
    const url = window.URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `trace_${trace.id}_query.sql`;
    a.click();
    window.URL.revokeObjectURL(url);
  };

  if (!parsedOutput) {
    return (
      <Card className={className}>
        <CardContent className="p-4">
          <div className="text-center text-gray-500">
            <Database className="h-8 w-8 mx-auto mb-2" />
            <p>Unable to parse trace output</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={className}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2 text-lg">
            <FileText className="h-4 w-4" />
            Trace Data Viewer
            {trace.mlflow_trace_id && (
              <Badge variant="outline" className="text-xs">
                MLflow: {trace.mlflow_trace_id.slice(0, 8)}...
              </Badge>
            )}
          </CardTitle>

        </div>
      </CardHeader>

      <CardContent className="space-y-4">
        {/* Input Section */}
        <div>
          <h4 className="font-medium text-sm text-gray-700 mb-2">Input</h4>
          <div className="bg-gray-50 p-3 rounded border">
            <pre className="text-sm text-gray-800 whitespace-pre-wrap">
              {JSON.stringify(parsedInput, null, 2)}
            </pre>
            <Button
              variant="ghost"
              size="sm"
              className="mt-2 h-6 px-2 text-xs"
              onClick={() => copyToClipboard(JSON.stringify(parsedInput, null, 2), 'Input')}
            >
              <Copy className="h-3 w-3 mr-1" />
              Copy
            </Button>
          </div>
        </div>

        {/* Output Section */}
        <div>
          <h4 className="font-medium text-sm text-gray-700 mb-2">Output</h4>

          {/* LLM Response Content - Display prominently when available */}
          {hasLLMContent && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="content" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Response
                </TabsTrigger>
                <TabsTrigger value="json" className="flex items-center gap-2">
                  <Database className="h-4 w-4" />
                  Raw JSON
                </TabsTrigger>
              </TabsList>

              <TabsContent value="content" className="mt-4">
                <div className="space-y-3">
                  {/* Main response content */}
                  <div className="bg-blue-50 p-4 rounded-lg border border-blue-200">
                    <pre className="text-sm text-gray-800 whitespace-pre-wrap font-sans leading-relaxed">
                      {llmContent.content}
                    </pre>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="mt-3 h-6 px-2 text-xs"
                      onClick={() => llmContent.content && copyToClipboard(llmContent.content, 'Response content')}
                    >
                      <Copy className="h-3 w-3 mr-1" />
                      Copy Response
                    </Button>
                  </div>

                  {/* Metadata (collapsed by default) */}
                  {llmContent.metadata && (
                    <details className="text-xs">
                      <summary className="cursor-pointer text-gray-500 hover:text-gray-700 py-1">
                        Response Metadata
                      </summary>
                      <div className="bg-gray-50 p-2 rounded border mt-1">
                        <pre className="text-gray-600 whitespace-pre-wrap">
                          {JSON.stringify(llmContent.metadata, null, 2)}
                        </pre>
                      </div>
                    </details>
                  )}
                </div>
              </TabsContent>

              <TabsContent value="json" className="mt-4">
                <div className="bg-gray-50 p-3 rounded border">
                  <pre className="text-sm text-gray-800 whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(parsedOutput, null, 2)}
                  </pre>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-6 px-2 text-xs"
                    onClick={() => copyToClipboard(JSON.stringify(parsedOutput, null, 2), 'Output')}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          )}

          {/* Data table format (for SQL results etc.) */}
          {!hasLLMContent && hasResultData && (
            <Tabs value={activeTab} onValueChange={setActiveTab} className="w-full">
              <TabsList className="grid w-full grid-cols-2">
                <TabsTrigger value="table" className="flex items-center gap-2">
                  <Table className="h-4 w-4" />
                  Data Table
                </TabsTrigger>
                <TabsTrigger value="json" className="flex items-center gap-2">
                  <FileText className="h-4 w-4" />
                  Raw JSON
                </TabsTrigger>
              </TabsList>

              <TabsContent value="table" className="mt-4">
                <div className="space-y-3">
                  <div className="flex items-center justify-between">
                    <div className="text-sm text-gray-600">
                      {parsedOutput.result.length} rows × {tableHeaders.length} columns
                    </div>
                    <div className="flex items-center gap-2">
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={downloadAsCSV}
                        className="h-8 px-3 text-xs"
                      >
                        <Download className="h-3 w-3 mr-1" />
                        Download CSV
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => copyToClipboard(JSON.stringify(parsedOutput.result, null, 2), 'Table data')}
                        className="h-8 px-3 text-xs"
                      >
                        <Copy className="h-3 w-3 mr-1" />
                        Copy
                      </Button>
                    </div>
                  </div>

                  <div className="border rounded-lg overflow-hidden">
                    <Table>
                      <TableHeader>
                        <TableRow>
                          {tableHeaders.map((header) => (
                            <TableHead key={header} className="bg-gray-50">
                              {header.replace(/_/g, ' ').replace(/\b\w/g, l => l.toUpperCase())}
                            </TableHead>
                          ))}
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {parsedOutput.result.map((row, index) => (
                          <TableRow key={index}>
                            {tableHeaders.map((header) => (
                              <TableCell key={header} className="font-mono text-sm">
                                {row[header]}
                              </TableCell>
                            ))}
                          </TableRow>
                        ))}
                      </TableBody>
                    </Table>
                  </div>
                </div>
              </TabsContent>

              <TabsContent value="json" className="mt-4">
                <div className="bg-gray-50 p-3 rounded border">
                  <pre className="text-sm text-gray-800 whitespace-pre-wrap overflow-x-auto">
                    {JSON.stringify(parsedOutput, null, 2)}
                  </pre>
                  <Button
                    variant="ghost"
                    size="sm"
                    className="mt-2 h-6 px-2 text-xs"
                    onClick={() => copyToClipboard(JSON.stringify(parsedOutput, null, 2), 'Output')}
                  >
                    <Copy className="h-3 w-3 mr-1" />
                    Copy
                  </Button>
                </div>
              </TabsContent>
            </Tabs>
          )}

          {/* Fallback: Raw JSON display */}
          {!hasLLMContent && !hasResultData && (
            <div className="bg-gray-50 p-3 rounded border">
              <pre className="text-sm text-gray-800 whitespace-pre-wrap">
                {JSON.stringify(parsedOutput, null, 2)}
              </pre>
              <Button
                variant="ghost"
                size="sm"
                className="mt-2 h-6 px-2 text-xs"
                onClick={() => copyToClipboard(JSON.stringify(parsedOutput, null, 2), 'Output')}
              >
                <Copy className="h-3 w-3 mr-1" />
                Copy
              </Button>
            </div>
          )}
        </div>

        {/* SQL Query Section */}
        {hasQueryText && (
          <div>
            <h4 className="font-medium text-sm text-gray-700 mb-2">SQL Query</h4>
            <div className="bg-gray-50 p-3 rounded border">
              <pre className="text-sm text-gray-800 whitespace-pre-wrap font-mono overflow-x-auto">
                {parsedOutput.query_text ? formatSQL(parsedOutput.query_text) : ''}
              </pre>
              <div className="flex items-center gap-2 mt-2">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={downloadSQL}
                  className="h-6 px-2 text-xs"
                >
                  <Download className="h-3 w-3 mr-1" />
                  Download SQL
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => parsedOutput.query_text && copyToClipboard(parsedOutput.query_text, 'SQL query')}
                  className="h-6 px-2 text-xs"
                >
                  <Copy className="h-3 w-3 mr-1" />
                  Copy
                </Button>
              </div>
            </div>
          </div>
        )}

        {/* Context Section (if available) */}
        {showContext && trace.context && (
          <div>
            <h4 className="font-medium text-sm text-gray-700 mb-2">Context</h4>
            <div className="bg-gray-50 p-3 rounded border">
              <pre className="text-sm text-gray-800 whitespace-pre-wrap">
                {JSON.stringify(trace.context, null, 2)}
              </pre>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
