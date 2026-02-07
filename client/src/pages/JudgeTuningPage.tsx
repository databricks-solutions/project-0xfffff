import React, { useState, useEffect, useMemo, useCallback } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryClient } from '@tanstack/react-query';
import { 
  Brain, 
  Play, 
  Download, 
  AlertCircle, 
  CheckCircle, 
  Clock,
  Zap,
  TestTube,
  Target,
  XCircle,
  Users,
  RefreshCw,
  Loader2,
  Database,
  Cloud,
} from 'lucide-react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useUser, useRoleCheck } from '@/context/UserContext';
import { WorkshopsService } from '@/client';
import { useWorkshop, useOriginalTraces, useAggregateAllFeedback, useFacilitatorAnnotations } from '@/hooks/useWorkshopApi';
import { getModelOptions, getBackendModelName, getFrontendModelName, getDisplayName, MODEL_MAPPING } from '@/utils/modelMapping';
import { parseRubricQuestions } from '@/utils/rubricUtils';
import { Pagination } from '@/components/Pagination';
import { TraceDataViewer } from '@/components/TraceDataViewer';
import { CustomLLMProviderConfig } from '@/components/CustomLLMProviderConfig';
import { toast } from 'sonner';

import type { 
  JudgePrompt, 
  JudgePromptCreate, 
  JudgeEvaluation, 
  JudgePerformanceMetrics,
  JudgeEvaluationResult,
  JudgeExportConfig,
  JudgeType,
  Rubric,
  Annotation,
  Trace
} from '@/client';
import { defaultPromptTemplates } from '@/components/JudgeTypeSelector';

export function JudgeTuningPage() {
  const { workshopId } = useWorkshopContext();
  const { user } = useUser();
  const { isFacilitator } = useRoleCheck();
  const { data: workshop } = useWorkshop(workshopId!);
  const { data: traces } = useOriginalTraces(workshopId!);
  const aggregateAllFeedback = useAggregateAllFeedback(workshopId!);
  const { data: annotations = [], refetch: refetchAnnotations } = useFacilitatorAnnotations(workshopId!);
  const queryClient = useQueryClient();
  
  // State management
  const [prompts, setPrompts] = useState<JudgePrompt[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState<string>('');
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [selectedEvaluationModel, setSelectedEvaluationModel] = useState<string>('Claude Opus 4.5');
  const [selectedAlignmentModel, setSelectedAlignmentModel] = useState<string>('Claude Opus 4.5');
  const [evaluations, setEvaluations] = useState<JudgeEvaluation[]>([]);
  const [metrics, setMetrics] = useState<JudgePerformanceMetrics | null>(null);
  const [rubric, setRubric] = useState<Rubric | null>(null);
  const [mlflowConfig, setMlflowConfig] = useState<any>(null);
  
  // Selected rubric question index for tuning
  const [selectedQuestionIndex, setSelectedQuestionIndex] = useState<number>(0);
  
  // Parse rubric questions
  const parsedRubricQuestions = rubric?.question ? parseRubricQuestions(rubric.question) : [];
  
  // Get currently selected question
  const selectedQuestion = parsedRubricQuestions[selectedQuestionIndex] || parsedRubricQuestions[0];
  
  // Judge type - derived from the selected rubric question
  const judgeType: JudgeType = selectedQuestion?.judgeType || (rubric?.judge_type || 'likert');
  const binaryLabels: Record<string, string> = rubric?.binary_labels || { pass: 'Pass', fail: 'Fail' };
  
  // Track if current prompt differs from saved version
  const [originalPromptText, setOriginalPromptText] = useState<string>('');
  const [isModified, setIsModified] = useState<boolean>(false);
  const [hasEvaluated, setHasEvaluated] = useState<boolean>(false);
  
  // Track expanded rows in evaluation grid
  const [expandedRowId, setExpandedRowId] = useState<string | null>(null);
  
  // Pagination state
  const [currentPage, setCurrentPage] = useState(1);
  const [itemsPerPage, setItemsPerPage] = useState(10);
  
  // Loading states
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  
  // Databricks configuration state
  
  // Alignment + evaluation state
  const [isRunningEvaluation, setIsRunningEvaluation] = useState(false);
  const [isRunningAlignment, setIsRunningAlignment] = useState(false);
  const [evaluationComplete, setEvaluationComplete] = useState(false);
  const [alignmentLogs, setAlignmentLogs] = useState<string[]>([]);
  const [alignmentResult, setAlignmentResult] = useState<any>(null);
  const [showAlignmentLogs, setShowAlignmentLogs] = useState(false);
  
  // Evaluation mode: 'mlflow' or 'simple'
  const [evaluationMode, setEvaluationMode] = useState<'mlflow' | 'simple'>('mlflow');
  const [simpleEndpointName, setSimpleEndpointName] = useState<string>('databricks-claude-sonnet-4-5');
  
  // Auto-evaluation state (runs when annotation begins)
  const [autoEvalStatus, setAutoEvalStatus] = useState<string>('not_started');
  const [autoEvalJobId, setAutoEvalJobId] = useState<string | null>(null);
  const [autoEvalDerivedPrompt, setAutoEvalDerivedPrompt] = useState<string | null>(null);
  const [isPollingAutoEval, setIsPollingAutoEval] = useState(false);

  // Run All Evaluations state
  const [isRunningAllEvaluations, setIsRunningAllEvaluations] = useState(false);
  
  // Judge name derivation logic - based on selected question
  const judgeName = useMemo(() => {
    // Derive from selected rubric question
    if (selectedQuestion?.title) {
      const title = selectedQuestion.title;
      const snakeCase = title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '');
      return `${snakeCase}_judge`;
    }
    
    // If saved name exists and is not default, use it as fallback
    if (workshop?.judge_name && workshop.judge_name !== 'workshop_judge') {
      return workshop.judge_name;
    }
    
    // Fallback to default
    return 'workshop_judge';
  }, [selectedQuestion?.title, workshop?.judge_name]);

  const logsStorageKey = useMemo(
    () => (workshopId ? `judge-alignment-logs-${workshopId}` : 'judge-alignment-logs'),
    [workshopId]
  );

  const updateAlignmentLogs = useCallback(
    (value: string[] | ((prev: string[]) => string[])) => {
      setAlignmentLogs((prev) => {
        const next = typeof value === 'function' ? value(prev) : value;
        try {
          localStorage.setItem(logsStorageKey, JSON.stringify(next));
        } catch (error) {
          // no-op if localStorage unavailable
        }
        return next;
      });
    },
    [logsStorageKey]
  );

  useEffect(() => {
    if (!logsStorageKey) return;
    try {
      const stored = localStorage.getItem(logsStorageKey);
      if (stored) {
        const parsed = JSON.parse(stored);
        if (Array.isArray(parsed)) {
          setAlignmentLogs(parsed);
        } else if (Array.isArray(parsed?.logs)) {
          setAlignmentLogs(parsed.logs);
        }
      }
    } catch (error) {
      // ignore parse errors
    }
  }, [logsStorageKey]);

  const annotatedTraceCount = useMemo(() => {
    if (!annotations?.length) return 0;
    
    // Count traces that have ratings for the selected question
    const traceIds = new Set(
      annotations
        .filter((ann) => {
          // Check if annotation has rating for selected question
          if (selectedQuestion && ann.ratings && typeof ann.ratings === 'object') {
            // Try exact question ID match
            if (ann.ratings[selectedQuestion.id] !== undefined && ann.ratings[selectedQuestion.id] !== null) {
              return true;
            }
            // Try index-based key format
            const indexBasedKey = Object.keys(ann.ratings).find(k => k.endsWith(`_${selectedQuestionIndex}`));
            if (indexBasedKey && ann.ratings[indexBasedKey] !== undefined && ann.ratings[indexBasedKey] !== null) {
              return true;
            }
          }
          // Fallback to legacy rating for first question only
          if (selectedQuestionIndex === 0 && ann.rating !== null && ann.rating !== undefined) {
            return true;
          }
          return false;
        })
        .map((ann) => ann.trace_id)
    );
    return traceIds.size;
  }, [annotations, selectedQuestion, selectedQuestionIndex]);

  const ensurePromptHasPlaceholders = (prompt: string) => {
    let normalized = prompt || '';
    const hasInput = /{input}|{{\s*inputs\s*}}/i.test(normalized);
    const hasOutput = /{output}|{{\s*outputs\s*}}/i.test(normalized);
    if (!hasInput) {
      normalized += `${normalized.trim().length ? '\n\n' : ''}Input: {input}`;
    }
    if (!hasOutput) {
      normalized += `\nOutput: {output}`;
    }
    return normalized;
  };

  // Track previous question index to detect actual changes (not initial mount)
  const prevQuestionIndexRef = React.useRef<number | null>(null);
  
  // Reset prompt when switching questions (not on initial mount)
  useEffect(() => {
    // Skip on initial mount
    if (prevQuestionIndexRef.current === null) {
      prevQuestionIndexRef.current = selectedQuestionIndex;
      return;
    }
    
    // Only reset if question actually changed
    if (prevQuestionIndexRef.current !== selectedQuestionIndex && selectedQuestion) {
      const questionJudgeType = selectedQuestion.judgeType || 'likert';
      const template = defaultPromptTemplates[questionJudgeType];
      
      let customizedTemplate = template;
      // Combine title and description for the rubric content
      const rubricContent = selectedQuestion.title && selectedQuestion.description
        ? `**${selectedQuestion.title}**\n${selectedQuestion.description}`
        : selectedQuestion.description || selectedQuestion.title || '';
      if (rubricContent) {
        customizedTemplate = template
          .replace('{rubric}', rubricContent)
          .replace('{criteria}', rubricContent)
          .replace('{focus}', rubricContent);
      }
      
      setCurrentPrompt(customizedTemplate);
      setOriginalPromptText(customizedTemplate);
      setSelectedPromptId(null);
      
      // Load saved evaluations for this specific question if available
      if (workshopId) {
        const questionKey = `judge-evaluations-${workshopId}-q${selectedQuestionIndex}`;
        const storedData = localStorage.getItem(questionKey);
        if (storedData) {
          try {
            const parsed = JSON.parse(storedData);
            // Only load if data is less than 24 hours old
            if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
              setEvaluations(parsed.evaluations || []);
              setMetrics(parsed.metrics || null);
              setHasEvaluated(parsed.evaluations && parsed.evaluations.length > 0);
              setEvaluationComplete(parsed.evaluations && parsed.evaluations.length >= 10);
              prevQuestionIndexRef.current = selectedQuestionIndex;
              return; // Don't reset - we loaded saved data
            }
          } catch (error) {
            // Failed to load saved evaluations
          }
        }
      }
      
      // No saved data - reset evaluation state for manual evaluations
      // But preserve auto-evaluation results (they're global, not per-question)
      setHasEvaluated(false);
      setEvaluationComplete(false);
      setMetrics(null);
      // Don't clear evaluations here - auto-eval results should persist across question switches
      // setEvaluations([]);
      
      prevQuestionIndexRef.current = selectedQuestionIndex;
    }
  }, [selectedQuestionIndex, selectedQuestion, workshopId]);

  // Load initial data
  useEffect(() => {
    if (workshopId) {
      loadInitialData();
    }
  }, [workshopId]);

  // NOTE: Auto-evaluation results are fetched at the end of loadInitialData()
  // to avoid race conditions. See the fetchAutoEvalResults() call there.

  // Poll for auto-evaluation completion
  useEffect(() => {
    if (!workshopId || !isPollingAutoEval || autoEvalStatus !== 'running') {
      return;
    }
    
    const pollInterval = setInterval(async () => {
      try {
        const response = await fetch(`/workshops/${workshopId}/auto-evaluation-status`);
        if (response.ok) {
          const data = await response.json();
          setAutoEvalStatus(data.status);
          
          // Add logs to alignment logs
          if (data.logs && data.logs.length > 0) {
            updateAlignmentLogs(prev => {
              const newLogs = data.logs.filter((log: string) => !prev.includes(log));
              return [...prev, ...newLogs];
            });
          }
          
          if (data.status === 'completed') {
            setIsPollingAutoEval(false);
            setIsRunningEvaluation(false);  // Stop the spinner
            // Fetch results
            const resultsResponse = await fetch(`/workshops/${workshopId}/auto-evaluation-results`);
            if (resultsResponse.ok) {
              const resultsData = await resultsResponse.json();
              if (resultsData.evaluations && resultsData.evaluations.length > 0) {
                const evalResults = resultsData.evaluations.map((e: any) => ({
                  id: e.trace_id,
                  trace_id: e.trace_id,
                  mlflow_trace_id: e.mlflow_trace_id,
                  predicted_rating: e.predicted_rating,
                  human_rating: e.human_rating,
                  confidence: e.confidence,
                  reasoning: e.reasoning,
                  predicted_feedback: e.judge_name || '',
                }));
                setEvaluations(evalResults);
                setHasEvaluated(true);
                setEvaluationComplete(evalResults.length >= 10);
                if (resultsData.metrics) {
                  setMetrics(resultsData.metrics);
                }
                // Persist to localStorage so evaluations survive page navigation
                try {
                  const storageKey = `judge-evaluations-${workshopId}-q${selectedQuestionIndex}`;
                  localStorage.setItem(storageKey, JSON.stringify({
                    evaluations: evalResults,
                    metrics: resultsData.metrics || null,
                    timestamp: Date.now(),
                  }));
                } catch (_) { /* localStorage unavailable */ }
                toast.success('Auto-evaluation complete! LLM judge scores are now available.');
              }
            }
          } else if (data.status === 'failed') {
            setIsPollingAutoEval(false);
            setIsRunningEvaluation(false);  // Stop the spinner
            toast.error('Auto-evaluation failed. You can try re-evaluating manually.');
          }
        }
      } catch (error) {
        console.error('Failed to poll auto-evaluation status:', error);
      }
    }, 3000); // Poll every 3 seconds
    
    return () => clearInterval(pollInterval);
  }, [workshopId, isPollingAutoEval, autoEvalStatus, updateAlignmentLogs]);

  // Load saved evaluations for the current question on mount and when question changes
  useEffect(() => {
    if (workshopId && selectedQuestionIndex !== undefined) {
      const questionKey = `judge-evaluations-${workshopId}-q${selectedQuestionIndex}`;
      const storedData = localStorage.getItem(questionKey);
      if (storedData) {
        try {
          const parsed = JSON.parse(storedData);
          // Only load if data is less than 24 hours old
          if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
            setEvaluations(parsed.evaluations || []);
            setMetrics(parsed.metrics || null);
            setHasEvaluated(parsed.evaluations && parsed.evaluations.length > 0);
            setEvaluationComplete(parsed.evaluations && parsed.evaluations.length >= 10);
          }
        } catch (error) {
          // Failed to load saved evaluations
        }
      }
    }
  }, [workshopId]); // Only run on mount, not on question change (that's handled by the other useEffect)

  // Refetch annotations when page becomes visible (user navigates back)
  useEffect(() => {
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible' && workshopId) {
        refetchAnnotations();
      }
    };
    
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [workshopId, refetchAnnotations]);

  // Track if current prompt text differs from original
  useEffect(() => {
    const modified = currentPrompt !== originalPromptText;
    setIsModified(modified);
    // Reset evaluation state when prompt changes
    if (modified) {
      setHasEvaluated(false);
      setEvaluationComplete(false);
      setAlignmentResult(null);
    }
  }, [currentPrompt, originalPromptText]);
  
  // Databricks config is now sourced solely from Intake phase (mlflowConfig)

  // Derived list: only traces that actually have human annotations (responses)
  const annotatedTraces = useMemo(() => {
    if (!traces || !annotations.length) return [];
    const annotatedTraceIds = new Set(
      annotations
        .filter((ann) => {
          // Check legacy rating field
          if (ann.rating !== undefined && ann.rating !== null) return true;
          // Check new ratings dict - has at least one rating value
          if (ann.ratings && typeof ann.ratings === 'object' && Object.keys(ann.ratings).length > 0) {
            return Object.values(ann.ratings).some(v => v !== undefined && v !== null);
          }
          return false;
        })
        .map((ann) => ann.trace_id)
    );
    return traces.filter((trace: Trace) => annotatedTraceIds.has(trace.id));
  }, [traces, annotations]);

  // Reset pagination when traces change
  useEffect(() => {
    if (annotatedTraces && annotatedTraces.length > 0) {
      setCurrentPage(1);
    }
  }, [annotatedTraces]);

  // Reset expanded row when changing pages
  useEffect(() => {
    setExpandedRowId(null);
  }, [currentPage]);

  const loadInitialData = async () => {
    if (!workshopId) return;
    
    // Force refresh of workshop data to get latest judge name
    queryClient.invalidateQueries({ queryKey: ['workshop', workshopId] });
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Load all required data in parallel, handling errors gracefully
      // Note: annotations are now loaded via useFacilitatorAnnotations hook and will auto-refresh
      const [promptsData, rubricData, mlflowConfigData] = await Promise.all([
        WorkshopsService.getJudgePromptsWorkshopsWorkshopIdJudgePromptsGet(workshopId)
          .catch((err) => {
            return []; // Return empty array on error
          }),
        WorkshopsService.getRubricWorkshopsWorkshopIdRubricGet(workshopId).catch((err) => {
          return null;
        }),
        WorkshopsService.getMlflowConfigWorkshopsWorkshopIdMlflowConfigGet(workshopId).catch((err) => {
          return null;
        })
      ]);

      setPrompts(promptsData);
      setRubric(rubricData);
      setMlflowConfig(mlflowConfigData);
      
      // Refetch annotations to ensure we have the latest data
      refetchAnnotations();

      // Determine default model first (used in multiple places)
      const modelOptions = getModelOptions(!!mlflowConfigData);
      const defaultModel = modelOptions.find(opt => !opt.disabled)?.value || modelOptions[0]?.value || 'Claude Opus 4.5';
      
      // Initialize with rubric question if no prompts exist
      if (promptsData.length === 0 && rubricData) {
        const defaultPrompt = createDefaultPrompt(rubricData.question, selectedQuestionIndex);
        setCurrentPrompt(defaultPrompt);
        setOriginalPromptText(defaultPrompt); // Track original for new prompt
        
        // Set default models when no prompts exist
        setSelectedEvaluationModel(defaultModel);
        setSelectedAlignmentModel(defaultModel);
        
        // Don't auto-create baseline - let user create it manually
        // This prevents the v2 issue where auto-creation makes first manual save become v2
      } else if (promptsData.length > 0) {
        // Select the latest prompt (first in array since ordered by version desc)
        const latestPrompt = promptsData[0];
        
        // Check if prompt judge_type matches current rubric question's judge_type
        // If rubric changed (e.g., from Likert to Binary), update prompt template
        const parsedQuestions = parseRubricQuestions(rubricData?.question || '');
        const selectedQ = parsedQuestions[selectedQuestionIndex] || parsedQuestions[0];
        const currentRubricJudgeType = selectedQ?.judgeType || (rubricData?.judge_type || 'likert');
        
        // Check both the metadata judge_type AND the actual prompt content
        const promptMetadataJudgeType = latestPrompt.judge_type || 'likert';
        const promptContentJudgeType = detectPromptJudgeType(latestPrompt.prompt_text);
        
        // If rubric judge type doesn't match EITHER the metadata OR the actual content, regenerate
        const needsRegeneration = rubricData && (
          currentRubricJudgeType !== promptMetadataJudgeType || 
          currentRubricJudgeType !== promptContentJudgeType
        );
        
        if (needsRegeneration) {
          const updatedPrompt = createDefaultPrompt(rubricData.question, selectedQuestionIndex);
          setCurrentPrompt(updatedPrompt);
          setOriginalPromptText(updatedPrompt);
          // Mark as modified so user knows it needs to be saved
          setIsModified(true);
        } else {
          setCurrentPrompt(latestPrompt.prompt_text);
          setOriginalPromptText(latestPrompt.prompt_text); // Track original for modification detection
        }
        
        setSelectedPromptId(latestPrompt.id);
        
        // Sync model selection with saved prompt
        if (latestPrompt.model_name) {
          const frontendModel = getFrontendModelName(latestPrompt.model_name);
          // Validate that the model is actually in our dropdown options
          const isValidOption = modelOptions.some(opt => opt.value === frontendModel);
          
          if (isValidOption) {
            setSelectedEvaluationModel(frontendModel);
            setSelectedAlignmentModel(frontendModel);
          } else {
            // Fall back to default if saved model isn't recognized (e.g., 'demo')
            setSelectedEvaluationModel(defaultModel);
            setSelectedAlignmentModel(defaultModel);
          }
        } else {
          // No model saved - use default
          setSelectedEvaluationModel(defaultModel);
          setSelectedAlignmentModel(defaultModel);
        }
        
        // Don't auto-load metrics from saved prompts - only show metrics after running evaluation
        // This prevents showing stale metrics with "Mode" badge before user runs evaluation
        // if (latestPrompt.performance_metrics) {
        //   setMetrics(latestPrompt.performance_metrics as JudgePerformanceMetrics);
        // }

      }

      // Fetch auto-evaluation results as the LAST step, after all other state is set.
      // This must happen after rubric/prompts are loaded to avoid race conditions where
      // other state updates could overwrite evaluation results.
      try {
        const autoEvalResponse = await fetch(`/workshops/${workshopId}/auto-evaluation-results`);
        if (autoEvalResponse.ok) {
          const autoEvalData = await autoEvalResponse.json();
          if (autoEvalData.status) {
            setAutoEvalStatus(autoEvalData.status);
          }
          if (autoEvalData.job_id) {
            setAutoEvalJobId(autoEvalData.job_id);
          }
          if (autoEvalData.derived_prompt) {
            setAutoEvalDerivedPrompt(autoEvalData.derived_prompt);
          }

          if (autoEvalData.evaluations && autoEvalData.evaluations.length > 0) {
            const evalResults = autoEvalData.evaluations.map((e: any) => ({
              id: e.trace_id,
              trace_id: e.trace_id,
              mlflow_trace_id: e.mlflow_trace_id,
              predicted_rating: e.predicted_rating,
              human_rating: e.human_rating,
              confidence: e.confidence,
              reasoning: e.reasoning,
              predicted_feedback: e.judge_name || '',
            }));
            setEvaluations(evalResults);
            setHasEvaluated(true);
            setEvaluationComplete(evalResults.length >= 10);

            if (autoEvalData.metrics) {
              setMetrics(autoEvalData.metrics);
            }

            // Cache to localStorage so evaluations survive page navigation
            try {
              const storageKey = `judge-evaluations-${workshopId}-q0`;
              localStorage.setItem(storageKey, JSON.stringify({
                evaluations: evalResults,
                metrics: autoEvalData.metrics || null,
                timestamp: Date.now(),
              }));
            } catch (_) { /* localStorage unavailable */ }
          }

          // If auto-eval is currently running, start polling
          if (autoEvalData.status === 'running') {
            setIsPollingAutoEval(true);
          }
        }
      } catch (autoEvalErr) {
        console.error('[AutoEval] Failed to fetch auto-evaluation results:', autoEvalErr);
      }

    } catch (err: any) {
      // Don't set error that blocks UI, silent fail
    } finally {
      setIsLoading(false);
    }
  };

  // Helper to detect judge type from prompt content
  const detectPromptJudgeType = (promptText: string): JudgeType => {
    if (promptText.includes('scale of 0-1') || promptText.includes('0 or 1') || promptText.includes('(PASS)') || promptText.includes('(FAIL)')) {
      return 'binary';
    }
    if (promptText.includes('scale of 1-5') || promptText.includes('1 = Poor') || promptText.includes('5 = Excellent')) {
      return 'likert';
    }
    if (promptText.includes('qualitative feedback') || promptText.includes('detailed feedback') || promptText.includes('Key observations')) {
      return 'freeform';
    }
    return 'likert'; // default
  };

  const createDefaultPrompt = (rubricQuestion: string, questionIndex: number = 0) => {
    // Parse the rubric to get clean question text (removes |||JUDGE_TYPE||| and |||QUESTION_SEPARATOR||| metadata)
    const parsedQuestions = parseRubricQuestions(rubricQuestion);
    const targetQuestion = parsedQuestions[questionIndex] || parsedQuestions[0];
    const questionText = targetQuestion 
      ? `${targetQuestion.title}: ${targetQuestion.description}` 
      : rubricQuestion;
    const judgeType = targetQuestion?.judgeType || 'likert';
    
    // Return different prompt templates based on judge type
    // NOTE: Do NOT add custom output format instructions - MLflow InstructionsJudge
    // expects JSON output with "result" and "rationale" fields, handled automatically
    if (judgeType === 'binary') {
      return `You are an expert evaluator. Please evaluate the following response based on this criteria: "${questionText}"

Rate the response as either:
- 0: The response does not meet the criteria (FAIL)
- 1: The response meets the criteria (PASS)

Input: {{ inputs }}
Output: {{ outputs }}

Think step by step about whether the output meets the criteria, then provide your rating with reasoning.`;
    }

    if (judgeType === 'freeform') {
      return `You are an expert evaluator. Please evaluate the following response based on this criteria: "${questionText}"

Provide detailed qualitative feedback on how well the response addresses this criteria.

Input: {{ inputs }}
Output: {{ outputs }}

Think step by step about the strengths and weaknesses of the output with respect to the criteria.

Provide your analysis covering:
1. Key observations
2. Strengths
3. Areas for improvement
4. Overall assessment`;
    }

    // Default: Likert scale (1-5)
    return `You are an expert evaluator. Please evaluate the following response based on this criteria: "${questionText}"

Rate the response on a scale of 1-5, where:
- 1 = Poor (does not meet criteria)
- 2 = Below Average (partially meets criteria)
- 3 = Average (meets basic criteria)
- 4 = Good (exceeds criteria in some ways)
- 5 = Excellent (fully exceeds criteria)

Input: {{ inputs }}
Output: {{ outputs }}

Think step by step about how well the output addresses the criteria, then provide your rating with reasoning.`;
  };

  const createAndEvaluateBaselinePrompt = async (promptText: string) => {
    if (!workshopId) return;

    setIsLoading(true);
    try {
      // Create baseline prompt
      const promptData: JudgePromptCreate = {
        prompt_text: promptText,
        few_shot_examples: []
      };

      const newPrompt = await WorkshopsService.createJudgePromptWorkshopsWorkshopIdJudgePromptsPost(
        workshopId,
        promptData
      );

      setPrompts([newPrompt]);
      setSelectedPromptId(newPrompt.id);

      // Auto-evaluate baseline
      const evaluationRequest = {
        prompt_id: newPrompt.id,
        trace_ids: undefined, // Evaluate all traces
        override_model: 'demo' // Always use demo for baseline
      };

      const [metricsResult, evaluationsResult] = await Promise.all([
        WorkshopsService.evaluateJudgePromptWorkshopsWorkshopIdEvaluateJudgePost(
          workshopId,
          evaluationRequest
        ),
        WorkshopsService.getJudgeEvaluationsWorkshopsWorkshopIdJudgeEvaluationsPromptIdGet(
          workshopId,
          newPrompt.id
        )
      ]);

      setMetrics(metricsResult);
      setEvaluations(evaluationsResult);

      // Refresh prompts to get updated performance metrics
      const updatedPrompts = await WorkshopsService.getJudgePromptsWorkshopsWorkshopIdJudgePromptsGet(workshopId);
      setPrompts(updatedPrompts);

    } catch (err: any) {
      setError(err.message || 'Failed to create baseline prompt');
    } finally {
      setIsLoading(false);
    }
  };

  const loadEvaluations = async (promptId: string) => {
    if (!workshopId) return;

    try {
      const evaluationsResult = await WorkshopsService.getJudgeEvaluationsWorkshopsWorkshopIdJudgeEvaluationsPromptIdGet(
        workshopId,
        promptId
      );
      setEvaluations(evaluationsResult);
      
      // If we loaded evaluations from the DB, mark evaluation as complete
      // This enables the Align button when returning to the page
      if (evaluationsResult && evaluationsResult.length > 0) {
        setHasEvaluated(true);
        if (evaluationsResult.length >= 10) {
          setEvaluationComplete(true);
        }
      }
      
      // Don't auto-load metrics from saved prompts when switching versions
      // Metrics should only show after running evaluation in current session
      // const prompt = prompts.find(p => p.id === promptId);
      // if (prompt?.performance_metrics) {
      //   setMetrics(prompt.performance_metrics as JudgePerformanceMetrics);
      // }
    } catch (err) {
      // Silent fail for evaluation loading
    }
  };

  const handleSavePrompt = async () => {
    if (!workshopId || !currentPrompt.trim()) return;

    setIsLoading(true);
    setError(null);

    try {
      const promptData: JudgePromptCreate = {
        prompt_text: currentPrompt,
        judge_type: judgeType, // Include judge type to ensure correct template association
        few_shot_examples: [],
        model_name: getBackendModelName(selectedEvaluationModel),
        model_parameters: selectedEvaluationModel === 'demo' ? null : { temperature: 0.0, max_tokens: 10 }
      };

      const newPrompt = await WorkshopsService.createJudgePromptWorkshopsWorkshopIdJudgePromptsPost(
        workshopId,
        promptData
      );

      // If we have current metrics, save them to the database
      if (metrics) {
        try {
          const response = await fetch(`/workshops/${workshopId}/judge-prompts/${newPrompt.id}/metrics`, {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              correlation: metrics.correlation,
              accuracy: metrics.accuracy,
              mean_absolute_error: 0,  // Deprecated, kept for backwards compatibility
              total_evaluations: metrics.total_evaluations,
              agreement_by_rating: metrics.agreement_by_rating,
              confusion_matrix: metrics.confusion_matrix
            })
          });
          
          if (!response.ok) {
            const errorText = await response.text();
            throw new Error(`HTTP ${response.status}: ${errorText}`);
          }
          
          const result = await response.json();
        } catch (metricsErr) {
          // Don't fail the whole save operation if metrics save fails
        }
      }

      // If we have evaluations in state, save them to the database
      if (evaluations && evaluations.length > 0) {
        try {
          // Save evaluations using the bulk endpoint
          const response = await fetch(`/workshops/${workshopId}/judge-evaluations/${newPrompt.id}`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(evaluations.map(e => ({
              prompt_id: newPrompt.id,
              trace_id: e.trace_id,
              predicted_rating: e.predicted_rating,
              human_rating: e.human_rating,
              confidence: e.confidence,
              reasoning: e.reasoning
            })))
          });
          
          if (!response.ok) {
            const errorText = await response.text();
          } else {
            const result = await response.json();
          }
        } catch (evalErr) {
          // Don't fail the whole save operation if evaluations save fails
        }
      }
      
      // Refresh prompts from database to get the updated metrics
      const updatedPrompts = await WorkshopsService.getJudgePromptsWorkshopsWorkshopIdJudgePromptsGet(workshopId);
      setPrompts(updatedPrompts);
      
      setSelectedPromptId(newPrompt.id);
      setOriginalPromptText(currentPrompt); // Reset modification tracking
      setHasEvaluated(false); // Reset evaluation state after saving
      
      toast.success(`Prompt saved as v${newPrompt.version}`);

    } catch (err: any) {
      setError(err.message || 'Failed to save prompt');
      toast.error('Failed to save prompt: ' + (err.message || 'Unknown error'));
    } finally {
      setIsLoading(false);
    }
  };

  const handleDownloadPrompt = () => {
    if (!currentPrompt.trim()) return;
    
    const promptData = {
      prompt_text: currentPrompt,
      model_name: getBackendModelName(selectedEvaluationModel),
      model_parameters: selectedEvaluationModel === 'demo' ? null : { temperature: 0.0, max_tokens: 10 },
      exported_at: new Date().toISOString(),
      workshop_id: workshopId,
      metrics: metrics || null,
    };
    
    const blob = new Blob([JSON.stringify(promptData, null, 2)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `judge-prompt-${workshopId}-${Date.now()}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
    
    toast.success('Prompt downloaded successfully');
  };

  const handleResetToDefaultTemplate = () => {
    if (!rubric?.question) {
      toast.error('No rubric question available');
      return;
    }
    const defaultPrompt = createDefaultPrompt(rubric.question, selectedQuestionIndex);
    setCurrentPrompt(defaultPrompt);
    setIsModified(true);
    toast.success(`Prompt reset to ${judgeType === 'likert' ? 'Likert (1-5)' : judgeType === 'binary' ? 'Binary (0-1)' : 'Free-form'} template for "${selectedQuestion?.title}"`);
  };

  const handleEvaluatePrompt = async () => {
    if (!workshopId || !currentPrompt.trim()) {
      toast.error('Please enter a judge prompt first');
      return;
    }

    if (!judgeName.trim()) {
      toast.error('Please enter a judge name');
      return;
    }

    // For simple mode, we still need Databricks config (host + token) but not MLflow
    if (evaluationMode === 'mlflow' && !mlflowConfig) {
      const message = 'Databricks configuration required for MLflow evaluation. Please configure MLflow settings in the Intake phase.';
      setEvaluationError(message);
      toast.error(message);
      return;
    }
    
    // For simple mode, check endpoint name
    if (evaluationMode === 'simple' && !simpleEndpointName.trim()) {
      toast.error('Please enter a Databricks model serving endpoint name');
      return;
    }

    // Refresh annotations to ensure we have the latest data before evaluation
    await refetchAnnotations();

    setIsRunningEvaluation(true);
    setEvaluationError(null);
    updateAlignmentLogs([`Starting ${evaluationMode === 'simple' ? 'simple model serving' : 'MLflow'} evaluation job...`]);
    setShowAlignmentLogs(true);
    setAlignmentResult(null);
    setEvaluationComplete(false);
    setMetrics(null);
    setEvaluations([]);
    const normalizedPrompt = ensurePromptHasPlaceholders(currentPrompt);

    // Only aggregate feedback for MLflow mode
    if (evaluationMode === 'mlflow') {
      try {
        toast.info('Aggregating SME feedback...');
        await aggregateAllFeedback.mutateAsync();
      } catch (err: any) {
        const message = err?.message || 'Failed to aggregate SME feedback';
        toast.error(message);
        setEvaluationError(message);
        setIsRunningEvaluation(false);
        return;
      }
    }

    try {
      // Choose endpoint based on evaluation mode
      const endpoint = evaluationMode === 'simple' 
        ? `/workshops/${workshopId}/start-simple-evaluation`
        : `/workshops/${workshopId}/start-evaluation`;
      
      const requestBody = evaluationMode === 'simple'
        ? {
            judge_prompt: normalizedPrompt,
            endpoint_name: simpleEndpointName,
            judge_name: judgeName,  // Include judge name for MLflow sync
            prompt_id: selectedPromptId || undefined,
            judge_type: judgeType, // Pass the selected question's judge type
          }
        : {
            judge_name: judgeName,
            judge_prompt: normalizedPrompt,
            evaluation_model_name: getBackendModelName(selectedEvaluationModel),
            alignment_model_name: getBackendModelName(selectedAlignmentModel),
            prompt_id: selectedPromptId || undefined,
            judge_type: judgeType, // Pass the selected question's judge type
          };

      const startResponse = await fetch(endpoint, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!startResponse.ok) {
        const errorText = await startResponse.text();
        throw new Error(`Failed to start evaluation: ${startResponse.status} ${errorText}`);
      }

      const { job_id } = await startResponse.json();
      updateAlignmentLogs(prev => [...prev, `Evaluation job started (ID: ${job_id.substring(0, 8)}...)`]);

      // Step 2: Poll for status updates
      let logIndex = 0;
      let pollCount = 0;
      const maxPolls = 600; // 10 minutes at 1 poll/second
      
      const poll = async (): Promise<void> => {
        pollCount++;
        
        try {
          const statusResponse = await fetch(
            `/workshops/${workshopId}/evaluation-job/${job_id}?since_log_index=${logIndex}`
          );
          
          if (!statusResponse.ok) {
            console.error('[EVAL] Status poll failed:', statusResponse.status);
            return;
          }
          
          const status = await statusResponse.json();
          
          // Add new logs
          if (status.logs && status.logs.length > 0) {
            updateAlignmentLogs(prev => [...prev, ...status.logs]);
            logIndex = status.log_count;
          }
          
          // Check if job is complete
          if (status.status === 'completed') {
            if (status.result?.success) {
              setMetrics(status.result.metrics || null);
              setEvaluations(status.result.evaluations || []);
              setHasEvaluated(true);
              setEvaluationComplete(true);
              toast.success('Evaluation complete!');
              
              // If backend saved it as a version, update our state to reflect that
              if (status.result.saved_prompt_id) {
                const updatedPrompts = await WorkshopsService.getJudgePromptsWorkshopsWorkshopIdJudgePromptsGet(workshopId);
                setPrompts(updatedPrompts);
                setSelectedPromptId(status.result.saved_prompt_id);
                setOriginalPromptText(currentPrompt); // It's now saved, so not modified
                setIsModified(false);
                
                // Note: We already have evaluations from status.result.evaluations
                // Don't reload from DB immediately as it may not be committed yet
                // The evaluations will be loaded correctly on page refresh if needed
              }

              // Save evaluations with question-specific key so they persist when switching judges
              const storageKey = `judge-evaluations-${workshopId}-q${selectedQuestionIndex}`;
              localStorage.setItem(storageKey, JSON.stringify({
                evaluations: status.result.evaluations || [],
                metrics: status.result.metrics || null,
                timestamp: Date.now(),
              }));
            }
            setIsRunningEvaluation(false);
            return;
          }
          
          if (status.status === 'failed') {
            console.error('[EVAL] Job failed:', status.error);
            toast.error(`Evaluation failed: ${status.error || 'Unknown error'}`);
            setEvaluationError(status.error || 'Unknown error');
            updateAlignmentLogs(prev => [...prev, `ERROR: ${status.error || 'Unknown error'}`]);
            setIsRunningEvaluation(false);
            return;
          }
          
          // Continue polling if still running
          if (status.status === 'running' && pollCount < maxPolls) {
            // Poll every 2 seconds
            setTimeout(poll, 2000);
          } else if (pollCount >= maxPolls) {
            console.warn('[EVAL] Max poll count reached');
            updateAlignmentLogs(prev => [...prev, 'Warning: Polling timeout reached. Job may still be running.']);
            setIsRunningEvaluation(false);
              }
        } catch (pollError) {
          console.error('[EVAL] Poll error:', pollError);
          // On error, try again after a delay
          if (pollCount < maxPolls) {
            setTimeout(poll, 5000);
          }
        }
      };

      // Start polling
      await poll();
      
    } catch (error: any) {
      console.error('[EVAL] Exception caught:', error);
      const message = error?.message || 'Evaluation failed';
      toast.error(`Evaluation failed: ${message}`);
      updateAlignmentLogs(prev => [...prev, `ERROR: ${message}`]);
      setEvaluationError(message);
      setIsRunningEvaluation(false);
    }
  };

  // Re-evaluate handler - calls the /re-evaluate endpoint
  const handleReEvaluate = async () => {
    if (!workshopId) {
      toast.error('Workshop not found');
      return;
    }

    // Use current prompt if modified, otherwise use derived prompt
    const promptToUse = currentPrompt.trim() || autoEvalDerivedPrompt;
    if (!promptToUse) {
      toast.error('No judge prompt available. Please enter a prompt.');
      return;
    }

    setIsRunningEvaluation(true);
    setEvaluationError(null);
    updateAlignmentLogs([`Starting re-evaluation...`]);
    setShowAlignmentLogs(true);

    try {
      // Don't pass evaluation_model_name - backend will use the original model from auto-evaluation
      const response = await fetch(`/workshops/${workshopId}/re-evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          judge_prompt: promptToUse,
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to start re-evaluation: ${response.status} ${errorText}`);
      }

      const { job_id } = await response.json();
      setAutoEvalJobId(job_id);
      setAutoEvalStatus('running');
      setIsPollingAutoEval(true);
      toast.info('Re-evaluation started. Polling for results...');

    } catch (error: any) {
      console.error('[RE-EVAL] Exception caught:', error);
      const message = error?.message || 'Re-evaluation failed';
      toast.error(`Re-evaluation failed: ${message}`);
      updateAlignmentLogs(prev => [...prev, `ERROR: ${message}`]);
      setEvaluationError(message);
      setIsRunningEvaluation(false);
    }
  };

  // Run Evaluation handler - runs evaluation for the CURRENT judge/prompt
  const handleRunCurrentEvaluation = async () => {
    if (!workshopId) {
      toast.error('Workshop not found');
      return;
    }

    if (!currentPrompt.trim()) {
      toast.error('Please enter a judge prompt first');
      return;
    }

    if (!judgeName.trim()) {
      toast.error('Judge name is required');
      return;
    }

    setIsRunningAllEvaluations(true);
    setEvaluationError(null);
    updateAlignmentLogs([`Starting evaluation for judge: ${judgeName}...`]);
    setShowAlignmentLogs(true);

    try {
      const response = await fetch(`/workshops/${workshopId}/re-evaluate`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          judge_prompt: currentPrompt.trim(),
          judge_name: judgeName,
          judge_type: judgeType,
          evaluation_model_name: getBackendModelName(selectedEvaluationModel),
        }),
      });

      if (!response.ok) {
        const errorText = await response.text();
        throw new Error(`Failed to start evaluation: ${response.status} ${errorText}`);
      }

      const { job_id } = await response.json();

      setAutoEvalJobId(job_id);
      setAutoEvalStatus('running');
      setIsPollingAutoEval(true);

      updateAlignmentLogs(prev => [...prev, `Evaluation job started: ${job_id}`]);
      toast.success(`Started evaluation for ${judgeName}`);

    } catch (error: any) {
      console.error('[RUN-EVAL] Exception caught:', error);
      const message = error?.message || 'Evaluation failed';
      toast.error(`Evaluation failed: ${message}`);
      updateAlignmentLogs(prev => [...prev, `ERROR: ${message}`]);
      setEvaluationError(message);
    } finally {
      setIsRunningAllEvaluations(false);
    }
  };

  const handleRunAlignment = async () => {

    // Validation
    if (!workshopId || !currentPrompt.trim()) {
      toast.error('Please enter a judge prompt first');
      return;
    }
    if (!judgeName.trim()) {
      toast.error('Please enter a judge name');
      return;
    }
    if (!mlflowConfig) {
      toast.error('Databricks configuration required for alignment');
      return;
    }
    if (annotatedTraceCount < 10) {
      toast.error(`Need at least 10 human-annotated traces for alignment (${annotatedTraceCount}/10)`);
      return;
    }
    // Check if auto-evaluation has already completed before triggering it again
    // First, check the server status to see if auto-eval results exist
    let needsAutoEval = evaluations.length < annotatedTraceCount && autoEvalStatus !== 'completed';

    if (needsAutoEval) {
      // Double-check by fetching current status from server
      try {
        const statusCheck = await fetch(`/workshops/${workshopId}/auto-evaluation-status`);
        if (statusCheck.ok) {
          const statusData = await statusCheck.json();
          if (statusData.status === 'completed') {
            // Auto-eval already done, just fetch the results
            const resultsResponse = await fetch(`/workshops/${workshopId}/auto-evaluation-results`);
            if (resultsResponse.ok) {
              const resultsData = await resultsResponse.json();
              if (resultsData.evaluations && resultsData.evaluations.length > 0) {
                const evalResults = resultsData.evaluations.map((e: any) => ({
                  id: e.trace_id,
                  trace_id: e.trace_id,
                  mlflow_trace_id: e.mlflow_trace_id,
                  predicted_rating: e.predicted_rating,
                  human_rating: e.human_rating,
                  confidence: e.confidence,
                  reasoning: e.reasoning,
                  predicted_feedback: e.judge_name || '',
                }));
                setEvaluations(evalResults);
                setAutoEvalStatus('completed');
                needsAutoEval = false;
              }
            }
          }
        }
      } catch (checkErr) {
        console.warn('[ALIGN] Could not check auto-eval status:', checkErr);
      }
    }

    // Only trigger auto-evaluation if it hasn't run yet
    if (needsAutoEval) {
      setIsRunningAlignment(true);
      updateAlignmentLogs([`Auto-evaluation needed (${evaluations.length}/${annotatedTraceCount} evaluated)`, 'Starting auto-evaluation...']);
      setShowAlignmentLogs(true);

      try {
        // Trigger auto-evaluation
        const autoEvalResponse = await fetch(`/workshops/${workshopId}/restart-auto-evaluation`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            evaluation_model_name: getBackendModelName(selectedEvaluationModel),
          }),
        });

        if (!autoEvalResponse.ok) {
          const errorText = await autoEvalResponse.text();
          throw new Error(`Failed to start auto-evaluation: ${autoEvalResponse.status} ${errorText}`);
        }

        const autoEvalData = await autoEvalResponse.json();
        const autoEvalJobIds = autoEvalData.job_ids || [autoEvalData.job_id];
        updateAlignmentLogs(prev => [...prev, `Auto-evaluation started (${autoEvalJobIds.length} judge(s))`]);

        // Poll for auto-evaluation completion
        let autoEvalComplete = false;
        let pollAttempts = 0;
        const maxAttempts = 180; // 3 minutes at 1 second intervals

        while (!autoEvalComplete && pollAttempts < maxAttempts) {
          await new Promise(resolve => setTimeout(resolve, 1000));
          pollAttempts++;

          const statusResponse = await fetch(`/workshops/${workshopId}/auto-evaluation-status`);
          if (statusResponse.ok) {
            const status = await statusResponse.json();

            if (status.status === 'completed') {
              autoEvalComplete = true;
              updateAlignmentLogs(prev => [...prev, 'Auto-evaluation completed!']);

              // Fetch updated evaluations
              const resultsResponse = await fetch(`/workshops/${workshopId}/auto-evaluation-results`);
              if (resultsResponse.ok) {
                const resultsData = await resultsResponse.json();
                if (resultsData.evaluations && resultsData.evaluations.length > 0) {
                  const evalResults = resultsData.evaluations.map((e: any) => ({
                    id: e.trace_id,
                    trace_id: e.trace_id,
                    mlflow_trace_id: e.mlflow_trace_id,
                    predicted_rating: e.predicted_rating,
                    human_rating: e.human_rating,
                    confidence: e.confidence,
                    reasoning: e.reasoning,
                    predicted_feedback: e.judge_name || '',
                  }));
                  setEvaluations(evalResults);
                }
              }
            } else if (status.status === 'failed') {
              throw new Error('Auto-evaluation failed');
            } else if (pollAttempts % 10 === 0) {
              updateAlignmentLogs(prev => [...prev, `Still evaluating... (${pollAttempts}s)`]);
            }
          }
        }

        if (!autoEvalComplete) {
          throw new Error('Auto-evaluation timed out');
        }

      } catch (autoEvalError: any) {
        console.error('[ALIGN] Auto-evaluation failed:', autoEvalError);
        toast.error(`Auto-evaluation failed: ${autoEvalError.message}`);
        updateAlignmentLogs(prev => [...prev, `ERROR: ${autoEvalError.message}`]);
        setIsRunningAlignment(false);
        return;
      }

      updateAlignmentLogs(prev => [...prev, 'Proceeding with alignment...']);
    }

    if (!isRunningAlignment) {
      setIsRunningAlignment(true);
      updateAlignmentLogs(['Starting alignment job...']);
      setShowAlignmentLogs(true);
    }
    setAlignmentResult(null);
    const normalizedPrompt = ensurePromptHasPlaceholders(currentPrompt);

    try {
      // Step 1: Start the alignment job
      const requestBody = {
          judge_name: judgeName,
          judge_prompt: normalizedPrompt,
        evaluation_model_name: getBackendModelName(selectedEvaluationModel),
        alignment_model_name: getBackendModelName(selectedAlignmentModel),
      };
      
      const startResponse = await fetch(`/workshops/${workshopId}/start-alignment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      if (!startResponse.ok) {
        const errorText = await startResponse.text();
        throw new Error(`Failed to start alignment: ${startResponse.status} ${errorText}`);
      }

      const { job_id } = await startResponse.json();
      updateAlignmentLogs(prev => [...prev, `Alignment job started (ID: ${job_id.substring(0, 8)}...)`]);

      // Step 2: Poll for status updates
      let logIndex = 0;
      let pollCount = 0;
      const maxPolls = 1800; // 30 minutes at 1 poll/second
      
      const poll = async (): Promise<void> => {
        pollCount++;
        
        try {
          const statusResponse = await fetch(
            `/workshops/${workshopId}/alignment-job/${job_id}?since_log_index=${logIndex}`
          );
          
          if (!statusResponse.ok) {
            console.error('[ALIGN] Status poll failed:', statusResponse.status);
            return;
          }
          
          const status = await statusResponse.json();
          
          // Add new logs
          if (status.logs && status.logs.length > 0) {
            updateAlignmentLogs(prev => [...prev, ...status.logs]);
            logIndex = status.log_count;
          }
          
          // Check if job is complete
          if (status.status === 'completed') {
            if (status.result) {
              setAlignmentResult(status.result);
              if (status.result.success) {
                toast.success('Alignment complete! Judge has been optimized.');
                
                // Update editor with aligned instructions
                if (status.result.aligned_instructions) {
                  setCurrentPrompt(status.result.aligned_instructions);
                  setOriginalPromptText(status.result.aligned_instructions);
                  setIsModified(false);
                }
                
                // Refresh prompts list and select the new aligned version
                if (status.result.saved_prompt_id) {
                  try {
                    const updatedPrompts = await WorkshopsService.getJudgePromptsWorkshopsWorkshopIdJudgePromptsGet(workshopId);
                    setPrompts(updatedPrompts);
                    setSelectedPromptId(status.result.saved_prompt_id);
                    
                    // Load the aligned prompt text from the database to ensure consistency
                    const alignedPrompt = updatedPrompts.find(p => p.id === status.result.saved_prompt_id);
                    if (alignedPrompt) {
                      setCurrentPrompt(alignedPrompt.prompt_text);
                      setOriginalPromptText(alignedPrompt.prompt_text);
                      setIsModified(false);
                    }
                    
                    // Re-fetch evaluations from the server — auto-eval ran before alignment
                    // and those results are still valid and stored in the DB.
                    try {
                      const evalResponse = await fetch(`/workshops/${workshopId}/auto-evaluation-results`);
                      if (evalResponse.ok) {
                        const evalData = await evalResponse.json();
                        if (evalData.evaluations && evalData.evaluations.length > 0) {
                          const evalResults = evalData.evaluations.map((e: any) => ({
                            id: e.trace_id,
                            trace_id: e.trace_id,
                            mlflow_trace_id: e.mlflow_trace_id,
                            predicted_rating: e.predicted_rating,
                            human_rating: e.human_rating,
                            confidence: e.confidence,
                            reasoning: e.reasoning,
                            predicted_feedback: e.judge_name || '',
                          }));
                          setEvaluations(evalResults);
                          setHasEvaluated(true);
                          setEvaluationComplete(evalResults.length >= 10);
                          if (evalData.metrics) {
                            setMetrics(evalData.metrics);
                          }
                        } else {
                          setEvaluations([]);
                          setMetrics(null);
                          setHasEvaluated(false);
                          setEvaluationComplete(false);
                        }
                      }
                    } catch (evalFetchErr) {
                      console.error('[ALIGN] Failed to re-fetch evaluations:', evalFetchErr);
                      setEvaluations([]);
                      setMetrics(null);
                      setHasEvaluated(false);
                      setEvaluationComplete(false);
                    }
                  } catch (refreshErr) {
                    console.error('[ALIGN] Failed to refresh prompts:', refreshErr);
                  }
                }
              }
            }
            setIsRunningAlignment(false);
            return;
          }
          
          if (status.status === 'failed') {
            console.error('[ALIGN] Job failed:', status.error);
            toast.error(`Alignment failed: ${status.error || 'Unknown error'}`);
            updateAlignmentLogs(prev => [...prev, `ERROR: ${status.error || 'Unknown error'}`]);
            setIsRunningAlignment(false);
            return;
          }
          
          // Continue polling if still running
          if (status.status === 'running' && pollCount < maxPolls) {
            // Poll every 2 seconds
            setTimeout(poll, 2000);
          } else if (pollCount >= maxPolls) {
            console.warn('[ALIGN] Max poll count reached');
            updateAlignmentLogs(prev => [...prev, 'Warning: Polling timeout reached. Job may still be running.']);
            setIsRunningAlignment(false);
          }
        } catch (pollError) {
          console.error('[ALIGN] Poll error:', pollError);
          // On error, try again after a delay
          if (pollCount < maxPolls) {
            setTimeout(poll, 5000);
          }
        }
      };

      // Start polling
      await poll();
      
    } catch (error: any) {
      console.error('[ALIGN] Exception caught:', error);
      const message = error?.message || 'Alignment failed';
      toast.error(`Alignment failed: ${message}`);
      updateAlignmentLogs(prev => [...prev, `ERROR: ${message}`]);
      setIsRunningAlignment(false);
    }
  };

  const handleExportJudge = async (format: string) => {
    if (!workshopId || !selectedPromptId) return;

    try {
      const exportConfig: JudgeExportConfig = {
        prompt_id: selectedPromptId,
        export_format: format || 'mlflow',
        include_examples: true
      };

      const exportResult = await WorkshopsService.exportJudgeWorkshopsWorkshopIdExportJudgePost(
        workshopId,
        exportConfig
      );

      // Determine file extension based on format
      const fileExtension = format === 'python' ? 'py' : format === 'notebook' ? 'ipynb' : 'json';
      const fileName = `mlflow_judge_${selectedPromptId.slice(0, 8)}.${fileExtension}`;

      // Create appropriate blob type
      const contentType = format === 'python' ? 'text/plain' : 'application/json';
      const content = format === 'python' && exportResult.code ? exportResult.code : JSON.stringify(exportResult, null, 2);
      
      const blob = new Blob([content], { type: contentType });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

    } catch (err: any) {
      setError(err.message || 'Failed to export judge');
    }
  };

  const getMetricColor = (value: number, metric: string) => {
    if (metric === 'correlation' || metric === 'accuracy') {
      if (value >= 0.8) return 'text-green-600';
      if (value >= 0.6) return 'text-yellow-600';
      return 'text-red-600';
    }
    return 'text-gray-600';
  };

  // Don't block the UI with loading screen - show inline loading states instead

  return (
    <div className="h-full bg-gray-50 p-6 space-y-6">
      {/* Header */}
      <div className="mb-6">
        <div className="flex items-center gap-3 mb-2">
          <Brain className="h-8 w-8 text-blue-600" />
          <h1 className="text-3xl font-bold text-gray-900">Judge Tuning</h1>
          <div className="ml-auto">
            {prompts.length > 0 && (
              <Badge variant="outline">
                {prompts.length} Prompt{prompts.length === 1 ? '' : 's'}
              </Badge>
            )}
          </div>
        </div>
        <div className="flex items-center justify-between">
          <p className="text-gray-600">
            Create and refine AI judges using your workshop's human annotation data.
          </p>
          <div className="text-sm">
            {mlflowConfig ? (
              <Badge className="bg-green-100 text-green-800">
                <Database className="h-3 w-3 mr-1" />
                MLflow Connected
              </Badge>
            ) : (
              <Badge className="bg-yellow-100 text-yellow-800">
                <AlertCircle className="h-3 w-3 mr-1" />
                MLflow Not Configured
              </Badge>
            )}
          </div>
        </div>
      </div>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Rubric Question Selector */}
      {parsedRubricQuestions.length > 1 && (
        <div className="mb-6">
          <label className="text-sm font-medium text-gray-700 mb-2 block">
            Select Judge to Tune ({parsedRubricQuestions.length} available)
          </label>
          <Select 
            value={String(selectedQuestionIndex)}
            onValueChange={(value) => setSelectedQuestionIndex(Number(value))}
          >
            <SelectTrigger className="w-full max-w-md bg-white">
              <SelectValue placeholder="Select a judge" />
            </SelectTrigger>
            <SelectContent>
              {parsedRubricQuestions.map((question, index) => (
                <SelectItem key={question.id || index} value={String(index)}>
                  <div className="flex items-center gap-2">
                    <span className="font-medium">{index + 1}. {question.title}</span>
                    <Badge variant="outline" className="text-xs">
                      {question.judgeType === 'likert' && 'Likert'}
                      {question.judgeType === 'binary' && 'Binary'}
                      {question.judgeType === 'freeform' && 'Free-form'}
                    </Badge>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}


      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        {/* Left Column - Prompt Editor (1/3) */}
        <div className="lg:col-span-1 space-y-4">
          
          {/* Prompt History Dropdown */}
          {prompts.length > 0 && (
            <div>
              <label className="text-sm font-medium text-gray-700 mb-2 block">Prompt History</label>
              <Select 
                value={selectedPromptId || undefined}
                onValueChange={(value) => {
                  setSelectedPromptId(value);
                  const prompt = prompts.find(p => p.id === value);
                  if (prompt) {
                    setCurrentPrompt(prompt.prompt_text);
                    setOriginalPromptText(prompt.prompt_text); // Track original for modification detection
                    // Sync UI model selection with saved prompt's model
                    if (prompt.model_name) {
                        const frontendModel = getFrontendModelName(prompt.model_name);
                        setSelectedEvaluationModel(frontendModel);
                        setSelectedAlignmentModel(frontendModel);
                    }
                    // Clear evaluation state when switching prompts
                    setHasEvaluated(false);
                    setEvaluationError(null);
                    loadEvaluations(value);
                  }
                }}
              >
                <SelectTrigger className="w-full bg-white">
                  <SelectValue placeholder={
                    selectedPromptId && isModified 
                      ? "Modified (unsaved changes)" 
                      : "Select a previous prompt"
                  } />
                </SelectTrigger>
                <SelectContent>
                  {prompts.map((prompt) => (
                    <SelectItem key={prompt.id} value={prompt.id}>
                      <div className="flex items-center justify-between w-full">
                        <div className="flex items-center gap-2">
                          <span>v{prompt.version}</span>
                          <Badge variant="outline" className="text-xs">
                            {(prompt.model_parameters as any)?.aligned 
                              ? 'Aligned' 
                              : prompt.model_name === 'demo' 
                                ? 'Demo' 
                                : getDisplayName(getFrontendModelName(prompt.model_name || ''))}
                          </Badge>
                        </div>
                        {prompt.performance_metrics && (
                          <span className="text-xs text-gray-500 ml-2">
                            κ={(prompt.performance_metrics.correlation * 100).toFixed(0)}%
                          </span>
                        )}
                      </div>
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          )}

          {/* Prompt Editor */}
          <Card className="flex-1 flex flex-col">
            <CardHeader className="pb-3">
              <CardTitle className="flex items-center gap-2 text-lg">
                <Zap className="h-4 w-4" />
                Judge Prompt
              </CardTitle>
              <CardDescription className="text-xs">
                The prompt in the textbox below is what gets evaluated. Use {'{input}'} and {'{output}'} as placeholders.
              </CardDescription>
            </CardHeader>
            <CardContent className="flex-1 flex flex-col space-y-3">
              <div className="flex-1">
                <Textarea
                  value={currentPrompt}
                  onChange={(e) => setCurrentPrompt(e.target.value)}
                  placeholder="Enter your judge prompt here..."
                  className="min-h-[300px] h-full font-mono text-sm resize-none"
                />
              </div>
              
              <div className="space-y-3">
                <div className="flex gap-2">
                  {/* Save to Database */}
                  <Button 
                    onClick={handleSavePrompt}
                    disabled={!currentPrompt.trim() || isLoading}
                    variant="outline"
                    className="flex-1"
                    size="sm"
                    title="Save prompt to database as new version"
                  >
                    {isLoading ? (
                      <>
                        <Clock className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Database className="mr-2 h-4 w-4" />
                        Save as New Version
                      </>
                    )}
                  </Button>
                  {/* Download Prompt */}
                  <Button 
                    onClick={handleDownloadPrompt}
                    disabled={!currentPrompt.trim()}
                    variant="outline"
                    size="sm"
                    title="Download prompt as JSON file"
                  >
                    <Download className="h-4 w-4" />
                  </Button>
                  {/* Reset to Default Template */}
                  <Button
                    onClick={handleResetToDefaultTemplate}
                    disabled={!rubric?.question}
                    variant="outline"
                    size="sm"
                    title="Reset prompt to default template for current judge type"
                  >
                    <RefreshCw className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Right Column - Evaluation Grid (2/3) */}
        <div className="lg:col-span-2 flex flex-col">
          {/* Evaluation Error */}
          {evaluationError && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {evaluationError}
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => handleReEvaluate()} 
                  className="mt-2"
                >
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Databricks Configuration Warning */}
          {!mlflowConfig && selectedEvaluationModel !== 'demo' && annotations.length > 0 && (
            <div className="bg-amber-50 border border-amber-200 rounded-lg p-4 mb-4">
              <div className="flex gap-3">
                <AlertCircle className="h-5 w-5 text-amber-600 flex-shrink-0 mt-0.5" />
                <div>
                  <h4 className="font-medium text-amber-900">Databricks Configuration Required</h4>
                  <p className="text-sm text-amber-800 mt-1">
                    Configure your Databricks workspace connection in the Intake phase to use AI judges.
                  </p>
                </div>
              </div>
            </div>
          )}

          {/* Custom LLM Provider Configuration */}
          <div className="mb-4">
            <CustomLLMProviderConfig
              workshopId={workshopId!}
              onConfigChange={(config) => {
                // Track when custom provider is configured for model dropdown
              }}
            />
          </div>

          {/* Performance Metrics Bar - Only show after evaluation has been run */}
          {metrics && hasEvaluated && (() => {
            const agreementByRating = metrics.agreement_by_rating || {};
            return (
              <div className="bg-white rounded-lg border p-4 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  {/* Evaluation Mode Badge */}
                  <div>
                    <span className="text-sm text-gray-500">Mode</span>
                    <div className="flex items-center gap-2">
                      {selectedEvaluationModel === 'demo' ? (
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                          <TestTube className="h-3 w-3 mr-1" />
                          Demo
                        </Badge>
                      ) : evaluationMode === 'simple' ? (
                        <Badge variant="outline" className="bg-purple-50 text-purple-700 border-purple-200">
                          <Cloud className="h-3 w-3 mr-1" />
                          Simple
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          <Zap className="h-3 w-3 mr-1" />
                          MLflow
                        </Badge>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">
                      Cohen's κ
                      {metrics.total_evaluations < 3 && (
                        <span className="text-xs text-amber-600 ml-1">(limited data)</span>
                      )}
                    </span>
                    <div className={`text-xl font-bold ${getMetricColor(metrics.correlation, 'correlation')}`}>
                      {(metrics.correlation * 100).toFixed(1)}%
                      {metrics.total_evaluations < 3 && (
                        <span className="text-xs text-amber-600 ml-1">*</span>
                      )}
                    </div>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Accuracy</span>
                    <div className={`text-xl font-bold ${getMetricColor(metrics.accuracy, 'accuracy')}`}>
                      {(metrics.accuracy * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div>
                    <span className="text-sm text-gray-500">Total</span>
                    <div className="text-xl font-bold text-blue-600">
                      {metrics.total_evaluations}
                      {(metrics as any).total_evaluations_all && (metrics as any).total_evaluations_all > metrics.total_evaluations && (
                        <span className="text-xs text-gray-400 ml-1">
                          / {(metrics as any).total_evaluations_all}
                        </span>
                      )}
                    </div>
                    {(metrics as any).total_evaluations_all && (metrics as any).total_evaluations_all > metrics.total_evaluations && (
                      <div className="text-xs text-amber-600 mt-1">
                        {(metrics as any).total_evaluations_all - metrics.total_evaluations} missing ratings
                      </div>
                    )}
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map(rating => (
                    <div key={rating} className="text-center">
                      <div className="text-xs text-gray-500">{rating}★</div>
                      <div className={`text-sm font-semibold ${
                        (agreementByRating[rating.toString()] || 0) >= 0.8 ? 'text-green-600' :
                        (agreementByRating[rating.toString()] || 0) >= 0.6 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {((agreementByRating[rating.toString()] || 0) * 100).toFixed(0)}%
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              {/* Small sample warning */}
              {metrics.total_evaluations < 3 && (
                <div className="mt-3 text-xs text-amber-700 bg-amber-50 px-3 py-2 rounded">
                  <strong>Note:</strong> Cohen's kappa with fewer than 3 evaluations shows simple agreement rate instead of statistical kappa. 
                  Get more annotation data for reliable inter-rater agreement metrics.
                </div>
              )}
              
              {/* Missing ratings warning */}
              {(metrics as any).total_evaluations_all && (metrics as any).total_evaluations_all > metrics.total_evaluations && (
                <div className="mt-3 text-xs text-orange-700 bg-orange-50 px-3 py-2 rounded">
                  <strong>Warning:</strong> {(metrics as any).total_evaluations_all - metrics.total_evaluations} out of {(metrics as any).total_evaluations_all} evaluations have missing or invalid judge ratings. 
                  These may have been rejected due to invalid responses (e.g., MLflow returning 3.0 for binary judges). 
                  Only evaluations with both valid human and judge ratings are included in the metrics.
                </div>
              )}
            </div>
            );
          })()}

          {/* Evaluation Grid */}
          <Card className="flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Target className="h-4 w-4" />
                  Evaluation Results
                </CardTitle>
                <div className="flex items-center gap-2">
                  {evaluations.length > 0 && (
                    <Badge variant="outline">
                      {evaluations.length} evaluations
                    </Badge>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              {annotatedTraces.length > 0 ? (
                <div className="h-full overflow-auto">
                  <table className="w-full text-sm">
                    <thead className="sticky top-0 bg-gray-50 border-b">
                      <tr>
                        <th className="text-left p-3 font-medium text-gray-700">Input</th>
                        <th className="text-left p-3 font-medium text-gray-700">Output</th>
                        <th className="text-center p-3 font-medium text-gray-700 w-20">Human</th>
                        <th className="text-center p-3 font-medium text-gray-700 w-20">Judge</th>
                        <th className="text-center p-3 font-medium text-gray-700 w-20">Diff</th>
                        <th className="text-center p-3 font-medium text-gray-700 w-20">Match</th>
                      </tr>
                    </thead>
                    <tbody>
                      {(() => {
                        // Calculate pagination
                        const startIndex = (currentPage - 1) * itemsPerPage;
                        const endIndex = startIndex + itemsPerPage;
                        const paginatedTraces = annotatedTraces.slice(startIndex, endIndex);
                        
                        return paginatedTraces.map((trace: any, index: number) => {
                          // Find annotations for this trace and get rating for SELECTED question only
                          const traceAnnotations = annotations.filter(a => a.trace_id === trace.id);
                          
                          let humanRating: number | null = null;
                          if (traceAnnotations.length > 0 && selectedQuestion) {
                            // Get the selected question ID to filter ratings
                            const selectedQuestionId = selectedQuestion.id;
                            
                            // Collect ratings ONLY for the selected question from all annotators
                            const allRatings: number[] = [];
                            
                            for (const ann of traceAnnotations) {
                              let foundRating = false;
                              
                              // First, try to get rating for the selected question from ratings field
                              if (ann.ratings && typeof ann.ratings === 'object') {
                                // Try exact question ID match (e.g., "q_1", "q_2")
                                const ratingValue = ann.ratings[selectedQuestionId];
                                if (ratingValue !== undefined && ratingValue !== null && typeof ratingValue === 'number') {
                                  allRatings.push(ratingValue);
                                  foundRating = true;
                                }
                                
                                // Also try index-based key format (e.g., "rubricId_0", "rubricId_1")
                                if (!foundRating) {
                                  const indexBasedKey = Object.keys(ann.ratings).find(k => 
                                    k.endsWith(`_${selectedQuestionIndex}`)
                                  );
                                  if (indexBasedKey) {
                                    const indexRatingValue = ann.ratings[indexBasedKey];
                                    if (indexRatingValue !== undefined && indexRatingValue !== null && typeof indexRatingValue === 'number') {
                                      allRatings.push(indexRatingValue);
                                      foundRating = true;
                                    }
                                  }
                                }
                              }
                              
                              // Fallback to legacy rating field ONLY if this is the first question (index 0)
                              // Legacy ratings are assumed to be for the first question
                              if (!foundRating && selectedQuestionIndex === 0 && 
                                  ann.rating !== undefined && ann.rating !== null && typeof ann.rating === 'number') {
                                allRatings.push(ann.rating);
                              }
                            }
                            
                            // Calculate aggregated rating for the selected question
                            if (allRatings.length > 0) {
                              if (judgeType === 'binary') {
                                // For binary: majority vote (0 or 1)
                                const numPasses = allRatings.filter(r => r === 1).length;
                                humanRating = numPasses > allRatings.length / 2 ? 1 : 0;
                              } else {
                                // For Likert: mode (most common rating)
                                const modeRating = allRatings
                                  .sort((a, b) => allRatings.filter(v => v === b).length - allRatings.filter(v => v === a).length)[0];
                                humanRating = modeRating;
                              }
                            }
                          }
                          
                          // Find evaluation for this trace
                          // Match by: DB trace ID or MLflow trace ID
                          // When multiple rubric questions exist, also filter by predicted_feedback
                          // (which stores the judge_name) to show only the selected question's evaluation
                          const expectedJudgeName = selectedQuestion?.title
                            ? selectedQuestion.title.toLowerCase().replace(/[^a-z0-9]+/g, '_').replace(/^_|_$/g, '') + '_judge'
                            : '';
                          const hasJudgeLabels = evaluations.some((e: any) => e.predicted_feedback);

                          const matchesTrace = (e: any) => {
                            if (e.trace_id && e.trace_id === trace.id) return true;
                            if (e.mlflow_trace_id && trace.mlflow_trace_id && e.mlflow_trace_id === trace.mlflow_trace_id) return true;
                            if (e.trace_id && trace.mlflow_trace_id && e.trace_id === trace.mlflow_trace_id) return true;
                            return false;
                          };
                          // If evaluations have judge labels, filter by the selected question
                          // Otherwise fall back to first match (legacy data without labels)
                          let evaluation = hasJudgeLabels && expectedJudgeName
                            ? evaluations.find((e: any) => matchesTrace(e) && e.predicted_feedback === expectedJudgeName)
                            : evaluations.find((e: any) => matchesTrace(e));
                          // Fallback: if no match with judge filter, try without (handles legacy data)
                          if (!evaluation && hasJudgeLabels) {
                            evaluation = evaluations.find((e: any) => matchesTrace(e));
                          }
                          
                          const judgeRating = evaluation?.predicted_rating;


                          // Calculate diff and match if both ratings exist
                          // Note: Check for !== null (not just truthy) to handle 0 values correctly
                          const diff = humanRating !== null && judgeRating !== null && judgeRating !== undefined ? Math.abs(judgeRating - humanRating) : null;
                          const isMatch = diff === 0;
                          const isExpanded = expandedRowId === trace.id;
                          
                          return (
                            <React.Fragment key={trace.id}>
                                                          <tr 
                              className={`border-b hover:bg-gray-50 cursor-pointer ${
                                (startIndex + index) % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'
                              }`}
                              onClick={() => setExpandedRowId(isExpanded ? null : trace.id)}
                            >
                              <td className="p-3 max-w-xs">
                                <div className={`text-xs text-gray-700 ${isExpanded ? 'whitespace-pre-wrap break-words' : 'truncate'}`}>
                                  {trace.input || 'N/A'}
                                </div>
                              </td>
                              <td className="p-3 max-w-xs">
                                <div className={`text-xs text-gray-700 ${isExpanded ? 'whitespace-pre-wrap break-words' : 'truncate'}`}>
                                  {trace.output || 'N/A'}
                                </div>
                              </td>
                              <td className="text-center p-3">
                                {humanRating !== null && humanRating !== undefined ? (
                                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-blue-100 text-blue-800 font-semibold">
                                    {humanRating}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-400 font-semibold">
                                    —
                                  </span>
                                )}
                              </td>
                              <td className="text-center p-3">
                                {judgeRating !== null && judgeRating !== undefined ? (
                                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-semibold ${
                                    diff === 0 ? 'bg-green-100 text-green-800' :
                                    diff === 1 ? 'bg-yellow-100 text-yellow-800' :
                                    diff !== null && diff > 1 ? 'bg-red-100 text-red-800' :
                                    'bg-gray-100 text-gray-800'
                                  }`}>
                                    {judgeRating}
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-gray-100 text-gray-400 font-semibold">
                                    —
                                  </span>
                                )}
                              </td>
                              <td className="text-center p-3">
                                {diff !== null ? (
                                  <span className={`font-semibold ${
                                    diff === 0 ? 'text-green-600' : 
                                    diff === 1 ? 'text-yellow-600' : 
                                    'text-red-600'
                                  }`}>
                                    {diff === 0 ? '0' : `±${diff}`}
                                  </span>
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                              <td className="text-center p-3">
                                {diff !== null ? (
                                  isMatch ? (
                                    <CheckCircle className="h-5 w-5 text-green-500 mx-auto" />
                                  ) : diff === 1 ? (
                                    <AlertCircle className="h-5 w-5 text-yellow-500 mx-auto" />
                                  ) : (
                                    <XCircle className="h-5 w-5 text-red-500 mx-auto" />
                                  )
                                ) : (
                                  <span className="text-gray-400">—</span>
                                )}
                              </td>
                            </tr>
                            
                            {/* Expanded Row with Trace Data Viewer */}
                            {isExpanded && (
                              <tr>
                                <td colSpan={6} className="p-0">
                                  <div className="bg-gray-50 border-t">
                                    <TraceDataViewer 
                                      trace={trace}
                                      showContext={true}
                                      className="m-4"
                                    />
                                  </div>
                                </td>
                              </tr>
                            )}
                            </React.Fragment>
                          );
                        });
                      })()}
                    </tbody>
                  </table>
                  
                  {/* Pagination */}
                  {annotatedTraces.length > itemsPerPage && (
                    <div className="border-t bg-gray-50 p-4">
                      <Pagination
                        currentPage={currentPage}
                        totalPages={Math.ceil(annotatedTraces.length / itemsPerPage)}
                        totalItems={annotatedTraces.length}
                        itemsPerPage={itemsPerPage}
                        onPageChange={setCurrentPage}
                        onItemsPerPageChange={(newItemsPerPage: number) => {
                          setItemsPerPage(newItemsPerPage);
                          setCurrentPage(1); // Reset to first page when changing items per page
                        }}
                        showItemsPerPageSelector={true}
                        showQuickJump={true}
                        showKeyboardShortcuts={true}
                      />
                    </div>
                  )}
                </div>
              ) : !traces || traces.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-500">
                  <div className="text-center p-8">
                    <Database className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      No Traces Available
                    </h3>
                    <p className="text-gray-600 max-w-md">
                      No traces found. Please check the intake phase and ensure traces have been ingested.
                    </p>
                  </div>
                </div>
              ) : annotations.length === 0 ? (
                <div className="h-full flex items-center justify-center text-gray-500">
                  <div className="text-center p-8">
                    <Users className="h-16 w-16 text-gray-300 mx-auto mb-4" />
                    <h3 className="text-lg font-semibold text-gray-900 mb-2">
                      Waiting for Annotation Data
                    </h3>
                    <p className="text-gray-600 max-w-md">
                      Participants need to complete annotations before you can create AI judges.
                    </p>
                  </div>
                </div>
              ) : (
                <div className="h-full flex items-center justify-center text-gray-500">
                  <div className="text-center">
                    <Brain className="h-12 w-12 mx-auto mb-3 opacity-20" />
                    <p className="text-sm">No evaluations yet</p>
                    <p className="text-xs mt-1">Click "Evaluate Current Prompt" to generate AI judge ratings</p>
                    <p className="text-xs mt-1">This will compare the AI judge against human annotations</p>
                  </div>
                </div>
              )}
            </CardContent>
          </Card>
        </div>

      </div>

      {/* Judge Alignment & Evaluation */}
      <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Brain className="h-5 w-5 text-purple-600" />
            Judge Alignment
          </CardTitle>
          <CardDescription>
            {evaluationMode === 'mlflow' 
              ? 'Run mlflow.genai.evaluate() and align() using the prompt and model above. Ensure traces are tagged for alignment in Results Review.'
              : 'Use simple Databricks Model Serving to evaluate your judge prompt against human annotations.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {/* Evaluation Mode Toggle */}
          <div className="flex items-center gap-4 p-3 bg-white border border-purple-200 rounded-lg">
            <span className="text-sm font-medium text-gray-700">Evaluation Mode:</span>
            <div className="flex gap-2">
              <Button
                variant={evaluationMode === 'mlflow' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setEvaluationMode('mlflow')}
                className={evaluationMode === 'mlflow' ? 'bg-purple-600 hover:bg-purple-700' : ''}
              >
                <Database className="h-4 w-4 mr-1" />
                MLflow
              </Button>
              <Button
                variant={evaluationMode === 'simple' ? 'default' : 'outline'}
                size="sm"
                onClick={() => setEvaluationMode('simple')}
                className={evaluationMode === 'simple' ? 'bg-blue-600 hover:bg-blue-700' : ''}
              >
                <Cloud className="h-4 w-4 mr-1" />
                Simple Model Serving
              </Button>
            </div>
            <span className="text-xs text-gray-500 ml-auto">
              {evaluationMode === 'mlflow' 
                ? 'Full MLflow integration with metrics tracking'
                : 'Direct endpoint calls (no MLflow required)'}
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <span className="text-sm font-medium text-gray-700">Traces Included</span>
              <div className="px-3 py-2 bg-white border border-gray-200 rounded-md mt-1">
                <span className="text-lg font-bold text-purple-600">
                  {annotatedTraceCount}
                </span>
                <span className="text-sm text-gray-600 ml-2">
                  SME-annotated trace{annotatedTraceCount === 1 ? '' : 's'}
                </span>
              </div>
            </div>
            <div>
              <span className="text-sm font-medium text-gray-700">Alignment Status</span>
              <div className="mt-2">
                {alignmentResult ? (
                  <Badge className="bg-indigo-100 text-indigo-800">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Alignment complete
                  </Badge>
                ) : annotatedTraceCount >= 10 ? (
                  <Badge className="bg-green-100 text-green-800">
                    <CheckCircle className="h-3 w-3 mr-1" />
                    Ready for alignment
                  </Badge>
                ) : (
                  <Badge className="bg-amber-100 text-amber-800">
                    {annotatedTraceCount}/10 annotations
                  </Badge>
                )}
              </div>
              {hasEvaluated && (
                <p className="text-xs text-gray-500 mt-1">
                  Auto-evaluated: {evaluations.length} traces
                </p>
              )}
            </div>
          </div>

          {/* MLflow Mode Options */}
          {evaluationMode === 'mlflow' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Alignment LLM</label>
                <Select 
                  value={selectedAlignmentModel} 
                  onValueChange={setSelectedAlignmentModel}
                >
                  <SelectTrigger className="w-full">
                    <SelectValue placeholder="Choose alignment model" />
                  </SelectTrigger>
                  <SelectContent>
                    {getModelOptions(!!mlflowConfig).map((option) => (
                      <SelectItem 
                        key={option.value} 
                        value={option.value}
                        disabled={option.disabled}
                      >
                        <div className="flex items-center justify-between w-full">
                          <span>{option.label}</span>
                          {option.requiresDatabricks && !mlflowConfig && (
                            <span className="text-xs text-gray-500 ml-2">(Requires Databricks)</span>
                          )}
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  Used for SIMBA optimizer
                </p>
              </div>
              
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Judge Name</label>
                <Input
                  value={judgeName}
                  readOnly
                  className="bg-gray-50"
                  placeholder="workshop_judge"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Derived from rubric question: "{selectedQuestion?.title}"
                </p>
              </div>
            </div>
          )}

          {/* Simple Model Serving Mode Options */}
          {evaluationMode === 'simple' && (
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">
                  Databricks Model Serving Endpoint
                </label>
                <Select
                  value={simpleEndpointName}
                  onValueChange={setSimpleEndpointName}
                >
                  <SelectTrigger className="bg-white">
                    <SelectValue placeholder="Select model endpoint" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(MODEL_MAPPING).map(([displayName, endpointName]) => (
                      <SelectItem key={endpointName} value={endpointName}>
                        {displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500 mt-1">
                  Select a Databricks model serving endpoint
                </p>
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 mb-2 block">Judge Name</label>
                <Input
                  value={judgeName}
                  readOnly
                  className="bg-gray-50"
                  placeholder="workshop_judge"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Derived from rubric question: "{selectedQuestion?.title}"
                </p>
              </div>
            </div>
          )}

          {/* Databricks workspace + token inputs removed; use Intake configuration */}

          {/* Auto-evaluation status messages */}
          {autoEvalStatus === 'completed' && hasEvaluated && !alignmentResult && (
            <Alert className="mb-4 border-green-200 bg-green-50">
              <CheckCircle className="h-4 w-4 text-green-600" />
              <AlertDescription className="text-green-800">
                <strong>Auto-evaluation complete</strong> - LLM judge scores are available below. 
                {annotatedTraceCount >= 10 
                  ? ' Ready to run alignment!'
                  : ` Need ${10 - annotatedTraceCount} more human annotations before alignment.`}
              </AlertDescription>
            </Alert>
          )}

          {alignmentResult && (
            <Alert className="mb-4 border-indigo-200 bg-indigo-50">
              <Brain className="h-4 w-4 text-indigo-600" />
              <AlertDescription className="text-indigo-800">
                <strong>Alignment complete</strong> - Judge has been optimized. 
                You can now re-evaluate to see improved scores, or run alignment again with different settings.
              </AlertDescription>
            </Alert>
          )}

          <div className="flex flex-wrap items-center gap-4">
            {/* Alignment button - PRIMARY action for MLflow mode */}
            {evaluationMode === 'mlflow' && (
              <Button
                onClick={handleRunAlignment}
                disabled={
                  isRunningAlignment ||
                  isRunningEvaluation ||
                  isPollingAutoEval ||
                  autoEvalStatus === 'running' ||
                  !judgeName.trim() ||
                  annotatedTraceCount < 10
                }
                className={
                  annotatedTraceCount >= 10
                    ? 'bg-indigo-600 hover:bg-indigo-700'
                    : 'bg-gray-400 cursor-not-allowed'
                }
              >
                {isRunningAlignment ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Running Align()...
                  </>
                ) : (
                  <>
                    <Brain className="h-4 w-4 mr-2" />
                    Run Align()
                  </>
                )}
              </Button>
            )}

            {/* Re-evaluate button - only show after alignment has run */}
            {evaluationMode === 'mlflow' && alignmentResult && (
              <Button
                onClick={handleReEvaluate}
                disabled={
                  isRunningEvaluation ||
                  isRunningAlignment ||
                  isPollingAutoEval ||
                  autoEvalStatus === 'running'
                }
                variant="outline"
                className="border-purple-300 text-purple-700 hover:bg-purple-50"
              >
                {isRunningEvaluation ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Re-evaluating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Re-evaluate
                  </>
                )}
              </Button>
            )}

            {/* Run Evaluation button - runs evaluation for current judge/prompt */}
            {evaluationMode === 'mlflow' && (
              <Button
                onClick={handleRunCurrentEvaluation}
                disabled={
                  isRunningAllEvaluations ||
                  isRunningEvaluation ||
                  isRunningAlignment ||
                  isPollingAutoEval ||
                  autoEvalStatus === 'running' ||
                  !currentPrompt.trim()
                }
                variant="outline"
                className="border-green-400 text-green-700 hover:bg-green-50"
              >
                {isRunningAllEvaluations || (isPollingAutoEval && autoEvalStatus === 'running') ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Evaluating...
                  </>
                ) : (
                  <>
                    <Play className="h-4 w-4 mr-2" />
                    Run Evaluation
                  </>
                )}
              </Button>
            )}

            {/* Simple mode evaluate button */}
            {evaluationMode === 'simple' && (
              <Button
                onClick={handleReEvaluate}
                disabled={
                  isRunningEvaluation ||
                  isPollingAutoEval ||
                  autoEvalStatus === 'running'
                }
                className="bg-purple-600 hover:bg-purple-700"
              >
                {isRunningEvaluation ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    Evaluating...
                  </>
                ) : (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2" />
                    Run Evaluate
                  </>
                )}
              </Button>
            )}

            {/* Status messages */}
            {evaluationMode === 'mlflow' && annotatedTraceCount < 10 && autoEvalStatus !== 'running' && (
              <span className="text-sm text-gray-500">
                ⚠️ Need {10 - annotatedTraceCount} more human-annotated traces for alignment
              </span>
            )}
            
            {evaluationMode === 'simple' && (
              <span className="text-sm text-blue-600">
                💡 Simple mode: Direct evaluation via Model Serving (no alignment available)
              </span>
            )}
          </div>

          <div className="mt-4">
            <div className="flex items-center justify-between mb-2">
              <label className="text-sm font-medium text-gray-700">Execution Logs</label>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setShowAlignmentLogs((prev) => !prev)}
              >
                {showAlignmentLogs ? 'Hide Logs' : 'Show Logs'}
              </Button>
            </div>
            {showAlignmentLogs && (
              <div className="bg-gray-900 rounded-lg p-4 max-h-[300px] overflow-y-auto">
                {alignmentLogs.length === 0 ? (
                  <p className="text-sm text-gray-400 font-mono">No logs yet.</p>
                ) : (
                  <pre className="text-sm text-green-400 font-mono whitespace-pre-wrap">
                    {alignmentLogs.map((log, idx) => (
                      <div key={idx} className={log.includes('ERROR') ? 'text-red-400' : ''}>
                        {log}
                      </div>
                    ))}
                  </pre>
                )}
              </div>
            )}
          </div>

          {alignmentResult && alignmentResult.success && (
            <div className="mt-4 p-4 bg-green-50 border border-green-200 rounded-lg">
              <div className="flex items-center gap-2 mb-2">
                <CheckCircle className="h-5 w-5 text-green-600" />
                <span className="font-medium text-green-800">Alignment Successful</span>
              </div>
              <p className="text-sm text-green-700">
                Judge "{alignmentResult.judge_name}" tuned on {alignmentResult.trace_count} traces.
                {alignmentResult.saved_prompt_version && (
                  <span className="ml-1">(Saved as v{alignmentResult.saved_prompt_version})</span>
                )}
              </p>
              <p className="text-sm text-green-600 mt-1">
                The prompt editor has been updated with the aligned instructions. MLflow scorer has been updated.
              </p>
              {alignmentResult.aligned_instructions && (
                <div className="mt-3">
                  <details className="text-sm">
                    <summary className="cursor-pointer text-green-600 hover:text-green-800">
                      View Aligned Instructions
                    </summary>
                    <pre className="mt-2 p-2 bg-white rounded text-xs overflow-auto max-h-[200px]">
                      {alignmentResult.aligned_instructions}
                    </pre>
                  </details>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}