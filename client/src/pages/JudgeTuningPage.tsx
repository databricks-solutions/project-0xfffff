import React, { useState, useEffect } from 'react';
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
  MessageSquare,
} from 'lucide-react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useUser, useRoleCheck } from '@/context/UserContext';
import { WorkshopsService } from '@/client';
import { useWorkshop, useOriginalTraces } from '@/hooks/useWorkshopApi';
import { getModelOptions, getBackendModelName, getFrontendModelName, getDisplayName } from '@/utils/modelMapping';
import { useJudgeEvaluate } from '@/hooks/useDatabricksApi';
import { Pagination } from '@/components/Pagination';
import { TraceDataViewer } from '@/components/TraceDataViewer';

import type { 
  JudgePrompt, 
  JudgePromptCreate, 
  JudgeEvaluation, 
  JudgePerformanceMetrics,
  JudgeEvaluationResult,
  JudgeExportConfig,
  Rubric,
  Annotation,
  Trace
} from '@/client';

export function JudgeTuningPage() {
  const { workshopId } = useWorkshopContext();
  const { user } = useUser();
  const { isFacilitator } = useRoleCheck();
  const { data: workshop } = useWorkshop(workshopId!);
  const { data: traces } = useOriginalTraces(workshopId!);
  const queryClient = useQueryClient();
  
  // Databricks judge evaluation hook
  const judgeEvaluate = useJudgeEvaluate();
  
  // State management
  const [prompts, setPrompts] = useState<JudgePrompt[]>([]);
  const [currentPrompt, setCurrentPrompt] = useState<string>('');
  const [selectedPromptId, setSelectedPromptId] = useState<string | null>(null);
  const [selectedModel, setSelectedModel] = useState<string>('Claude 3.7 Sonnet');
  const [evaluations, setEvaluations] = useState<JudgeEvaluation[]>([]);
  const [metrics, setMetrics] = useState<JudgePerformanceMetrics | null>(null);
  const [rubric, setRubric] = useState<Rubric | null>(null);
  // Remove traces state since we're using the hook
  const [annotations, setAnnotations] = useState<Annotation[]>([]);
  const [mlflowConfig, setMlflowConfig] = useState<any>(null);
  
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
  const [isEvaluating, setIsEvaluating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [evaluationError, setEvaluationError] = useState<string | null>(null);
  
  // Databricks configuration state
  const [databricksWorkspaceUrl, setDatabricksWorkspaceUrl] = useState<string>('');
  const [databricksToken, setDatabricksToken] = useState<string>('');
  const [showDatabricksConfig, setShowDatabricksConfig] = useState<boolean>(false);

  // Load initial data
  useEffect(() => {
    if (workshopId) {
      loadInitialData();
      
      // Load evaluations from local storage if available
      const storageKey = `judge-evaluations-${workshopId}`;
      const storedData = localStorage.getItem(storageKey);
      if (storedData) {
        try {
          const parsed = JSON.parse(storedData);
          // Only load if data is less than 1 hour old
          if (Date.now() - parsed.timestamp < 60 * 60 * 1000) {
            setEvaluations(parsed.evaluations);
            setMetrics(parsed.metrics);
            setHasEvaluated(true);
          } else {
            localStorage.removeItem(storageKey);
          }
        } catch (error) {
          localStorage.removeItem(storageKey);
        }
      }
    }
  }, [workshopId]);

  // Track if current prompt text differs from original
  useEffect(() => {
    const modified = currentPrompt !== originalPromptText;
    setIsModified(modified);
    // Reset evaluation state when prompt changes
    if (modified) {
      setHasEvaluated(false);
    }
  }, [currentPrompt, originalPromptText]);
  
  // Load Databricks config from MLflow config or localStorage
  useEffect(() => {
    if (mlflowConfig) {
      setDatabricksWorkspaceUrl(mlflowConfig.databricks_host || '');
      setDatabricksToken(mlflowConfig.databricks_token || '');
    }
    
    // Also try to load from localStorage
    const storedConfig = localStorage.getItem(`databricks-config-${workshopId}`);
    if (storedConfig) {
      try {
        const parsed = JSON.parse(storedConfig);
        if (!databricksWorkspaceUrl) setDatabricksWorkspaceUrl(parsed.workspace_url || '');
        if (!databricksToken) setDatabricksToken(parsed.token || '');
      } catch (error) {
        // Silent fail for config parsing
      }
    }
  }, [mlflowConfig, workshopId]);

  // Reset pagination when traces change
  useEffect(() => {
    if (traces && traces.length > 0) {
      setCurrentPage(1);
    }
  }, [traces]);

  // Reset expanded row when changing pages
  useEffect(() => {
    setExpandedRowId(null);
  }, [currentPage]);

  const loadInitialData = async () => {
    if (!workshopId) return;
    
    setIsLoading(true);
    setError(null);
    
    try {
      // Load all required data in parallel, handling errors gracefully
      const [promptsData, rubricData, annotationsData, mlflowConfigData] = await Promise.all([
        WorkshopsService.getJudgePromptsWorkshopsWorkshopIdJudgePromptsGet(workshopId)
          .catch((err) => {
            return []; // Return empty array on error
          }),
        WorkshopsService.getRubricWorkshopsWorkshopIdRubricGet(workshopId).catch((err) => {
          return null;
        }),
        WorkshopsService.getAnnotationsWorkshopsWorkshopIdAnnotationsGet(workshopId).catch((err) => {
          return [];
        }),
        WorkshopsService.getMlflowConfigWorkshopsWorkshopIdMlflowConfigGet(workshopId).catch((err) => {
          return null;
        })
      ]);

      setPrompts(promptsData);
      setRubric(rubricData);
      setAnnotations(annotationsData);
      setMlflowConfig(mlflowConfigData);

      // Initialize with rubric question if no prompts exist
      if (promptsData.length === 0 && rubricData) {
        const defaultPrompt = createDefaultPrompt(rubricData.question);
        setCurrentPrompt(defaultPrompt);
        setOriginalPromptText(defaultPrompt); // Track original for new prompt
        
        // Don't auto-create baseline - let user create it manually
        // This prevents the v2 issue where auto-creation makes first manual save become v2
      } else if (promptsData.length > 0) {
        // Select the latest prompt (first in array since ordered by version desc)
        const latestPrompt = promptsData[0];
        
        setSelectedPromptId(latestPrompt.id);
        setCurrentPrompt(latestPrompt.prompt_text);
        setOriginalPromptText(latestPrompt.prompt_text); // Track original for modification detection
        
        // Sync model selection with saved prompt
        if (latestPrompt.model_name) {
          setSelectedModel(getFrontendModelName(latestPrompt.model_name));
        }
        
        // Set metrics if available from the saved prompt
        if (latestPrompt.performance_metrics) {
          setMetrics(latestPrompt.performance_metrics as JudgePerformanceMetrics);
        }
        
        // Load evaluations if they exist
        loadEvaluations(latestPrompt.id);
      }

    } catch (err: any) {
      // Don't set error that blocks UI, silent fail
    } finally {
      setIsLoading(false);
    }
  };

  const createDefaultPrompt = (rubricQuestion: string) => {
    return `You are an expert evaluator. Please evaluate the following response based on this criteria: "${rubricQuestion}"

Rate the response on a scale of 1-5, where:
- 1 = Poor (does not meet criteria)
- 2 = Below Average (partially meets criteria)
- 3 = Average (meets basic criteria)
- 4 = Good (exceeds criteria in some ways)
- 5 = Excellent (fully exceeds criteria)

Input: {input}
Output: {output}

Think step by step about how well the output addresses the criteria, then provide your rating.

Your response MUST start with a single integer rating (1, 2, 3, 4, or 5) on its own line, followed by your reasoning.

Example format:
3
The response partially meets the criteria because...`;
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
      
      // Set metrics from the prompt's performance data if available
      const prompt = prompts.find(p => p.id === promptId);
      if (prompt?.performance_metrics) {
        setMetrics(prompt.performance_metrics as JudgePerformanceMetrics);
      }
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
        few_shot_examples: [],
        model_name: getBackendModelName(selectedModel),
        model_parameters: selectedModel === 'demo' ? null : { temperature: 0.0, max_tokens: 10 }
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

    } catch (err: any) {
      setError(err.message || 'Failed to save prompt');
    } finally {
      setIsLoading(false);
    }
  };

  const handleEvaluatePrompt = async () => {
    if (!workshopId || !currentPrompt.trim()) return;

    // Check if Databricks config is required but not configured
    if (selectedModel !== 'demo' && !mlflowConfig) {
      setEvaluationError('Databricks configuration required for AI judge evaluation. Please configure MLflow settings in the Intake phase.');
      return;
    }

    setIsEvaluating(true);
    setError(null);
    setEvaluationError(null);
    
    // Clear old cached data immediately to prevent showing stale results
    setMetrics(null);
    setEvaluations([]);

    try {
      if (selectedModel === 'demo') {
        // Use the existing demo evaluation endpoint
        const evaluationRequest = {
          prompt_text: currentPrompt,
          model_name: getBackendModelName(selectedModel),
          model_parameters: null,
          trace_ids: undefined // Evaluate all traces
        };

        const evaluationResult = await WorkshopsService.evaluateJudgePromptDirectWorkshopsWorkshopIdEvaluateJudgeDirectPost(
          workshopId,
          evaluationRequest
        );

        setMetrics(evaluationResult.metrics);
        setEvaluations(evaluationResult.evaluations);
      } else {
        // Use the new Databricks service for real models
        if (!mlflowConfig) {
          throw new Error('MLflow configuration required for AI judge evaluation');
        }

        // Create Databricks config from state (user input) or MLflow config
        const databricksConfig = {
          workspace_url: databricksWorkspaceUrl || mlflowConfig.databricks_host,
          token: databricksToken || mlflowConfig.databricks_token
        };
        
        // Validate that we have the required credentials
        if (!databricksConfig.workspace_url || !databricksConfig.token) {
          throw new Error('Databricks workspace URL and token are required. Please configure them in the Databricks Configuration section.');
        }
        
        // Save config to localStorage for future use
        localStorage.setItem(`databricks-config-${workshopId}`, JSON.stringify(databricksConfig));

        // Evaluate each trace individually using the Databricks endpoint
        const evaluations: JudgeEvaluation[] = [];
        let totalAgreement = 0;
        let totalEvaluations = 0;
        
        for (const trace of traces) {
          try {
            // Create the specific prompt for this trace
            const tracePrompt = currentPrompt
              .replace('{input}', trace.input || '')
              .replace('{output}', trace.output || '');
            

            
            // Call the Databricks judge evaluation endpoint for this trace
            const result = await judgeEvaluate.mutateAsync({
              endpointName: getBackendModelName(selectedModel),
              prompt: tracePrompt,
              config: databricksConfig,
              workshop_id: workshopId,
              temperature: 0.0,
              maxTokens: 10
            });

            if (result.success) {
              // Extract the rating from the response
              const responseText = result.data?.choices?.[0]?.message?.content || 
                                  result.data?.response || 
                                  result.data?.text || 
                                  JSON.stringify(result.data);
              
              // Parse the rating (expecting format like "3\nReasoning...")
              const ratingMatch = responseText.match(/^(\d+)/);
              const judgeRating = ratingMatch ? parseInt(ratingMatch[1]) : null;
              
              if (judgeRating && judgeRating >= 1 && judgeRating <= 5) {
                // Find human rating for this trace
                const traceAnnotations = annotations.filter(a => a.trace_id === trace.id);
                const humanRating = traceAnnotations.length > 0 ? 
                  traceAnnotations.map(a => a.rating)
                    .sort((a, b) => traceAnnotations.filter(v => v.rating === b).length - traceAnnotations.filter(v => v.rating === a).length)[0]
                  : null;
                
                // Create evaluation object
                const evaluation: JudgeEvaluation = {
                  id: `temp-${trace.id}-${Date.now()}`,
                  workshop_id: workshopId!,
                  prompt_id: 'temp-prompt',
                  trace_id: trace.id,
                  predicted_rating: judgeRating,
                  human_rating: humanRating || 0,
                  confidence: 1.0,
                  reasoning: responseText
                };
                
                evaluations.push(evaluation);
                
                // Calculate agreement if we have human rating
                if (humanRating) {
                  const agreement = Math.abs(judgeRating - humanRating) <= 1 ? 1 : 0;
                  totalAgreement += agreement;
                  totalEvaluations++;
                }
              }
            }
          } catch (error) {
            // Silent fail for individual trace evaluation
          }
        }
        
        // Calculate metrics
        const accuracy = totalEvaluations > 0 ? totalAgreement / totalEvaluations : 0;
        const correlation = accuracy; // Simplified correlation for now
        
        const metrics: JudgePerformanceMetrics = {
          prompt_id: 'temp-' + Date.now(),
          correlation: correlation,
          accuracy: accuracy,
          mean_absolute_error: 0.5, // Placeholder
          total_evaluations: totalEvaluations,
          agreement_by_rating: { "1": accuracy, "2": accuracy, "3": accuracy, "4": accuracy, "5": accuracy },
          confusion_matrix: [[0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0], [0, 0, 0, 0, 0]]
        };
        
        setMetrics(metrics);
        setEvaluations(evaluations);
        
        // Save to local storage for persistence
        const storageKey = `judge-evaluations-${workshopId}`;
        const dataToSave = {
          evaluations,
          metrics,
          timestamp: Date.now()
        };
        localStorage.setItem(storageKey, JSON.stringify(dataToSave));
        
        // Verify localStorage save worked
        const savedData = localStorage.getItem(storageKey);
      }
      
      // Clear selected prompt since we didn't save one
      setSelectedPromptId(null);
      
      // Mark as evaluated so save button becomes available
      setHasEvaluated(true);

    } catch (err: any) {
      // Show evaluation-specific error and ensure UI shows no stale data
      const errorMessage = err.body?.detail || err.message || 'Failed to evaluate prompt';
      setEvaluationError(errorMessage);
      
      // Ensure no stale data is shown on error
      setMetrics(null);
      setEvaluations([]);
      setHasEvaluated(false);
    } finally {
      setIsEvaluating(false);
    }
  };

  const handleAdvanceToLogFeedback = async () => {
    if (!isFacilitator) return;
    
    try {
      // Call the Unity volume advance endpoint directly (keeping the same backend endpoint)
      const response = await fetch(`/workshops/${workshopId}/advance-to-unity-volume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      });
      
      if (!response.ok) {
        throw new Error(`Failed to advance to Log Feedback phase: ${response.statusText}`);
      }
      
      const result = await response.json();
      
      // Add a small delay to ensure backend has processed the change
      await new Promise(resolve => setTimeout(resolve, 500));
      
      // Clear all workshop-related queries from cache
      queryClient.removeQueries({ queryKey: ['workshop', workshopId] });
      queryClient.removeQueries({ queryKey: ['annotations', workshopId] });
      queryClient.removeQueries({ queryKey: ['rubric', workshopId] });
      queryClient.removeQueries({ queryKey: ['judge-prompts', workshopId] });
      
      // Force a fresh refetch of the workshop data
      await queryClient.prefetchQuery({
        queryKey: ['workshop', workshopId],
        queryFn: () => WorkshopsService.getWorkshopWorkshopsWorkshopIdGet(workshopId!)
      });
      
      // Navigate to Unity Volume page (which now focuses on Log Feedback)
      window.location.href = `/workshop/${workshopId}?phase=unity_volume`;
      
    } catch (error) {
      // You might want to show an error message to the user here
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
    <div className="h-full bg-gray-50 p-6">
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
      
      {/* Databricks Configuration Card */}
      <Card className="mb-6">
        <CardHeader>
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Cloud className="h-5 w-5 text-blue-600" />
              <CardTitle>Databricks Configuration</CardTitle>
            </div>
            <Button
              variant="ghost"
              size="sm"
              onClick={() => setShowDatabricksConfig(!showDatabricksConfig)}
            >
              {showDatabricksConfig ? 'Hide' : 'Show'}
            </Button>
          </div>
          <CardDescription>
            {databricksWorkspaceUrl && databricksToken ? (
              <span className="text-green-600 flex items-center gap-1">
                <CheckCircle className="h-4 w-4" />
                Configuration complete
              </span>
            ) : (
              <span className="text-orange-600 flex items-center gap-1">
                <AlertCircle className="h-4 w-4" />
                Required for AI judge evaluation
              </span>
            )}
          </CardDescription>
        </CardHeader>
        {showDatabricksConfig && (
          <CardContent className="space-y-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Databricks Workspace URL
              </label>
              <input
                type="text"
                value={databricksWorkspaceUrl}
                onChange={(e) => setDatabricksWorkspaceUrl(e.target.value)}
                placeholder="https://your-workspace.cloud.databricks.com"
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Your Databricks workspace URL (e.g., https://your-workspace.cloud.databricks.com)
              </p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-2">
                Databricks Token
              </label>
              <input
                type="password"
                value={databricksToken}
                onChange={(e) => setDatabricksToken(e.target.value)}
                placeholder="dapi..."
                className="w-full px-3 py-2 border border-gray-300 rounded-md focus:outline-none focus:ring-2 focus:ring-blue-500"
              />
              <p className="text-xs text-gray-500 mt-1">
                Your Databricks personal access token
              </p>
            </div>
            <Button
              onClick={() => {
                localStorage.setItem(`databricks-config-${workshopId}`, JSON.stringify({
                  workspace_url: databricksWorkspaceUrl,
                  token: databricksToken
                }));
                setShowDatabricksConfig(false);
              }}
              disabled={!databricksWorkspaceUrl || !databricksToken}
            >
              Save Configuration
            </Button>
          </CardContent>
        )}
      </Card>

      {error && (
        <Alert variant="destructive" className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}

      {/* Advance to Manage Workshop Data Button */}
      {isFacilitator && prompts.length > 0 && (
        <div className="mb-6 flex justify-end">
          <Button
            onClick={handleAdvanceToLogFeedback}
            className="bg-green-600 hover:bg-green-700 text-white"
            size="lg"
          >
            <MessageSquare className="h-4 w-4 mr-2" />
            Proceed to Manage Workshop Data
          </Button>
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6 h-[calc(100vh-200px)]">
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
                      setSelectedModel(getFrontendModelName(prompt.model_name));
                    }
                    // Clear evaluation state when switching prompts
                    setHasEvaluated(false);
                    setEvaluationError(null);
                    loadEvaluations(value);
                  }
                }}
              >
                <SelectTrigger className="w-full">
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
                            {prompt.model_name === 'demo' ? 'Demo' : getDisplayName(getFrontendModelName(prompt.model_name || ''))}
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
                <div>
                  <label className="text-sm font-medium text-gray-700 mb-2 block">Model Configuration</label>
                  <Select 
                    value={selectedModel} 
                    onValueChange={setSelectedModel}
                  >
                    <SelectTrigger className="w-full">
                      <SelectValue placeholder="Choose a judge model" />
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
                </div>
                
                <div className="space-y-2">
                  {/* Evaluate Current Textbox Content */}
                  <Button 
                    onClick={handleEvaluatePrompt}
                    disabled={!currentPrompt.trim() || isEvaluating}
                    variant="default"
                    className="w-full"
                    size="sm"
                  >
                    {isEvaluating ? (
                      <>
                        <Clock className="mr-2 h-4 w-4 animate-spin" />
                        Evaluating against {traces?.length || 0} traces...
                      </>
                    ) : (
                      <>
                        <Play className="mr-2 h-4 w-4" />
                        Evaluate Current Prompt
                      </>
                    )}
                  </Button>
                  
                  {/* Save to History (Only after evaluating modified prompt) */}
                  <Button 
                    onClick={handleSavePrompt}
                    disabled={!currentPrompt.trim() || isLoading || !isModified || !hasEvaluated}
                    variant="outline"
                    className={`w-full ${(!isModified || !hasEvaluated) ? 'opacity-50' : ''}`}
                    size="sm"
                    title={
                      !isModified ? "No changes to save" :
                      !hasEvaluated ? "Evaluate the modified prompt first" :
                      "Save as new version to prompt history"
                    }
                  >
                    {isLoading ? (
                      <>
                        <Clock className="mr-2 h-4 w-4 animate-spin" />
                        Saving...
                      </>
                    ) : (
                      <>
                        <Zap className="mr-2 h-4 w-4" />
                        Save as New Version
                      </>
                    )}
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

        </div>

        {/* Right Column - Evaluation Grid (2/3) */}
        <div className="lg:col-span-2 flex flex-col h-full">
          {/* Evaluation Error */}
          {evaluationError && (
            <Alert variant="destructive" className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                {evaluationError}
                <Button 
                  size="sm" 
                  variant="outline" 
                  onClick={() => handleEvaluatePrompt()} 
                  className="mt-2"
                >
                  Retry
                </Button>
              </AlertDescription>
            </Alert>
          )}

          {/* Databricks Configuration Warning */}
          {!mlflowConfig && selectedModel !== 'demo' && annotations.length > 0 && (
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

          {/* Performance Metrics Bar */}
          {metrics && (
            <div className="bg-white rounded-lg border p-4 mb-4">
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-6">
                  {/* Evaluation Mode Badge */}
                  <div>
                    <span className="text-sm text-gray-500">Mode</span>
                    <div className="flex items-center gap-2">
                      {selectedModel === 'demo' ? (
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                          <TestTube className="h-3 w-3 mr-1" />
                          Demo
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
                    </div>
                  </div>
                </div>
                <div className="flex items-center gap-2">
                  {[1, 2, 3, 4, 5].map(rating => (
                    <div key={rating} className="text-center">
                      <div className="text-xs text-gray-500">{rating}★</div>
                      <div className={`text-sm font-semibold ${
                        (metrics.agreement_by_rating[rating.toString()] || 0) >= 0.8 ? 'text-green-600' :
                        (metrics.agreement_by_rating[rating.toString()] || 0) >= 0.6 ? 'text-yellow-600' :
                        'text-red-600'
                      }`}>
                        {((metrics.agreement_by_rating[rating.toString()] || 0) * 100).toFixed(0)}%
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
            </div>
          )}

          {/* Evaluation Grid */}
          <Card className="flex-1 flex flex-col">
            <CardHeader className="pb-3">
              <div className="flex items-center justify-between">
                <CardTitle className="flex items-center gap-2 text-lg">
                  <Target className="h-4 w-4" />
                  Evaluation Results
                </CardTitle>
                <div className="flex items-center gap-2">
                  {evaluations.length > 0 && (
                    <>
                      {selectedModel === 'demo' ? (
                        <Badge variant="outline" className="bg-orange-50 text-orange-700 border-orange-200">
                          <TestTube className="h-3 w-3 mr-1" />
                          Demo Judge
                        </Badge>
                      ) : (
                        <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">
                          <Zap className="h-3 w-3 mr-1" />
                          {selectedModel.replace('databricks-', '').replace('openai-', '')}
                        </Badge>
                      )}
                      <Badge variant="outline">
                        {evaluations.length} evaluations
                      </Badge>
                    </>
                  )}
                </div>
              </div>
            </CardHeader>
            <CardContent className="flex-1 overflow-hidden p-0">
              {traces && traces.length > 0 && annotations && annotations.length > 0 ? (
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
                        const paginatedTraces = traces.slice(startIndex, endIndex);
                        
                        return paginatedTraces.map((trace: any, index: number) => {
                          // Find annotations for this trace and calculate mode (most common rating)
                          const traceAnnotations = annotations.filter(a => a.trace_id === trace.id);
                          const humanRating = traceAnnotations.length > 0 ? 
                            // Calculate mode (most common rating)
                            traceAnnotations.map(a => a.rating)
                              .sort((a, b) => traceAnnotations.filter(v => v.rating === b).length - traceAnnotations.filter(v => v.rating === a).length)[0]
                            : null;
                          
                          // Find evaluation for this trace
                          const evaluation = evaluations.find(e => e.trace_id === trace.id);
                          const judgeRating = evaluation?.predicted_rating;
                          
                          // Calculate diff and match if both ratings exist
                          const diff = humanRating && judgeRating ? Math.abs(judgeRating - humanRating) : null;
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
                                {humanRating ? (
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
                                {judgeRating ? (
                                  <span className={`inline-flex items-center justify-center w-8 h-8 rounded-full font-semibold ${
                                    diff === 0 ? 'bg-green-100 text-green-800' :
                                    diff === 1 ? 'bg-yellow-100 text-yellow-800' :
                                    diff && diff > 1 ? 'bg-red-100 text-red-800' :
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
                  {traces.length > itemsPerPage && (
                    <div className="border-t bg-gray-50 p-4">
                      <Pagination
                        currentPage={currentPage}
                        totalPages={Math.ceil(traces.length / itemsPerPage)}
                        totalItems={traces.length}
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
    </div>
  );
}