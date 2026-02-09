/**
 * FocusedAnalysisView Component
 * 
 * Provides a focused, one-trace-at-a-time view for analyzing discovery responses
 * during rubric creation. Includes a persistent scratch pad panel for pinning insights.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { TraceViewer, TraceData } from '@/components/TraceViewer';
import { 
  ChevronLeft, 
  ChevronRight, 
  Pin,
  NotebookPen,
  Copy,
  Trash2,
  MessageSquare,
  Lightbulb,
  Hash,
  Download,
  ArrowLeft,
  ArrowUpRight,
  Users,
  User
} from 'lucide-react';
import type { ParticipantNote } from '@/hooks/useWorkshopApi';

interface DiscoveryResponse {
  traceId: string;
  trace: {
    input: string;
    output: string;
    context?: any;
    mlflow_trace_id?: string;
  } | null;
  responses: {
    participant: string;
    question1: string;
    question2: string;
  }[];
}

export interface ScratchPadEntry {
  id: string;
  traceId: string;
  traceIndex: number;
  comment: string;
  timestamp: Date;
  category?: 'effectiveness' | 'scenario';
  source?: string; // participant ID if pinned from a response
}

interface FocusedAnalysisViewProps {
  discoveryResponses: DiscoveryResponse[];
  scratchPad: ScratchPadEntry[];
  setScratchPad: React.Dispatch<React.SetStateAction<ScratchPadEntry[]>>;
  participantNotes?: ParticipantNote[];
  allTraces?: { id: string }[];
}

export function FocusedAnalysisView({ discoveryResponses, scratchPad, setScratchPad, participantNotes, allTraces }: FocusedAnalysisViewProps) {
  const [currentTraceIndex, setCurrentTraceIndex] = useState(0);
  const [previousTraceIndex, setPreviousTraceIndex] = useState<number | null>(null);
  const [customNote, setCustomNote] = useState('');
  
  const currentTrace = discoveryResponses[currentTraceIndex];
  const totalTraces = discoveryResponses.length;

  // Convert trace data to TraceViewer format
  const convertToTraceData = (trace: DiscoveryResponse['trace']): TraceData | null => {
    if (!trace) return null;
    return {
      id: currentTrace.traceId,
      input: trace.input,
      output: trace.output,
      context: trace.context,
      mlflow_trace_id: trace.mlflow_trace_id || undefined
    };
  };

  const traceData = convertToTraceData(currentTrace?.trace);

  // Navigation handlers
  const goToPrevious = useCallback(() => {
    setPreviousTraceIndex(null); // Clear back button when navigating normally
    setCurrentTraceIndex((prev) => (prev > 0 ? prev - 1 : totalTraces - 1));
  }, [totalTraces]);

  const goToNext = useCallback(() => {
    setPreviousTraceIndex(null); // Clear back button when navigating normally
    setCurrentTraceIndex((prev) => (prev < totalTraces - 1 ? prev + 1 : 0));
  }, [totalTraces]);
  
  // Jump to specific trace from scratch pad
  const jumpToTrace = useCallback((traceIndex: number) => {
    if (traceIndex !== currentTraceIndex) {
      setPreviousTraceIndex(currentTraceIndex);
      setCurrentTraceIndex(traceIndex);
    }
  }, [currentTraceIndex]);
  
  // Go back to previous trace
  const goBack = useCallback(() => {
    if (previousTraceIndex !== null) {
      setCurrentTraceIndex(previousTraceIndex);
      setPreviousTraceIndex(null);
    }
  }, [previousTraceIndex]);

  // Keyboard navigation
  useEffect(() => {
    const handleKeyPress = (e: KeyboardEvent) => {
      // Don't trigger keyboard shortcuts when typing in input fields or textareas
      const target = e.target as HTMLElement;
      if (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable) {
        return;
      }

      if (e.key === 'ArrowLeft') {
        e.preventDefault();
        goToPrevious();
      }
      if (e.key === 'ArrowRight') {
        e.preventDefault();
        goToNext();
      }
    };

    window.addEventListener('keydown', handleKeyPress);
    return () => window.removeEventListener('keydown', handleKeyPress);
  }, [goToPrevious, goToNext]);

  // Pin a comment to scratch pad
  const pinComment = (comment: string, category: 'effectiveness' | 'scenario', source?: string) => {
    const entry: ScratchPadEntry = {
      id: Date.now().toString(),
      traceId: currentTrace.traceId,
      traceIndex: currentTraceIndex + 1,
      comment,
      timestamp: new Date(),
      category,
      source
    };
    setScratchPad([...scratchPad, entry]);
  };

  // Add custom note
  const addCustomNote = () => {
    if (customNote.trim()) {
      const entry: ScratchPadEntry = {
        id: Date.now().toString(),
        traceId: currentTrace.traceId,
        traceIndex: currentTraceIndex + 1,
        comment: customNote,
        timestamp: new Date()
      };
      setScratchPad([...scratchPad, entry]);
      setCustomNote('');
    }
  };

  // Remove from scratch pad
  const removeFromScratchPad = (id: string) => {
    setScratchPad(scratchPad.filter(entry => entry.id !== id));
  };

  // Export scratch pad
  const exportScratchPad = () => {
    const content = scratchPad.map(entry => 
      `[Trace ${entry.traceIndex}] ${entry.category ? `(${entry.category})` : ''}\n${entry.comment}\n---`
    ).join('\n\n');
    
    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `rubric-insights-${new Date().toISOString().split('T')[0]}.txt`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // Get unique themes from responses
  const getResponseThemes = () => {
    const themes = new Set<string>();
    currentTrace.responses.forEach(response => {
      // Simple theme extraction - in production, this could use NLP
      if (response.question1.toLowerCase().includes('clear')) themes.add('Clarity');
      if (response.question1.toLowerCase().includes('accurate')) themes.add('Accuracy');
      if (response.question1.toLowerCase().includes('helpful')) themes.add('Helpfulness');
      if (response.question1.toLowerCase().includes('example')) themes.add('Examples');
      if (response.question1.toLowerCase().includes('technical')) themes.add('Technical Detail');
      if (response.question1.toLowerCase().includes('safety')) themes.add('Safety');
    });
    return Array.from(themes);
  };

  if (!currentTrace) {
    return <div>No discovery responses available.</div>;
  }

  return (
    <div className="h-full max-h-[calc(100vh-12rem)] flex gap-6 w-full">
      {/* Left Panel - Trace Content */}
      <div className="flex-1 min-w-0 space-y-4 overflow-y-auto">
        {/* Navigation Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
              <Hash className="h-4 w-4 text-gray-500" />
              Trace {currentTraceIndex + 1} of {totalTraces}
            </h3>
            {previousTraceIndex !== null && (
              <Button
                variant="ghost"
                size="sm"
                onClick={goBack}
                className="flex items-center gap-1.5 h-7 text-xs text-blue-600 hover:text-blue-800 hover:bg-blue-50"
              >
                <ArrowLeft className="h-3 w-3" />
                Back to #{previousTraceIndex + 1}
              </Button>
            )}
          </div>

          <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
            <Button
              variant="ghost"
              size="sm"
              onClick={goToPrevious}
              disabled={totalTraces <= 1}
              className="h-7 w-7 p-0"
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <div className="w-24 mx-1">
              <div className="w-full bg-gray-200 rounded-full h-1.5">
                <div
                  className="bg-blue-600 h-1.5 rounded-full transition-all duration-300"
                  style={{ width: `${((currentTraceIndex + 1) / totalTraces) * 100}%` }}
                />
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={goToNext}
              disabled={totalTraces <= 1}
              className="h-7 w-7 p-0"
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </div>

        {/* Trace Content - Use standardized TraceViewer */}
        {traceData ? (
          <TraceViewer trace={traceData} />
        ) : (
          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
                <p className="text-amber-800 text-sm">No trace data available for this discovery response.</p>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Detected Themes */}
        {getResponseThemes().length > 0 && (
          <Card className="shadow-sm">
            <CardContent className="pt-6">
              <div className="flex items-start gap-2">
                <Lightbulb className="h-4 w-4 text-amber-500 mt-0.5" />
                <div className="flex-1">
                  <span className="text-sm font-medium text-gray-700 block mb-2">Common Themes:</span>
                  <div className="flex flex-wrap gap-1">
                    {getResponseThemes().map(theme => (
                      <Badge key={theme} variant="outline" className="text-xs bg-amber-50 border-amber-200 text-amber-800">
                        {theme}
                      </Badge>
                    ))}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Discovery Responses Card */}
        <Card className="shadow-sm">
          <CardHeader className="bg-gray-50 border-b">
            <div className="flex items-center gap-2">
              <MessageSquare className="h-5 w-5 text-gray-600" />
              <h3 className="font-semibold text-gray-900">Discovery Responses</h3>
            </div>
          </CardHeader>
          <CardContent>
            <div className="space-y-6">
              {/* Effectiveness Responses */}
              <div>
                <div className="flex items-center gap-2 mb-4">
                  <div className="w-2 h-6 bg-blue-500 rounded-full"></div>
                  <h4 className="font-semibold text-gray-900">Response Effectiveness Analysis</h4>
                  <Badge variant="secondary" className="text-xs">{currentTrace.responses.length} responses</Badge>
                </div>
                <div className="space-y-3">
                  {currentTrace.responses.map((response, index) => (
                    <Card key={index} className="p-4 hover:shadow-md transition-all hover:border-blue-300 bg-gradient-to-r from-white to-blue-50/30">
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 mb-2">
                            <div className="w-6 h-6 bg-blue-100 rounded-full flex items-center justify-center text-xs font-medium text-blue-700">
                              {response.participant.split('_')[1] || index + 1}
                            </div>
                            <span className="text-xs text-gray-500">{response.participant}</span>
                          </div>
                          <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{response.question1}</p>
                        </div>
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => pinComment(response.question1, 'effectiveness', response.participant)}
                          className="text-blue-600 hover:text-blue-800 hover:bg-blue-100"
                        >
                          <Pin className="h-4 w-4" />
                        </Button>
                      </div>
                    </Card>
                  ))}
                </div>
              </div>

              {/* Good/Bad Scenarios - Only show if question2 data exists */}
              {currentTrace.responses.some(response => response.question2) && (
                <div>
                  <div className="flex items-center gap-2 mb-4">
                    <div className="w-2 h-6 bg-green-500 rounded-full"></div>
                    <h4 className="font-semibold text-gray-900">Good/Bad Scenario Analysis</h4>
                    <Badge variant="secondary" className="text-xs">
                      {currentTrace.responses.filter(r => r.question2).length} responses
                    </Badge>
                  </div>
                  <div className="space-y-3">
                    {currentTrace.responses
                      .filter(response => response.question2)
                      .map((response, index) => (
                        <Card key={index} className="p-4 hover:shadow-md transition-all hover:border-green-300 bg-gradient-to-r from-white to-green-50/30">
                          <div className="flex items-start justify-between gap-3">
                            <div className="flex-1">
                              <div className="flex items-center gap-2 mb-2">
                                <div className="w-6 h-6 bg-green-100 rounded-full flex items-center justify-center text-xs font-medium text-green-700">
                                  {response.participant.split('_')[1] || index + 1}
                                </div>
                                <span className="text-xs text-gray-500">{response.participant}</span>
                              </div>
                              <p className="text-sm text-gray-800 leading-relaxed whitespace-pre-wrap">{response.question2}</p>
                            </div>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => pinComment(response.question2, 'scenario', response.participant)}
                              className="text-green-600 hover:text-green-800 hover:bg-green-100"
                            >
                              <Pin className="h-4 w-4" />
                            </Button>
                          </div>
                        </Card>
                      ))}
                  </div>
                </div>
              )}
            </div>

            {/* Keyboard Shortcuts */}
            <div className="mt-6 pt-4 border-t bg-gray-50 -mx-6 px-6 py-3">
              <div className="flex items-center gap-4 text-xs text-gray-600">
                <div className="flex items-center gap-2">
                  <span className="font-medium">Keyboard shortcuts:</span>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-2 py-1 bg-white border border-gray-300 rounded text-xs">←</kbd>
                  <span>Previous</span>
                </div>
                <div className="flex items-center gap-1">
                  <kbd className="px-2 py-1 bg-white border border-gray-300 rounded text-xs">→</kbd>
                  <span>Next</span>
                </div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Right Panel - Scratch Pad */}
      <div className="w-80 lg:w-96 flex-shrink-0 rounded-lg border border-gray-200 bg-white overflow-hidden">
        <div className="h-full flex flex-col">
          <div className="px-4 py-3 border-b border-gray-100">
            <div className="flex items-center justify-between">
              <h3 className="text-sm font-semibold text-gray-900 flex items-center gap-2">
                <NotebookPen className="h-4 w-4 text-gray-500" />
                Scratch Pad
                {(scratchPad.length + (participantNotes?.length || 0)) > 0 && (
                  <Badge variant="secondary" className="bg-gray-100 text-gray-600 text-[10px] px-1.5 py-0 h-5">
                    {scratchPad.length + (participantNotes?.length || 0)}
                  </Badge>
                )}
              </h3>
              {scratchPad.length > 0 && (
                <Button
                  onClick={exportScratchPad}
                  variant="ghost"
                  size="sm"
                  className="text-gray-400 hover:text-gray-600 h-7 w-7 p-0"
                >
                  <Download className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
          <div className="flex-1 px-4 py-3 overflow-y-auto">
            <div className="space-y-3">
              {/* Custom Note Input */}
              <div className="space-y-2">
                <Textarea
                  placeholder="Add a custom note..."
                  value={customNote}
                  onChange={(e) => setCustomNote(e.target.value)}
                  className="min-h-[60px] bg-gray-50 border-gray-200 text-sm resize-none"
                />
                {customNote.trim() && (
                  <Button
                    onClick={addCustomNote}
                    size="sm"
                    className="w-full h-7 text-xs"
                  >
                    Add Note
                  </Button>
                )}
              </div>

              {/* Participant Notes from DB */}
              {participantNotes && participantNotes.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Users className="h-4 w-4 text-purple-600" />
                    <span className="text-xs font-semibold text-purple-700 uppercase tracking-wider">
                      Participant Notes
                    </span>
                    <Badge variant="secondary" className="bg-purple-100 text-purple-700 text-xs">
                      {participantNotes.length}
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {participantNotes.map((note) => {
                      // Find trace index in discoveryResponses (for navigation)
                      const discoveryIndex = note.trace_id
                        ? discoveryResponses.findIndex(r => r.traceId === note.trace_id)
                        : -1;
                      // Find trace index in allTraces (for display label)
                      const allTracesIndex = note.trace_id && allTraces
                        ? allTraces.findIndex(t => t.id === note.trace_id)
                        : -1;
                      const traceLabel = allTracesIndex >= 0 ? allTracesIndex + 1 : (discoveryIndex >= 0 ? discoveryIndex + 1 : null);
                      const isCurrentTrace = discoveryIndex >= 0 && discoveryIndex === currentTraceIndex;
                      const isAnnotationNote = note.phase === 'annotation';
                      
                      return (
                        <Card 
                          key={note.id} 
                          className={`p-3 border-l-4 ${
                            isAnnotationNote ? 'border-l-indigo-400' : 'border-l-purple-400'
                          } ${
                            isCurrentTrace ? 'bg-purple-50/50 border-purple-200' : 'bg-white'
                          }`}
                        >
                          <div className="space-y-2">
                            <p className="text-sm text-gray-700 whitespace-pre-wrap">{note.content}</p>
                            <div className="flex items-center justify-between">
                              <div className="flex items-center gap-2">
                                <div className="flex items-center gap-1">
                                  <User className="h-3 w-3 text-purple-500" />
                                  <span className="text-xs text-purple-600 font-medium">
                                    {note.user_name || note.user_id}
                                  </span>
                                </div>
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                                  isAnnotationNote 
                                    ? 'bg-indigo-50 text-indigo-600 border-indigo-200' 
                                    : 'bg-purple-50 text-purple-600 border-purple-200'
                                }`}>
                                  {isAnnotationNote ? 'Annotation' : 'Discovery'}
                                </Badge>
                                {traceLabel != null && (
                                  discoveryIndex >= 0 ? (
                                    <button
                                      onClick={() => jumpToTrace(discoveryIndex)}
                                      className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                                    >
                                      Trace {traceLabel}
                                      <ArrowUpRight className="h-3 w-3" />
                                    </button>
                                  ) : (
                                    <span className="text-xs text-gray-500 flex items-center gap-1">
                                      Trace {traceLabel}
                                    </span>
                                  )
                                )}
                              </div>
                              <span className="text-xs text-gray-400">
                                {new Date(note.created_at).toLocaleTimeString()}
                              </span>
                            </div>
                          </div>
                        </Card>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Pinned Items */}
              {scratchPad.length > 0 && (
                <div className="space-y-2">
                  <div className="flex items-center gap-2">
                    <Lightbulb className="h-4 w-4 text-amber-600" />
                    <span className="text-xs font-semibold text-amber-700 uppercase tracking-wider">
                      Pinned Insights
                    </span>
                    <Badge variant="secondary" className="bg-amber-100 text-amber-700 text-xs">
                      {scratchPad.length}
                    </Badge>
                  </div>
                </div>
              )}
              <div className="space-y-3">
                {scratchPad.length === 0 && (!participantNotes || participantNotes.length === 0) ? (
                  <div className="text-center py-6 text-gray-400">
                    <Pin className="h-8 w-8 mx-auto mb-2 text-gray-300" />
                    <p className="text-xs">Pin insights from responses using the pin icon.</p>
                  </div>
                ) : (
                  scratchPad.map((entry) => {
                    const isCurrentTrace = entry.traceIndex === currentTraceIndex + 1;
                    const categoryColor = entry.category === 'effectiveness'
                      ? 'border-l-green-400'
                      : entry.category === 'scenario'
                      ? 'border-l-blue-400'
                      : 'border-l-amber-400';

                    return (
                      <Card
                        key={entry.id}
                        className={`p-3 border-l-4 ${categoryColor} ${
                          isCurrentTrace ? 'bg-amber-50/50 border-amber-200' : 'bg-white'
                        }`}
                      >
                        <div className="space-y-2">
                          <p className="text-sm text-gray-700 whitespace-pre-wrap">{entry.comment}</p>
                          <div className="flex items-center justify-between">
                            <div className="flex items-center gap-2">
                              <button
                                onClick={() => jumpToTrace(entry.traceIndex - 1)}
                                className="text-xs text-blue-600 hover:text-blue-800 flex items-center gap-1"
                              >
                                Trace {entry.traceIndex}
                                <ArrowUpRight className="h-3 w-3" />
                              </button>
                              {entry.category && (
                                <Badge variant="outline" className={`text-[10px] px-1.5 py-0 ${
                                  entry.category === 'effectiveness'
                                    ? 'bg-green-50 text-green-600 border-green-200'
                                    : entry.category === 'scenario'
                                    ? 'bg-blue-50 text-blue-600 border-blue-200'
                                    : 'bg-amber-50 text-amber-600 border-amber-200'
                                }`}>
                                  {entry.category}
                                </Badge>
                              )}
                              {entry.source && (
                                <div className="flex items-center gap-1">
                                  <User className="h-3 w-3 text-gray-400" />
                                  <span className="text-xs text-gray-500">
                                    {entry.source}
                                  </span>
                                </div>
                              )}
                            </div>
                            <div className="flex items-center gap-2">
                              <span className="text-xs text-gray-400">
                                {entry.timestamp.toLocaleTimeString()}
                              </span>
                              <Button
                                variant="ghost"
                                size="sm"
                                onClick={() => removeFromScratchPad(entry.id)}
                                className="text-red-600 hover:text-red-800 h-6 w-6 p-0"
                              >
                                <Trash2 className="h-3 w-3" />
                              </Button>
                            </div>
                          </div>
                        </div>
                      </Card>
                    );
                  })
                )}
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}