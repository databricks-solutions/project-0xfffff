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

export function TraceDataViewer({
  trace,
  className = '',
  showContext = false
}: TraceDataViewerProps) {
  const [activeTab, setActiveTab] = useState('table');

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
          
          {hasResultData && (
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

          {!hasResultData && (
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
