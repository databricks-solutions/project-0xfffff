/**
 * RubricCreationDemo Component
 * 
 * Demonstrates the rubric creation interface for facilitators.
 * After discovery, facilitators create Likert scale questions for annotation.
 */

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from '@/components/ui/dialog';
import { 
  Plus, 
  Trash2, 
  ClipboardList, 
  Lightbulb, 
  Users, 
  Star,
  ArrowRight,
  Save,
  CheckCircle,
  AlertCircle,
  Edit,
  Grid3x3,
  Focus,
  Loader2,
  Eye,
  EyeOff,
  Sparkles
} from 'lucide-react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useWorkflowContext } from '@/context/WorkflowContext';
import { useUser, useRoleCheck } from '@/context/UserContext';
import { useRubric, useCreateRubric, useUpdateRubric, useUserFindings, useFacilitatorFindingsWithUserDetails, useAllTraces, useAllParticipantNotes, useWorkshop, useToggleParticipantNotes } from '@/hooks/useWorkshopApi';
import { FocusedAnalysisView, ScratchPadEntry } from '@/components/FocusedAnalysisView';
import { RubricSuggestionPanel, type RubricSuggestion } from '@/components/RubricSuggestionPanel';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { useQueryClient } from '@tanstack/react-query';
import { WorkshopsService } from '@/client';
import type { Rubric, RubricCreate, JudgeType, DiscoveryFinding, Trace } from '@/client';
import { toast } from 'sonner';
import { parseRubricQuestions, formatRubricQuestions, QUESTION_DELIMITER, type RubricQuestion } from '@/utils/rubricUtils';


// Convert API Rubric to local RubricQuestion format
const convertApiRubricToQuestions = (rubric: Rubric): RubricQuestion[] => {
  return parseRubricQuestions(rubric.question);
};

// Convert local RubricQuestion to API format
const convertQuestionToApiRubric = (question: RubricQuestion): RubricCreate => ({
  question: `${question.title}: ${question.description}`,
  created_by: 'facilitator' // In a real app, this would be the actual user
});

// Get discovery responses from real findings data, enriched with trace information
const useDiscoveryResponses = (findings: DiscoveryFinding[] | undefined, traces: Trace[] | undefined) => {
  if (!findings || findings.length === 0 || !traces || traces.length === 0) return [];

  // Create a map of trace IDs to trace data for quick lookup
  const traceMap = traces.reduce((acc, trace) => {
    acc[trace.id] = trace;
    return acc;
  }, {} as Record<string, Trace>);

  // Group findings by trace_id to organize responses better
  const groupedByTrace = findings.reduce((acc, finding) => {
    if (!acc[finding.trace_id]) {
      acc[finding.trace_id] = [];
    }
    acc[finding.trace_id].push(finding);
    return acc;
  }, {} as Record<string, DiscoveryFinding[]>);
  
  return Object.entries(groupedByTrace).map(([traceId, traceFindings]) => {
    const trace = traceMap[traceId];
    
    return {
      traceId,
      trace: trace ? {
        input: trace.input,
        output: trace.output,
        context: trace.context,
        mlflow_trace_id: trace.mlflow_trace_id
      } : null,
      responses: traceFindings.map((finding, index) => {
        // Parse the formatted insight string back into separate questions
        const insight = finding.insight || '';
        const parts = insight.split('\n\nImprovement Analysis: ');
        
        let question1 = insight;
        let question2 = null;
        
        if (parts.length === 2) {
          // Remove "Quality Assessment: " prefix if present
          question1 = parts[0].replace('Quality Assessment: ', '');
          question2 = parts[1];
        }
        
        return {
          participant: finding.user_name || finding.user_id,
          question1,
          question2
        };
      })
    };
  }).filter(item => item.trace !== null); // Only return items where we found the corresponding trace
};

// Keep some sample data for demonstration when no real data is available
const sampleDiscoveryResponses = [
  {
    traceId: 'trace_1',
    trace: {
      input: 'Can you help me understand the difference between machine learning and artificial intelligence?',
      output: 'AI is a broader field that encompasses machine learning. Machine learning is a subset of AI that focuses on algorithms that can learn from data without being explicitly programmed. AI includes other techniques like rule-based systems, expert systems, and natural language processing.',
      context: { domain: 'education', complexity: 'beginner' },
      mlflow_trace_id: 'mlflow_trace_123'
    },
    responses: [
      {
        participant: 'SME_1',
        question1: 'The response is clear and technically accurate, but could use more concrete examples. The explanation is good for beginners.',
        question2: 'If this was good, adding jargon without explanation would make it bad. If it was bad, adding specific examples would make it good.'
      },
      {
        participant: 'SME_2', 
        question1: 'Very concise and accurate. Good foundational explanation that builds understanding step by step.',
        question2: 'Bad version would be overly complex or use circular definitions. Good version provides clear distinctions.'
      },
      {
        participant: 'Participant_1',
        question1: 'Easy to understand, not overwhelming. Gives me a clear mental model of the relationship.',
        question2: 'Would be bad if it just listed differences without explaining the relationship. Good because it builds from general to specific.'
      }
    ]
  },
  {
    traceId: 'trace_3',
    trace: {
      input: 'How do I fix a leaky faucet?',
      output: 'Turn off water. Replace the washer.',
      context: { domain: 'home_repair', complexity: 'basic' },
      mlflow_trace_id: 'mlflow_trace_456'
    },
    responses: [
      {
        participant: 'SME_1',
        question1: 'Too brief and lacks important safety information. Missing details about tools needed and troubleshooting steps.',
        question2: 'This is currently bad because it\'s too terse. Would be good if it included safety warnings, tool list, and more detailed steps.'
      },
      {
        participant: 'SME_2',
        question1: 'Very concise but dangerous - no mention of shutting off water first. Could cause flooding.',
        question2: 'Bad because it skips critical safety steps. Good version would prioritize safety and provide troubleshooting guidance.'
      },
      {
        participant: 'Participant_1',
        question1: 'I appreciate the brevity but I\'d be afraid to follow these steps without more context.',
        question2: 'Bad because it assumes knowledge I don\'t have. Good version would explain what might go wrong and how to handle it.'
      }
    ]
  }
];

export function RubricCreationDemo() {
  const { workshopId } = useWorkshopContext();
  const { setCurrentPhase } = useWorkflowContext();
  const { user } = useUser();
  const { isFacilitator } = useRoleCheck();
  const queryClient = useQueryClient();
  const [questions, setQuestions] = useState<RubricQuestion[]>([]);
  const [isAddingQuestion, setIsAddingQuestion] = useState(false);
  const [newQuestion, setNewQuestion] = useState<Omit<RubricQuestion, 'id'>>({
    title: '',
    description: '',
    judgeType: 'likert'
  });
  // Structured description fields for the dialog
  const [newDefinition, setNewDefinition] = useState('');
  const [newPositiveDirection, setNewPositiveDirection] = useState('');
  const [newNegativeDirection, setNewNegativeDirection] = useState('');
  const [newExamples, setNewExamples] = useState('');
  // Editing existing question via dialog (null = adding new, string = editing that question id)
  const [editingQuestionId, setEditingQuestionId] = useState<string | null>(null);
  const [isEditingExisting, setIsEditingExisting] = useState(false);
  const [viewMode, setViewMode] = useState<'grid' | 'focused'>('focused');
  const [scratchPad, setScratchPadState] = useState<ScratchPadEntry[]>([]);
  const [updatingQuestionId, setUpdatingQuestionId] = useState<string | null>(null);
  const [showSuggestionPanel, setShowSuggestionPanel] = useState(false);
  const [lastUpdatedQuestionId, setLastUpdatedQuestionId] = useState<string | null>(null);
  const [isSavingQuestion, setIsSavingQuestion] = useState(false);
  
  // Judge type selection
  const [judgeType, setJudgeType] = useState<JudgeType>('likert');
  const [binaryLabels, setBinaryLabels] = useState<Record<string, string>>({ pass: 'Pass', fail: 'Fail' });
  
  // Fetch data (only if workshopId exists)
  const { data: rubric, isLoading: rubricLoading, error: rubricError } = useRubric(workshopId || '');
  // Use all traces for rubric creation page
  const { data: traces, refetch: refetchTraces } = useAllTraces(workshopId || '');
  // Facilitators see all findings to create better rubric, others see their own
  // Both hooks must be called unconditionally (React rules of hooks)
  const facilitatorFindings = useFacilitatorFindingsWithUserDetails(workshopId || '');
  const userFindings = useUserFindings(workshopId || '', user);
  const { data: findings, refetch: refetchFindings, isRefetching: isRefetchingFindings } = isFacilitator
    ? facilitatorFindings
    : userFindings;
  const createRubric = useCreateRubric(workshopId || '');
  const updateRubric = useUpdateRubric(workshopId || '');
  // Fetch all participant notes for the scratch pad (facilitator sees all)
  const { data: participantNotes } = useAllParticipantNotes(workshopId || '');
  // Workshop data for show_participant_notes toggle
  const { data: workshopData } = useWorkshop(workshopId || '');
  const toggleParticipantNotes = useToggleParticipantNotes(workshopId || '');

  // Get discovery responses from real findings data, enriched with trace information
  const discoveryResponses = useDiscoveryResponses(findings, traces);

  // Helper to save scratch pad immediately to localStorage
  const saveScratchPadToStorage = useCallback((entries: ScratchPadEntry[]) => {
    if (!workshopId) return;
    const storageKey = `scratch-pad-${workshopId}`;
    if (entries.length > 0) {
      const dataToSave = {
        timestamp: Date.now(),
        scratchPad: entries
      };
      localStorage.setItem(storageKey, JSON.stringify(dataToSave));
    } else {
      localStorage.removeItem(storageKey);
    }
  }, [workshopId]);

  // Wrapper that saves immediately when setting scratch pad
  const setScratchPad = useCallback((value: ScratchPadEntry[] | ((prev: ScratchPadEntry[]) => ScratchPadEntry[])) => {
    setScratchPadState(prev => {
      const newValue = typeof value === 'function' ? value(prev) : value;
      // Save immediately to localStorage
      saveScratchPadToStorage(newValue);
      return newValue;
    });
  }, [saveScratchPadToStorage]);

  // Load scratch pad from localStorage on mount
  useEffect(() => {
    if (workshopId) {
      const storageKey = `scratch-pad-${workshopId}`;
      const storedData = localStorage.getItem(storageKey);
      if (storedData) {
        try {
          const parsed = JSON.parse(storedData);
          // Only load if data is less than 7 days old (extended from 24 hours)
          if (Date.now() - parsed.timestamp < 7 * 24 * 60 * 60 * 1000) {
            // Convert timestamp strings back to Date objects
            const entriesWithDates = parsed.scratchPad.map((entry: Omit<ScratchPadEntry, 'timestamp'> & { timestamp: string }) => ({
              ...entry,
              timestamp: new Date(entry.timestamp)
            }));
            setScratchPadState(entriesWithDates);
          } else {
            localStorage.removeItem(storageKey);
          }
        } catch (error) {
          localStorage.removeItem(storageKey);
        }
      }
    }
  }, [workshopId]);

  // Initialize questions and judge type from API data
  useEffect(() => {
    if (rubric && !isEditingExisting) {
      setQuestions(convertApiRubricToQuestions(rubric));
      // Load judge type from rubric
      if (rubric.judge_type) {
        setJudgeType(rubric.judge_type);
      }
      if (rubric.binary_labels) {
        setBinaryLabels(rubric.binary_labels);
      }
    }
  }, [rubric, isEditingExisting]);

  // SECURITY: Block access if no valid user or workshop (after all hooks)
  if (!user || !user.id) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <div className="text-lg font-medium text-gray-900 mb-2">
            Authentication Required
          </div>
          <div className="text-sm text-gray-500">
            You must be logged in to access rubric creation.
          </div>
        </div>
      </div>
    );
  }

  if (!workshopId) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <div className="text-lg font-medium text-gray-900 mb-2">
            No Workshop Selected
          </div>
          <div className="text-sm text-gray-500">
            Please select a workshop to access rubric creation.
          </div>
        </div>
      </div>
    );
  }

  // Build combined description from structured fields
  const buildDescription = () => {
    const parts: string[] = [];
    if (newDefinition.trim()) parts.push(newDefinition.trim());
    if (newPositiveDirection.trim()) parts.push(`Positive: ${newPositiveDirection.trim()}`);
    if (newNegativeDirection.trim()) parts.push(`Negative: ${newNegativeDirection.trim()}`);
    if (newExamples.trim()) parts.push(`Examples: ${newExamples.trim()}`);
    return parts.join('\n');
  };

  const resetDialogFields = () => {
    setNewQuestion({ title: '', description: '', judgeType: 'likert' });
    setNewDefinition('');
    setNewPositiveDirection('');
    setNewNegativeDirection('');
    setNewExamples('');
    setEditingQuestionId(null);
  };

  // Parse a stored description string back into structured fields
  const parseDescription = (description: string) => {
    let definition = '';
    let positive = '';
    let negative = '';
    let examples = '';
    
    const lines = description.split('\n');
    const definitionLines: string[] = [];
    
    for (const line of lines) {
      if (line.startsWith('Positive: ')) {
        positive = line.replace('Positive: ', '');
      } else if (line.startsWith('Negative: ')) {
        negative = line.replace('Negative: ', '');
      } else if (line.startsWith('Examples: ')) {
        examples = line.replace('Examples: ', '');
      } else {
        definitionLines.push(line);
      }
    }
    
    definition = definitionLines.join('\n').trim();
    return { definition, positive, negative, examples };
  };

  // Open the dialog in edit mode for an existing question
  const openEditDialog = (question: RubricQuestion) => {
    const parsed = parseDescription(question.description);
    setNewQuestion({ title: question.title, description: question.description, judgeType: question.judgeType || 'likert' });
    setNewDefinition(parsed.definition);
    setNewPositiveDirection(parsed.positive);
    setNewNegativeDirection(parsed.negative);
    setNewExamples(parsed.examples);
    setEditingQuestionId(question.id);
    setIsAddingQuestion(true);
  };

  const canSaveQuestion = () => {
    return newQuestion.title.trim() && newDefinition.trim();
  };

  const addQuestion = () => {
    if (!canSaveQuestion()) return;
    if (isSavingQuestion) return;

    // Build description from structured fields
    const description = buildDescription();
      
    setIsSavingQuestion(true);
    setIsEditingExisting(true);
      
    const newQuestionForRubric = {
      ...newQuestion,
      description,
      id: 'temp'
    };
    const updatedQuestions = [...questions, newQuestionForRubric];
    const combinedQuestionText = formatRubricQuestions(updatedQuestions);
    
    const apiRubric = {
      question: combinedQuestionText,
      created_by: 'facilitator',
      judge_type: judgeType,
      binary_labels: judgeType === 'binary' ? binaryLabels : undefined,
      rating_scale: 5
    };
    
    const method = rubric ? 'PUT' : 'POST';
    const url = `/workshops/${workshopId}/rubric`;
    
    fetch(url, {
      method,
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(apiRubric),
    })
      .then(response => {
        if (!response.ok) throw new Error('Failed');
        return response.json();
      })
      .then(savedRubric => {
        resetDialogFields();
        setIsAddingQuestion(false);
        if (savedRubric && savedRubric.id) {
          queryClient.setQueryData(['rubric', workshopId], savedRubric);
          setQuestions(convertApiRubricToQuestions(savedRubric));
        }
        toast.success('Question added successfully');
      })
      .catch(error => {
        console.error('Error:', error);
        toast.error('Failed to add question');
      })
      .finally(() => {
        setIsSavingQuestion(false);
        setIsEditingExisting(false);
      });
  };

  const deleteQuestion = async (id: string) => {
    try {
      // Prevent useEffect from overwriting our state changes
      setIsEditingExisting(true);
      
      // Immediately update local state to remove the deleted question
      // This provides instant UI feedback
      setQuestions(prevQuestions => prevQuestions.filter(q => q.id !== id));
      
      // Call the delete endpoint
      const response = await fetch(`/workshops/${workshopId}/rubric/questions/${id}`, {
        method: 'DELETE',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        // Revert on error - refetch to get current state
        setIsEditingExisting(false);
        queryClient.invalidateQueries({ queryKey: ['rubric', workshopId] });
        throw new Error('Failed to delete question');
      }
      
      // Get the updated rubric from the response
      const updatedRubric = await response.json();
      
      // Update the rubric cache directly with the server response
      if (updatedRubric && updatedRubric.id) {
        // Rubric still exists with remaining questions
        queryClient.setQueryData(['rubric', workshopId], updatedRubric);
        // Sync local state with the server response
        setQuestions(convertApiRubricToQuestions(updatedRubric));
      } else {
        // All questions deleted - rubric no longer exists
        queryClient.setQueryData(['rubric', workshopId], null);
        setQuestions([]);
      }
      
      // Re-enable useEffect sync
      setIsEditingExisting(false);
      
      toast.success('Question deleted successfully');
    } catch (error) {
      console.error('Error deleting question:', error);
      toast.error('Failed to delete question. Please try again.');
      setIsEditingExisting(false);
    }
  };

  const updateQuestion = (id: string, updates: Partial<RubricQuestion>) => {
    setQuestions(questions.map(q => 
      q.id === id ? { ...q, ...updates } : q
    ));
    setIsEditingExisting(true);
  };

  const updateIndividualQuestion = async (questionId: string) => {
    const question = questions.find(q => q.id === questionId);
    if (!question) return;

    setUpdatingQuestionId(questionId);
    
    try {
      // Call the new update endpoint for individual questions
      // Include judge_type to persist evaluation type changes
      const response = await fetch(`/workshops/${workshopId}/rubric/questions/${questionId}`, {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          title: question.title,
          description: question.description,
          judge_type: question.judgeType  // Include the evaluation type
        }),
      });
      
      if (!response.ok) {
        throw new Error(`HTTP error! status: ${response.status}`);
      }
      
      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['rubric', workshopId] });
      
      toast.success('Question updated successfully');
      setLastUpdatedQuestionId(questionId);
      
      // Clear success state after 3 seconds
      setTimeout(() => {
        setLastUpdatedQuestionId(null);
      }, 3000);
    } catch (error) {
      
      toast.error('Failed to update question. Please try again.');
    } finally {
      setUpdatingQuestionId(null);
    }
  };

  const saveExistingRubric = async () => {
    if (questions.length > 0) {
      try {
        // Combine all questions into a single rubric string using the utility
        const combinedQuestionText = formatRubricQuestions(questions);
        
        const apiRubric = {
          question: combinedQuestionText,
          created_by: 'facilitator'
        };
        await updateRubric.mutateAsync(apiRubric);
      } catch (error) {
        // Rubric save failed — mutation error is surfaced by react-query
      }
    }
  };

  if (rubricLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium text-gray-600 mb-2">Loading rubric...</div>
          <div className="text-sm text-gray-500">Fetching workshop data from API</div>
        </div>
      </div>
    );
  }

  return (
    <div className="h-full">
      <div className={`h-full ${viewMode === 'grid' ? 'max-w-6xl mx-auto p-6' : 'px-6 py-4'} space-y-5`}>

        {/* Main Content Tabs */}
        <Tabs defaultValue="discovery" className="w-full">
          <div className="flex items-center justify-between mb-4">
            <TabsList className="bg-gray-100/80">
              <TabsTrigger value="discovery" className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <Users className="h-4 w-4" />
                Discovery Responses
                {findings && findings.length > 0 && (
                  <Badge variant="secondary" className="ml-1 bg-blue-100 text-blue-700 text-[10px] px-1.5 py-0 h-5">{findings.length}</Badge>
                )}
              </TabsTrigger>
              <TabsTrigger value="rubric" className="flex items-center gap-2 data-[state=active]:bg-white data-[state=active]:shadow-sm">
                <ClipboardList className="h-4 w-4" />
                Rubric Questions
                {questions.length > 0 && (
                  <Badge variant="secondary" className="ml-1 bg-green-100 text-green-700 text-[10px] px-1.5 py-0 h-5">{questions.length}</Badge>
                )}
              </TabsTrigger>
            </TabsList>
            <div className="flex items-center gap-2">
              {rubric && (
                <Badge className="bg-green-50 text-green-700 border border-green-200">
                  <CheckCircle className="h-3 w-3 mr-1" />
                  Rubric Saved
                </Badge>
              )}
              {rubricError && (
                <Badge variant="destructive">
                  <AlertCircle className="h-3 w-3 mr-1" />
                  API Error
                </Badge>
              )}
            </div>
          </div>

          {/* Discovery Responses Tab */}
          <TabsContent value="discovery" className="space-y-4">
            {/* Toolbar */}
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => toggleParticipantNotes.mutate()}
                  disabled={toggleParticipantNotes.isPending}
                  className={`flex items-center gap-2 ${
                    workshopData?.show_participant_notes
                      ? 'border-purple-300 bg-purple-50 text-purple-700 hover:bg-purple-100'
                      : ''
                  }`}
                >
                  {workshopData?.show_participant_notes ? (
                    <>
                      <EyeOff className="h-4 w-4" />
                      Disable SME Notes
                    </>
                  ) : (
                    <>
                      <Eye className="h-4 w-4" />
                      Enable SME Notes
                    </>
                  )}
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setShowSuggestionPanel(true)}
                  disabled={!findings || findings.length === 0}
                  className="flex items-center gap-2"
                >
                  <Sparkles className="h-4 w-4" />
                  Generate Suggestions
                </Button>
              </div>
              <div className="flex items-center gap-1 bg-gray-100 rounded-lg p-1">
                <Button
                  variant={viewMode === 'grid' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('grid')}
                  className={`flex items-center gap-1.5 h-8 ${viewMode === 'grid' ? '' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  <Grid3x3 className="h-3.5 w-3.5" />
                  Grid
                </Button>
                <Button
                  variant={viewMode === 'focused' ? 'default' : 'ghost'}
                  size="sm"
                  onClick={() => setViewMode('focused')}
                  className={`flex items-center gap-1.5 h-8 ${viewMode === 'focused' ? '' : 'text-gray-600 hover:text-gray-900'}`}
                >
                  <Focus className="h-3.5 w-3.5" />
                  Focused
                </Button>
              </div>
            </div>

            {/* Facilitator Instructions */}
            <Card className="border-l-4 border-blue-500 bg-blue-50/30">
              <CardContent className="py-3 px-4">
                <div className="flex items-start gap-3">
                  <Lightbulb className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-blue-700">
                    Review participant responses to identify patterns and create rubric questions. Use these responses to facilitate group discussion and build consensus on evaluation criteria.
                  </p>
                </div>
              </CardContent>
            </Card>
            
            {viewMode === 'grid' ? (
              <div className="space-y-8">
                {discoveryResponses.length > 0 ? (
                  discoveryResponses.map((traceResponse, index) => (
                <Card key={index} className="border-l-4 border-blue-500">
                  <CardHeader className="pb-3">
                    <div className="flex items-start gap-3">
                      <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <span className="text-blue-600 font-medium text-sm">{index + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <h3 className="font-semibold text-gray-900 mb-1">Trace Analysis</h3>
                        {traceResponse.trace ? (
                          <p className="text-gray-600 text-sm italic">"{traceResponse.trace.input.substring(0, 100)}..."</p>
                        ) : (
                          <p className="text-gray-500 text-sm italic">No trace data available</p>
                        )}
                      </div>
                    </div>
                  </CardHeader>
                  <CardContent className="space-y-6">
                    <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                      {/* Effectiveness Responses */}
                      <div>
                        <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                          <Star className="h-4 w-4 text-yellow-500" />
                          Response Effectiveness
                        </h4>
                        <div className="space-y-3">
                          {traceResponse.responses.map((response, responseIndex) => (
                            <Card key={responseIndex} className="border-l-4 border-yellow-500">
                              <CardContent className="p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-6 h-6 bg-gradient-to-r from-blue-500 to-purple-500 rounded-full flex items-center justify-center">
                                    <span className="text-white font-medium text-xs">
                                      {response.participant.includes('SME') ? 'E' : 'P'}
                                    </span>
                                  </div>
                                  <span className="font-medium text-sm text-gray-700">{response.participant}</span>
                                </div>
                                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{response.question1}</p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>

                      {/* Good/Bad Scenarios */}
                      <div>
                        <h4 className="font-medium text-gray-800 mb-3 flex items-center gap-2">
                          <ClipboardList className="h-4 w-4 text-green-500" />
                          Good/Bad Scenarios
                        </h4>
                        <div className="space-y-3">
                          {traceResponse.responses.map((response, responseIndex) => (
                            <Card key={responseIndex} className="border-l-4 border-green-500">
                              <CardContent className="p-3">
                                <div className="flex items-center gap-2 mb-2">
                                  <div className="w-6 h-6 bg-gradient-to-r from-green-500 to-blue-500 rounded-full flex items-center justify-center">
                                    <span className="text-white font-medium text-xs">
                                      {response.participant.includes('SME') ? 'E' : 'P'}
                                    </span>
                                  </div>
                                  <span className="font-medium text-sm text-gray-700">{response.participant}</span>
                                </div>
                                <p className="text-sm text-gray-600 leading-relaxed whitespace-pre-wrap">{response.question2}</p>
                              </CardContent>
                            </Card>
                          ))}
                        </div>
                      </div>
                    </div>

                    {/* Key Themes */}
                    <div className="pt-4 border-t border-gray-200">
                      <div className="flex items-center gap-2 mb-3">
                        <Lightbulb className="h-4 w-4 text-amber-500" />
                        <span className="font-medium text-sm text-gray-700">Potential Rubric Themes</span>
                      </div>
                      <div className="flex flex-wrap gap-2">
                        {traceResponse.responses.length > 0 && (
                          <>
                            <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                              Empathy & Understanding
                            </Badge>
                            <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                              Professional Tone
                            </Badge>
                            <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                              Solution Orientation
                            </Badge>
                            <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                              Personalization
                            </Badge>
                          </>
                        )}
                      </div>
                    </div>
                  </CardContent>
                </Card>
                  ))
                ) : (
                  <div className="text-center py-16">
                    <div className="w-16 h-16 bg-amber-100 rounded-full flex items-center justify-center mx-auto mb-4">
                      <Lightbulb className="h-8 w-8 text-amber-400" />
                    </div>
                    <h3 className="text-lg font-medium text-gray-900 mb-2">No Discovery Data Available</h3>
                    <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
                      Complete the discovery phase first to see participant insights here. Responses will appear once participants have explored traces and provided feedback.
                    </p>
                  </div>
                )}
              </div>
            ) : (
              discoveryResponses.length > 0 ? (
                <FocusedAnalysisView
                  discoveryResponses={discoveryResponses}
                  scratchPad={scratchPad}
                  setScratchPad={setScratchPad}
                  participantNotes={participantNotes}
                  allTraces={traces}
                />
              ) : (
                <div className="text-center py-16">
                  <div className="w-16 h-16 bg-blue-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <Focus className="h-8 w-8 text-blue-400" />
                  </div>
                  <h3 className="text-lg font-medium text-gray-900 mb-2">No Discovery Data for Analysis</h3>
                  <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
                    Complete the discovery phase first to use focused analysis mode. Participant insights will appear here for review.
                  </p>
                  <div className="flex items-center justify-center gap-3">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setViewMode('grid')}
                      className="flex items-center gap-2"
                    >
                      <Grid3x3 className="h-4 w-4" />
                      Switch to Grid View
                    </Button>
                  </div>
                </div>
              )
            )}
          </TabsContent>

          {/* Rubric Questions Tab */}
          <TabsContent value="rubric" className="space-y-4">
            {/* Info about per-question judge types */}
            <Card className="border-l-4 border-indigo-500 bg-indigo-50/30">
              <CardContent className="py-3 px-4">
                <div className="flex items-start gap-3">
                  <Lightbulb className="h-4 w-4 text-indigo-600 mt-0.5 flex-shrink-0" />
                  <p className="text-sm text-indigo-700">
                    Each criterion can have its own evaluation type: <strong>Likert Scale</strong> (1-5 ratings),
                    <strong> Binary</strong> (Pass/Fail), or <strong>Free-form</strong> (open text feedback).
                  </p>
                </div>
              </CardContent>
            </Card>

            {/* Toolbar */}
            <div className="flex items-center justify-between">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
                <ClipboardList className="h-5 w-5 text-gray-600" />
                Evaluation Criteria
              </h3>
              <Button
                onClick={() => setIsAddingQuestion(true)}
                className="flex items-center gap-2"
                disabled={isAddingQuestion}
                size="sm"
              >
                <Plus className="h-4 w-4" />
                Add Criterion
              </Button>
            </div>

            <div className="space-y-4">
            {questions.length === 0 && !isAddingQuestion && (
              <div className="text-center py-12">
                <div className="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                  <ClipboardList className="h-8 w-8 text-gray-400" />
                </div>
                <h3 className="text-lg font-medium text-gray-900 mb-2">No Evaluation Criteria Yet</h3>
                <p className="text-sm text-gray-500 mb-6 max-w-md mx-auto">
                  Create your first evaluation criterion to define how traces will be assessed. Review the discovery responses above for inspiration.
                </p>
                <Button
                  onClick={() => setIsAddingQuestion(true)}
                  className="flex items-center gap-2"
                >
                  <Plus className="h-4 w-4" />
                  Create First Criterion
                </Button>
              </div>
            )}

            {questions.map((question, index) => {
              const parsed = parseDescription(question.description);
              const judgeType = question.judgeType || 'likert';
              const borderColor =
                judgeType === 'likert' ? 'border-green-500' :
                judgeType === 'binary' ? 'border-blue-500' :
                'border-purple-500';
              const bgColor =
                judgeType === 'likert' ? 'from-white to-green-50' :
                judgeType === 'binary' ? 'from-white to-blue-50' :
                'from-white to-purple-50';
              const iconBgColor =
                judgeType === 'likert' ? 'bg-green-100' :
                judgeType === 'binary' ? 'bg-blue-100' :
                'bg-purple-100';
              const iconTextColor =
                judgeType === 'likert' ? 'text-green-600' :
                judgeType === 'binary' ? 'text-blue-600' :
                'text-purple-600';

              return (
              <Card key={question.id} className={`border-l-4 ${borderColor}`}>
                <CardHeader className={`bg-gradient-to-br ${bgColor}`}>
                  <CardTitle className="flex items-start justify-between gap-3">
                    <div className="flex items-start gap-3 flex-1 min-w-0">
                      <div className={`w-10 h-10 ${iconBgColor} rounded-full flex items-center justify-center flex-shrink-0`}>
                        <span className={`${iconTextColor} font-medium`}>{index + 1}</span>
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-3 flex-wrap mb-2">
                          <h3 className="text-base font-semibold text-gray-900">{question.title}</h3>
                          <Badge
                            variant="outline"
                            className={
                              judgeType === 'likert' ? 'bg-green-50 text-green-700 border-green-200' :
                              judgeType === 'binary' ? 'bg-blue-50 text-blue-700 border-blue-200' :
                              'bg-purple-50 text-purple-700 border-purple-200'
                            }
                          >
                            {judgeType === 'likert' ? 'Likert Scale' : judgeType === 'binary' ? 'Binary' : 'Free-form'}
                          </Badge>
                        </div>
                      </div>
                    </div>
                    <div className="flex gap-1 flex-shrink-0">
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => openEditDialog(question)}
                        className="text-blue-600 hover:text-blue-800 hover:bg-blue-50"
                        title="Edit this criterion"
                      >
                        <Edit className="h-4 w-4" />
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => deleteQuestion(question.id)}
                        className="text-red-600 hover:text-red-800 hover:bg-red-50"
                        title="Remove this question from the rubric"
                      >
                        <Trash2 className="h-4 w-4" />
                      </Button>
                    </div>
                  </CardTitle>
                </CardHeader>
                <CardContent className="pt-4">
                  {/* Structured description display */}
                  <div className="space-y-3 text-sm">
                    {parsed.definition && (
                      <div>
                        <span className="font-medium text-gray-700">Definition: </span>
                        <span className="text-gray-600">{parsed.definition}</span>
                      </div>
                    )}
                    {parsed.positive && (
                      <div className="flex items-start gap-1.5">
                        <CheckCircle className="h-3.5 w-3.5 text-green-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="font-medium text-green-700">Positive: </span>
                          <span className="text-gray-600">{parsed.positive}</span>
                        </div>
                      </div>
                    )}
                    {parsed.negative && (
                      <div className="flex items-start gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5 text-red-600 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="font-medium text-red-700">Negative: </span>
                          <span className="text-gray-600">{parsed.negative}</span>
                        </div>
                      </div>
                    )}
                    {parsed.examples && (
                      <div className="flex items-start gap-1.5">
                        <Lightbulb className="h-3.5 w-3.5 text-amber-500 mt-0.5 flex-shrink-0" />
                        <div>
                          <span className="font-medium text-amber-700">Examples: </span>
                          <span className="text-gray-600">{parsed.examples}</span>
                        </div>
                      </div>
                    )}
                    {/* Fallback: if no structured fields were parsed, show raw description */}
                    {!parsed.definition && !parsed.positive && !parsed.negative && !parsed.examples && question.description && (
                      <div className="text-gray-600 whitespace-pre-wrap">{question.description}</div>
                    )}
                  </div>
                </CardContent>
              </Card>
              );
            })}

            {/* Add / Edit Evaluation Criterion Dialog */}
            <Dialog open={isAddingQuestion} onOpenChange={(open) => {
              if (!open) {
                resetDialogFields();
              }
              setIsAddingQuestion(open);
            }}>
              <DialogContent className="sm:max-w-[640px] max-h-[90vh] overflow-y-auto">
                <DialogHeader>
                  <DialogTitle className="flex items-center gap-2">
                    {editingQuestionId ? (
                      <><Edit className="h-5 w-5 text-blue-600" /> Edit Evaluation Criterion</>
                    ) : (
                      <><Plus className="h-5 w-5 text-purple-600" /> Add Evaluation Criterion</>
                    )}
                  </DialogTitle>
                  <DialogDescription>
                    {editingQuestionId 
                      ? 'Modify the definition, scoring direction, and examples for this evaluation criterion.'
                      : 'Define a new evaluation criterion with a clear definition, scoring direction, and examples to guide annotators.'}
                  </DialogDescription>
                </DialogHeader>

                <div className="space-y-5 py-2">
                  {/* Title */}
                  <div className="space-y-2">
                    <Label htmlFor="new-title" className="text-sm font-semibold text-gray-800">
                      Title <span className="text-red-500">*</span>
                    </Label>
                    <Input
                      id="new-title"
                      value={newQuestion.title}
                      onChange={(e) => setNewQuestion({ ...newQuestion, title: e.target.value })}
                      placeholder="e.g., Response Helpfulness"
                      className="bg-white"
                    />
                  </div>

                  {/* Definition */}
                  <div className="space-y-2">
                    <Label htmlFor="new-definition" className="text-sm font-semibold text-gray-800">
                      Definition <span className="text-red-500">*</span>
                    </Label>
                    <p className="text-xs text-muted-foreground -mt-1">
                      What does this criterion measure? Provide a clear, concise description.
                    </p>
                    <Textarea
                      id="new-definition"
                      value={newDefinition}
                      onChange={(e) => setNewDefinition(e.target.value)}
                      placeholder="e.g., This criterion evaluates whether the response is helpful in addressing the user's specific needs and resolving their question."
                      className="min-h-[70px] bg-white"
                    />
                  </div>

                  {/* Positive & Negative Direction - side by side */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    <div className="space-y-2">
                      <Label htmlFor="new-positive" className="text-sm font-semibold text-green-700 flex items-center gap-1.5">
                        <CheckCircle className="h-3.5 w-3.5" />
                        Positive Direction
                      </Label>
                      <p className="text-xs text-muted-foreground -mt-1">
                        What does a high-quality response look like?
                      </p>
                      <Textarea
                        id="new-positive"
                        value={newPositiveDirection}
                        onChange={(e) => setNewPositiveDirection(e.target.value)}
                        placeholder="e.g., The response directly addresses the user's question, provides actionable steps, and anticipates follow-up needs."
                        className="min-h-[80px] bg-white border-green-200 focus:border-green-400"
                      />
                    </div>
                    <div className="space-y-2">
                      <Label htmlFor="new-negative" className="text-sm font-semibold text-red-700 flex items-center gap-1.5">
                        <AlertCircle className="h-3.5 w-3.5" />
                        Negative Direction
                      </Label>
                      <p className="text-xs text-muted-foreground -mt-1">
                        What does a poor response look like?
                      </p>
                      <Textarea
                        id="new-negative"
                        value={newNegativeDirection}
                        onChange={(e) => setNewNegativeDirection(e.target.value)}
                        placeholder="e.g., The response is vague, off-topic, or fails to address the core question, requiring the user to seek help elsewhere."
                        className="min-h-[80px] bg-white border-red-200 focus:border-red-400"
                      />
                    </div>
                  </div>

                  {/* Examples */}
                  <div className="space-y-2">
                    <Label htmlFor="new-examples" className="text-sm font-semibold text-gray-800 flex items-center gap-1.5">
                      <Lightbulb className="h-3.5 w-3.5 text-amber-500" />
                      Examples
                    </Label>
                    <p className="text-xs text-muted-foreground -mt-1">
                      Provide concrete examples of good and/or bad responses to calibrate annotators.
                    </p>
                    <Textarea
                      id="new-examples"
                      value={newExamples}
                      onChange={(e) => setNewExamples(e.target.value)}
                      placeholder={"Good: \"Here are 3 steps to resolve your issue: 1) ...\"\nBad: \"I'm not sure, maybe try searching online.\""}
                      className="min-h-[80px] bg-white"
                    />
                  </div>

                  {/* Evaluation Type */}
                  <div className="space-y-2">
                    <Label className="text-sm font-semibold text-gray-800">
                      Evaluation Type
                    </Label>
                    <div className="flex gap-2">
                      <Badge 
                        variant={newQuestion.judgeType === 'likert' ? 'default' : 'outline'}
                        className={`cursor-pointer px-4 py-1.5 ${newQuestion.judgeType !== 'likert' ? 'bg-white hover:bg-gray-50' : ''}`}
                        onClick={() => setNewQuestion({ ...newQuestion, judgeType: 'likert' })}
                      >
                        Likert Scale
                      </Badge>
                      <Badge 
                        variant={newQuestion.judgeType === 'binary' ? 'default' : 'outline'}
                        className={`cursor-pointer px-4 py-1.5 ${newQuestion.judgeType !== 'binary' ? 'bg-white hover:bg-gray-50' : ''}`}
                        onClick={() => setNewQuestion({ ...newQuestion, judgeType: 'binary' })}
                      >
                        Binary
                      </Badge>
                      <Badge 
                        variant={newQuestion.judgeType === 'freeform' ? 'default' : 'outline'}
                        className={`cursor-pointer px-4 py-1.5 ${newQuestion.judgeType !== 'freeform' ? 'bg-white hover:bg-gray-50' : ''}`}
                        onClick={() => setNewQuestion({ ...newQuestion, judgeType: 'freeform' })}
                      >
                        Free-form
                      </Badge>
                    </div>
                  </div>

                  {/* Preview */}
                  <div className="bg-gray-50 border rounded-lg p-4">
                    {newQuestion.judgeType === 'likert' && (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-medium text-gray-700">Likert Scale Preview</div>
                          <Badge variant="outline" className="bg-green-50 text-green-700 border-green-200">
                            1-5 Scale
                          </Badge>
                        </div>
                        <div className="grid grid-cols-5 gap-4">
                          {[1, 2, 3, 4, 5].map((value) => {
                            const labels = ['', 'Strongly Disagree', 'Disagree', 'Neutral', 'Agree', 'Strongly Agree'];
                            return (
                              <div key={value} className="flex flex-col items-center gap-2">
                                <div className="w-5 h-5 rounded-full border-2 border-blue-300 bg-white" />
                                <label className="text-xs text-center text-gray-600 leading-tight">{labels[value]}</label>
                              </div>
                            );
                          })}
                        </div>
                      </>
                    )}
                    {newQuestion.judgeType === 'binary' && (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-medium text-gray-700">Binary Choice Preview</div>
                          <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                            {binaryLabels.pass}/{binaryLabels.fail}
                          </Badge>
                        </div>
                        <div className="flex justify-center gap-8">
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-12 h-12 rounded-lg border-2 border-green-400 bg-green-50 flex items-center justify-center">
                              <CheckCircle className="w-6 h-6 text-green-600" />
                            </div>
                            <label className="text-sm font-medium text-green-700">{binaryLabels.pass}</label>
                          </div>
                          <div className="flex flex-col items-center gap-2">
                            <div className="w-12 h-12 rounded-lg border-2 border-red-400 bg-red-50 flex items-center justify-center">
                              <AlertCircle className="w-6 h-6 text-red-600" />
                            </div>
                            <label className="text-sm font-medium text-red-700">{binaryLabels.fail}</label>
                          </div>
                        </div>
                      </>
                    )}
                    {newQuestion.judgeType === 'freeform' && (
                      <>
                        <div className="flex items-center justify-between mb-3">
                          <div className="text-sm font-medium text-gray-700">Free-form Feedback Preview</div>
                          <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                            Open Text
                          </Badge>
                        </div>
                        <div className="border-2 border-dashed border-purple-200 rounded-lg p-4 bg-purple-50/30">
                          <p className="text-sm text-gray-500 italic">
                            Annotators will provide detailed written feedback for this focus area...
                          </p>
                        </div>
                      </>
                    )}
                  </div>
                </div>

                <DialogFooter>
                  <Button
                    variant="outline"
                    onClick={() => {
                      resetDialogFields();
                      setIsAddingQuestion(false);
                    }}
                  >
                    Cancel
                  </Button>
                  {editingQuestionId ? (
                    <Button
                      onClick={() => {
                        if (!canSaveQuestion()) return;
                        const description = buildDescription();
                        // Update the question in local state
                        updateQuestion(editingQuestionId, {
                          title: newQuestion.title,
                          description,
                          judgeType: newQuestion.judgeType,
                        });
                        // Save to server
                        setUpdatingQuestionId(editingQuestionId);
                        fetch(`/workshops/${workshopId}/rubric/questions/${editingQuestionId}`, {
                          method: 'PUT',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({
                            title: newQuestion.title,
                            description,
                            judge_type: newQuestion.judgeType,
                          }),
                        })
                          .then(response => {
                            if (!response.ok) throw new Error('Failed');
                            queryClient.invalidateQueries({ queryKey: ['rubric', workshopId] });
                            toast.success('Criterion updated successfully');
                          })
                          .catch(() => {
                            toast.error('Failed to update criterion. Please try again.');
                          })
                          .finally(() => {
                            setUpdatingQuestionId(null);
                          });
                        resetDialogFields();
                        setIsAddingQuestion(false);
                      }}
                      disabled={!canSaveQuestion() || updatingQuestionId === editingQuestionId}
                      className="flex items-center gap-2"
                    >
                      <Save className="h-4 w-4" />
                      {updatingQuestionId === editingQuestionId ? 'Saving...' : 'Save Changes'}
                    </Button>
                  ) : (
                    <Button
                      onClick={addQuestion}
                      disabled={!canSaveQuestion() || isSavingQuestion}
                      className="flex items-center gap-2"
                    >
                      <Plus className="h-4 w-4" />
                      {isSavingQuestion ? 'Saving...' : 'Add Criterion'}
                    </Button>
                  )}
                </DialogFooter>
              </DialogContent>
            </Dialog>

            {questions.length > 0 && (
              <div className="bg-green-50 border border-green-200 rounded-lg p-4">
                <div className="flex items-center gap-2 mb-2">
                  <ClipboardList className="h-4 w-4 text-green-600" />
                  <span className="font-medium text-green-800">Evaluation Summary</span>
                </div>
                <p className="text-sm text-green-700">
                  {questions.length} criterion{questions.length !== 1 ? 's' : ''} created:
                  {' '}
                  {questions.filter(q => q.judgeType === 'likert').length > 0 && (
                    <Badge variant="outline" className="mr-1 bg-green-100">
                      {questions.filter(q => q.judgeType === 'likert').length} Likert
                    </Badge>
                  )}
                  {questions.filter(q => q.judgeType === 'binary').length > 0 && (
                    <Badge variant="outline" className="mr-1 bg-blue-100">
                      {questions.filter(q => q.judgeType === 'binary').length} Binary
                    </Badge>
                  )}
                  {questions.filter(q => q.judgeType === 'freeform').length > 0 && (
                    <Badge variant="outline" className="mr-1 bg-purple-100">
                      {questions.filter(q => q.judgeType === 'freeform').length} Free-form
                    </Badge>
                  )}
                </p>
              </div>
            )}
            </div>
          </TabsContent>
        </Tabs>

        {/* Next Steps */}
        {rubric && questions.length > 0 ? (
          <Card className="border-l-4 border-green-500 bg-green-50/30">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                <CheckCircle className="h-5 w-5 text-green-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-green-800">
                    Ready for Annotation Phase
                  </p>
                  <p className="text-xs text-green-700">
                    Rubric is complete with {questions.length} criterion{questions.length !== 1 ? 's' : ''}. Use the sidebar to start annotations.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        ) : (
          <Card className="border-l-4 border-amber-500 bg-amber-50/30">
            <CardContent className="py-3 px-4">
              <div className="flex items-center gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-medium text-amber-800">
                    Rubric Required
                  </p>
                  <p className="text-xs text-amber-700">
                    Create at least one rubric question before proceeding to annotation.
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        )}
      </div>

      {/* AI Rubric Suggestion Panel */}
      {showSuggestionPanel && (
        <RubricSuggestionPanel
          workshopId={workshopId!}
          onAcceptSuggestion={async (suggestion) => {
            // Convert suggestion to RubricQuestion format
            const descriptionParts = [suggestion.description];

            if (suggestion.positive) {
              descriptionParts.push(`\nPositive: ${suggestion.positive}`);
            }
            if (suggestion.negative) {
              descriptionParts.push(`\nNegative: ${suggestion.negative}`);
            }
            if (suggestion.examples) {
              descriptionParts.push(`\nExamples: ${suggestion.examples}`);
            }

            const description = descriptionParts.join('');

            // Persist to backend immediately
            setIsEditingExisting(true);

            try {
              const updatedQuestions = [
                ...questions,
                {
                  id: 'temp',
                  title: suggestion.title,
                  description,
                  judgeType: suggestion.judgeType as JudgeType
                }
              ];

              const combinedQuestionText = formatRubricQuestions(updatedQuestions);

              const apiRubric = {
                question: combinedQuestionText,
                created_by: 'facilitator',
                judge_type: judgeType,
                binary_labels: judgeType === 'binary' ? binaryLabels : undefined,
                rating_scale: 5
              };

              const method = rubric ? 'PUT' : 'POST';
              const url = `/workshops/${workshopId}/rubric`;

              const response = await fetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(apiRubric),
              });

              if (!response.ok) throw new Error('Failed to save');

              const savedRubric = await response.json();
              if (savedRubric && savedRubric.id) {
                queryClient.setQueryData(['rubric', workshopId], savedRubric);
                setQuestions(convertApiRubricToQuestions(savedRubric));
              }

              toast.success(`"${suggestion.title}" added to rubric`);
            } catch (error) {
              console.error('Error adding suggestion:', error);
              toast.error('Failed to add suggestion to rubric');
            } finally {
              setIsEditingExisting(false);
            }
          }}
          onClose={() => setShowSuggestionPanel(false)}
        />
      )}
    </div>
  );
}