/**
 * IRRResultsDemo Component
 * 
 * Displays Inter-Rater Reliability results including Cohen's Kappa or 
 * Krippendorff's Alpha with interpretation, suggestions, and detailed analysis.
 */

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  BarChart3, 
  TrendingUp, 
  AlertCircle,
  CheckCircle,
  XCircle,
  Users,
  MessageCircle,
  RefreshCw,
  Info,
  Target,
  Award,
  Lightbulb,
  Brain,
  Download,
  FileText,
  ExternalLink,
  ChevronDown,
  ChevronUp
} from 'lucide-react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useIRR, useTraces, useAllTraces, useFacilitatorAnnotationsWithUserDetails, useWorkshop, useMLflowConfig, useRubric, useUpdateTraceAlignment } from '@/hooks/useWorkshopApi';
import { useUser, useRoleCheck } from '@/context/UserContext';
import { useWorkflowContext } from '@/context/WorkflowContext';
import { WorkshopsService } from '@/client';
import { useQueryClient } from '@tanstack/react-query';
import type { IRRResult } from '@/client';
import { TraceViewer } from '@/components/TraceViewer';
import { convertTraceToTraceData } from '@/utils/traceUtils';
import { toast } from 'sonner';
import { parseRubricQuestions as parseQuestions } from '@/utils/rubricUtils';
import { Switch } from '@/components/ui/switch';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { getModelOptions, getBackendModelName } from '@/utils/modelMapping';

// Parse rubric questions to get question IDs and titles
const parseRubricQuestions = (rubric: any) => {
  if (!rubric || !rubric.question) return [];
  
  return parseQuestions(rubric.question).map((q, index) => ({
    id: `${rubric.id}_${index}`,
    title: q.title,
    description: q.description,
    index
  }));
};

// Helper function to calculate real per-trace agreement from annotations for a specific metric
const calculateRealTraceAgreement = (traces: any[], annotations: any[], questionId: string | null = null) => {
  if (!traces || !annotations) return {};
  
  const traceAgreements: Record<string, { agreement: number, ratingCount: number }> = {};
  
  traces.forEach(trace => {
    const traceAnnotations = annotations.filter(ann => ann.trace_id === trace.id);
    
    if (traceAnnotations.length >= 2) {
      // Get ratings for the specific question or legacy rating
      const ratings = traceAnnotations.map(ann => {
        if (questionId && ann.ratings && ann.ratings[questionId] !== undefined) {
          return ann.ratings[questionId];
        }
        return ann.rating; // Fallback to legacy rating
      }).filter(r => r !== undefined && r !== null);
      
      if (ratings.length < 2) return; // Skip if not enough ratings for this metric
      
      // Calculate mean and standard deviation
      const mean = ratings.reduce((sum, r) => sum + r, 0) / ratings.length;
      const variance = ratings.reduce((sum, r) => sum + Math.pow(r - mean, 2), 0) / ratings.length;
      const stdDev = Math.sqrt(variance);
      
      // Just use standard deviation directly - simple!
      traceAgreements[trace.id] = {
        agreement: stdDev,  // Lower is better (0 = perfect agreement)
        ratingCount: ratings.length
      };
    }
  });
  
  return traceAgreements;
};

// Helper function to sort traces by disagreement (most disagreement first) 
const sortTracesByDisagreement = (traceAgreements: Record<string, { agreement: number, ratingCount: number }>) => {
  return Object.entries(traceAgreements)
    .sort(([, a], [, b]) => b.agreement - a.agreement) // Higher stdDev = more disagreement
    .reduce((sorted, [key, value]) => ({ ...sorted, [key]: value }), {});
};

// Mock IRR result data
const mockIRRResult = {
  workshop_id: "workshop_123",
  score: 0.75,
  ready_to_proceed: true,
  calculated_at: new Date().toISOString(),
  details: {
    metric_used: "Krippendorff's Alpha",
    interpretation: "Substantial agreement",
    num_raters: 3,
    num_traces: 5,
    num_annotations: 45,
    completeness: 0.95,
    missing_data: false,
    suggestions: [
      "Current reliability is acceptable for proceeding with evaluation",
      "Consider increasing sample size for more robust results",
      "Monitor consistency across different types of traces"
    ],
    analysis: {
      rater_consistency: {
        "SME_1": { consistency: 0.82, annotations: 15 },
        "SME_2": { consistency: 0.78, annotations: 15 },
        "Participant_1": { consistency: 0.69, annotations: 15 }
      },
      trace_difficulty: {
        "trace_1": { agreement: 0.89, difficulty: "Easy" },
        "trace_2": { agreement: 0.76, difficulty: "Medium" },
        "trace_3": { agreement: 0.45, difficulty: "Hard" },
        "trace_4": { agreement: 0.82, difficulty: "Medium" },
        "trace_5": { agreement: 0.91, difficulty: "Easy" }
      },
      question_reliability: {
        "Response Accuracy": { agreement: 0.78, variance: 0.45 },
        "Response Helpfulness": { agreement: 0.72, variance: 0.52 },
        "Response Clarity": { agreement: 0.81, variance: 0.38 }
      }
    },
    problematic_patterns: [
      "Trace 3 shows low agreement (0.45) - may need clarification",
      "Participant_1 shows lower consistency - may need additional training"
    ]
  }
};


interface IRRResultsProps {
  workshopId?: string;
}

export function IRRResultsDemo({ workshopId }: IRRResultsProps) {
  const { workshopId: contextWorkshopId } = useWorkshopContext();
  const activeWorkshopId = workshopId || contextWorkshopId;
  const { isFacilitator } = useRoleCheck();
  const { markPhaseComplete } = useWorkflowContext();
  const queryClient = useQueryClient();
  const [isAdvancing, setIsAdvancing] = useState(false);
  
  const [expandedTraces, setExpandedTraces] = useState<Set<string>>(new Set());
  
  const { data: irrResult, isLoading: irrLoading, error: irrError, refetch: refetchIRR } = useIRR(activeWorkshopId!);
  const { data: workshop } = useWorkshop(activeWorkshopId!);
  const { data: rubric } = useRubric(activeWorkshopId!);
  // Use all traces for IRR results (facilitator view)
  const { data: traces, refetch: refetchTraces } = useAllTraces(activeWorkshopId!);
  const { data: annotations } = useFacilitatorAnnotationsWithUserDetails(activeWorkshopId!);
  // Get MLflow configuration for dynamic URL construction
  const { data: mlflowConfig } = useMLflowConfig(activeWorkshopId!);
  
  // Alignment hooks
  const updateTraceAlignment = useUpdateTraceAlignment(activeWorkshopId!);
  
  // Parse rubric questions
  const rubricQuestions = rubric ? parseRubricQuestions(rubric) : [];
  
  // Extract per-metric scores from IRR result
  const perMetricScores = irrResult?.details?.per_metric_scores || {};
  const hasMetrics = Object.keys(perMetricScores).length > 0;
  
  // Traces start collapsed by default
  
  
  
  // Get metric names mapped to question titles
  const metricDisplayNames: Record<string, string> = {};
  rubricQuestions.forEach((q: any) => {
    metricDisplayNames[q.id] = q.title;
  });
  
  // Set active tab to first metric by default
  const [activeTab, setActiveTab] = useState("");
  
  // Update active tab when metrics load
  React.useEffect(() => {
    const firstMetricId = Object.keys(perMetricScores)[0];
    if (firstMetricId && !activeTab) {
      setActiveTab(`metric-${firstMetricId}`);
      
    }
  }, [perMetricScores, activeTab]);
  
  const handleAdvanceToJudgeTuning = async () => {
    if (!activeWorkshopId) return;
    
    
    
    setIsAdvancing(true);
    try {
      await WorkshopsService.advanceToJudgeTuningWorkshopsWorkshopIdAdvanceToJudgeTuningPost(activeWorkshopId);
      
      // Mark results phase as completed
      
      markPhaseComplete('results');
      
      // Invalidate workshop query to refresh phase
      queryClient.invalidateQueries({ queryKey: ['workshop', activeWorkshopId] });
      
      // The navigation will be handled by the WorkshopDemoLanding component
      // when it detects the phase change
    } catch (error) {
      
      
    } finally {
      setIsAdvancing(false);
    }
  };

  const exportResultsAsJSON = () => {
    if (!irrResult) return;

    const exportData = {
      workshop_id: activeWorkshopId,
      workshop_name: workshop?.name || 'Unknown Workshop',
      exported_at: new Date().toISOString(),
      irr_analysis: irrResult,
      metadata: {
        export_type: 'irr_results',
        workshop_phase: workshop?.current_phase,
        total_annotations: irrResult.details?.num_annotations || 0,
        total_traces: irrResult.details?.num_traces || 0,
        total_raters: irrResult.details?.num_raters || 0
      }
    };

    const blob = new Blob([JSON.stringify(exportData, null, 2)], { 
      type: 'application/json' 
    });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `irr_results_${activeWorkshopId?.slice(0, 8)}_${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const handleRecalculateIRR = async () => {
    if (!activeWorkshopId) return;
    
    // Use toast.promise to handle loading/success/error states automatically
    toast.promise(
      refetchIRR(),
      {
        loading: 'Recalculating IRR...',
        success: 'IRR recalculated successfully!',
        error: 'Failed to recalculate IRR',
      }
    );
  };

  // (Evaluation/alignment controls have moved to Judge Tuning)

  const toggleTraceExpanded = (traceId: string) => {
    const newExpanded = new Set(expandedTraces);
    if (newExpanded.has(traceId)) {
      newExpanded.delete(traceId);
    } else {
      newExpanded.add(traceId);
    }
    setExpandedTraces(newExpanded);
  };

  const exportResultsAsText = () => {
    if (!irrResult) return;

    const details = irrResult.details;
    const content = `
# Inter-Rater Reliability Analysis Report
Generated: ${new Date().toLocaleString()}
Workshop ID: ${activeWorkshopId}
Workshop Name: ${workshop?.name || 'Unknown Workshop'}

## Summary
${details?.metric_used}: ${irrResult.score.toFixed(3)}
Interpretation: ${details?.interpretation}
Ready to Proceed: ${irrResult.ready_to_proceed ? 'Yes' : 'No'}

## Data Overview
- Number of Raters: ${details?.num_raters || 0}
- Number of Traces: ${details?.num_traces || 0}
- Total Annotations: ${details?.num_annotations || 0}
- Data Completeness: ${((details?.completeness || 0) * 100).toFixed(1)}%

## Key Insights
${details?.suggestions?.map((suggestion: string, index: number) => `${index + 1}. ${suggestion}`).join('\n') || 'No suggestions available'}

## Identified Issues
${details?.problematic_patterns?.map((pattern: string, index: number) => `${index + 1}. ${pattern}`).join('\n') || 'No issues identified'}

---
Report generated by Databricks LLM-Judge Builder Workshop
    `.trim();

    const blob = new Blob([content], { type: 'text/plain' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `irr_analysis_report_${activeWorkshopId?.slice(0, 8)}_${new Date().toISOString().split('T')[0]}.txt`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };
  
  // Check if IRR result indicates insufficient data
  const hasInsufficientData = irrResult && irrResult.details && 'error' in irrResult.details;
  
  // Check if workshop is already in judge_tuning phase
  const isAlreadyInJudgeTuning = workshop?.current_phase === 'judge_tuning';
  
  // Mark results phase as completed if workshop is in judge_tuning phase
  useEffect(() => {
    if (isAlreadyInJudgeTuning) {
      
      markPhaseComplete('results');
    }
  }, [isAlreadyInJudgeTuning, markPhaseComplete]);
  
  // Use mock data as fallback for demo purposes or when insufficient data
  const result = (irrResult && !hasInsufficientData) ? irrResult : mockIRRResult;

  const getScoreColor = (score: number) => {
    if (score >= 0.8) return "text-green-600";
    if (score >= 0.6) return "text-yellow-600";
    return "text-red-600";
  };

  const getScoreBadgeColor = (score: number) => {
    if (score >= 0.8) return "bg-green-100 text-green-800";
    if (score >= 0.6) return "bg-yellow-100 text-yellow-800";
    return "bg-red-100 text-red-800";
  };

  const getInterpretationIcon = (readyToProceed: boolean) => {
    return readyToProceed ? (
      <CheckCircle className="h-5 w-5 text-green-600" />
    ) : (
      <XCircle className="h-5 w-5 text-red-600" />
    );
  };

  if (irrLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium text-gray-600 mb-2">Loading IRR results...</div>
          <div className="text-sm text-gray-500">Calculating inter-rater reliability</div>
        </div>
      </div>
    );
  }

  if (irrError) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <div className="text-lg font-medium text-gray-900 mb-2">Failed to load IRR results</div>
          <div className="text-sm text-gray-500">
            {irrError ? 'Error loading data from API' : 'Please check your connection and try again'}
          </div>
        </div>
      </div>
    );
  }

  // Show insufficient data message if needed
  if (hasInsufficientData) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <AlertCircle className="h-12 w-12 text-yellow-500 mx-auto mb-4" />
          <div className="text-lg font-medium text-gray-900 mb-2">Insufficient Data for IRR Calculation</div>
          <div className="text-sm text-gray-500 mb-4">
            {irrResult?.details?.error || 'Need more annotations to calculate inter-rater reliability'}
          </div>
          <div className="text-sm text-gray-600">
            <p>Complete the annotation phase to view IRR results.</p>
            <p className="mt-2">Current annotations: {irrResult?.details?.num_annotations || 0}</p>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">
            LLM Judge Calibration Workshop
          </h1>
          <p className="text-lg text-gray-600">
            Inter-Rater Reliability Results
          </p>
          <div className="mt-2 space-x-2">
            <Badge variant="outline">
              Facilitator View
            </Badge>
            {(!irrResult || hasInsufficientData) && (
              <Badge variant="outline" className="bg-amber-50 text-amber-700 border-amber-200">
                <Info className="h-3 w-3 mr-1" />
                Demo Data
              </Badge>
            )}
          </div>
        </div>

        {/* Header with Actions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                IRR Results Summary
              </span>
              <div className="flex items-center gap-2">
                <Button variant="outline" size="sm" onClick={exportResultsAsText}>
                  <FileText className="h-4 w-4 mr-2" />
                  Save Report
                </Button>
                <Button variant="outline" size="sm" onClick={exportResultsAsJSON}>
                  <Download className="h-4 w-4 mr-2" />
                  Export Data
                </Button>
                <Button variant="outline" size="sm" onClick={handleRecalculateIRR}>
                  <RefreshCw className="h-4 w-4 mr-2" />
                  Recalculate
                </Button>
              </div>
            </CardTitle>
            <CardDescription>
              Krippendorff's Alpha calculated separately for each evaluation criterion
            </CardDescription>
          </CardHeader>
        </Card>

        {/* Metric Analysis Tabs */}
        <Tabs value={activeTab} onValueChange={setActiveTab}>
          <TabsList className={`grid w-full ${
            Object.keys(perMetricScores).length === 1 
              ? 'grid-cols-1' 
              : Object.keys(perMetricScores).length === 2
              ? 'grid-cols-2'
              : Object.keys(perMetricScores).length === 3
              ? 'grid-cols-3'
              : Object.keys(perMetricScores).length === 4
              ? 'grid-cols-4'
              : Object.keys(perMetricScores).length === 5
              ? 'grid-cols-5'
              : Object.keys(perMetricScores).length === 6
              ? 'grid-cols-6'
              : 'grid-cols-4' // For 7+ metrics, use scrollable 4-column layout
          } ${Object.keys(perMetricScores).length > 6 ? 'overflow-x-auto' : ''}`}>
            {hasMetrics && Object.keys(perMetricScores).map((metricId) => (
              <TabsTrigger key={metricId} value={`metric-${metricId}`}>
                {metricDisplayNames[metricId] || metricId}
              </TabsTrigger>
            ))}
          </TabsList>

          {/* Individual Metric Tabs */}
          {hasMetrics && Object.entries(perMetricScores).map(([metricId, metricData]: [string, any]) => (
            <TabsContent key={metricId} value={`metric-${metricId}`} className="space-y-4">
              {/* Metric Summary Card */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <Target className="h-5 w-5" />
                    {metricDisplayNames[metricId] || metricId}
                  </CardTitle>
                  <CardDescription>
                    {rubricQuestions.find((q: any) => q.id === metricId)?.description || 'Inter-rater reliability for this evaluation criterion'}
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                    {/* Score Display */}
                    <div className="text-center">
                      <div className="mb-2">
                        <span className="text-sm font-medium text-gray-600">
                          Krippendorff's Alpha
                        </span>
                      </div>
                      <div className={`text-4xl font-bold ${getScoreColor(metricData.score)}`}>
                        {metricData.score.toFixed(3)}
                      </div>
                      <div className="mt-2">
                        <Badge className={getScoreBadgeColor(metricData.score)}>
                          {metricData.interpretation}
                        </Badge>
                      </div>
                    </div>

                    {/* Status */}
                    <div className="text-center">
                      <div className="mb-2">
                        <span className="text-sm font-medium text-gray-600">
                          Status
                        </span>
                      </div>
                      <div className="flex items-center justify-center gap-2 mb-2">
                        {getInterpretationIcon(metricData.acceptable)}
                        <span className={`font-medium ${metricData.acceptable ? 'text-green-600' : 'text-red-600'}`}>
                          {metricData.acceptable ? 'Acceptable' : 'Needs Improvement'}
                        </span>
                      </div>
                      <div className="text-sm text-gray-500">
                        {metricData.acceptable 
                          ? 'Reliability is sufficient for this criterion'
                          : 'Consider additional calibration for this criterion'}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>

              {/* Recommendations and Issues for this Metric */}
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {/* Recommendations - Per Metric */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <Lightbulb className="h-5 w-5 text-yellow-600" />
                      Recommendations
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(metricData.suggestions || []).length > 0 ? (
                      <div className="space-y-3">
                        {(metricData.suggestions || []).map((suggestion: string, index: number) => (
                          <div key={index} className="flex items-start gap-2">
                            <Target className="h-4 w-4 text-blue-600 mt-0.5 flex-shrink-0" />
                            <span className="text-sm text-gray-700">{suggestion}</span>
                          </div>
                        ))}
                      </div>
                    ) : metricData.score >= 0.3 ? (
                      <div className="flex flex-col items-center justify-center py-4 text-center">
                        <CheckCircle className="h-8 w-8 text-green-500 mb-2" />
                        <span className="text-sm text-gray-600">Agreement is acceptable for this criterion</span>
                      </div>
                    ) : (
                      <div className="flex flex-col items-center justify-center py-4 text-center">
                        <AlertCircle className="h-8 w-8 text-orange-500 mb-2" />
                        <span className="text-sm text-gray-600">
                          {metricData.score < 0 
                            ? 'Systematic disagreement detected - raters may be interpreting the scale differently'
                            : 'Low agreement - consider additional calibration'}
                        </span>
                      </div>
                    )}
                  </CardContent>
                </Card>

                {/* Issues */}
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <AlertCircle className="h-5 w-5 text-orange-600" />
                      Identified Issues
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    {(result.details?.problematic_patterns || []).length > 0 ? (
                      <div className="space-y-3">
                        {(result.details?.problematic_patterns || []).map((pattern: string, index: number) => (
                          <div key={index} className="flex items-start gap-2">
                            <Info className="h-4 w-4 text-orange-600 mt-0.5 flex-shrink-0" />
                            <span className="text-sm text-gray-700">{pattern}</span>
                          </div>
                        ))}
                      </div>
                    ) : (
                      <div className="text-center py-4 text-gray-500">
                        <CheckCircle className="h-8 w-8 mx-auto mb-2 text-green-600" />
                        <p>No significant issues detected</p>
                      </div>
                    )}
                  </CardContent>
                </Card>
              </div>

              {/* Trace Analysis for this Metric */}
              {(() => {
                // Calculate trace agreement from actual annotations for this specific metric
                const realTraceAgreements = calculateRealTraceAgreement(traces, annotations, metricId);
                const hasTraceData = Object.keys(realTraceAgreements).length > 0;
                
                return hasTraceData ? (
                  <Card>
                    <CardHeader>
                      <CardTitle className="flex items-center gap-2">
                        <MessageCircle className="h-5 w-5" />
                        Traces by Disagreement Level - {metricDisplayNames[metricId] || metricId}
                      </CardTitle>
                      <CardDescription>
                        Traces sorted by disagreement level for this specific criterion (most disagreement first).
                      </CardDescription>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-3">
                        {/* Summary of problematic traces for this metric */}
                        {(() => {
                          const highDisagreementTraces = Object.entries(realTraceAgreements)
                            .filter(([, data]) => data.agreement > 1.5)
                            .sort(([, a], [, b]) => b.agreement - a.agreement);
                          
                          if (highDisagreementTraces.length > 0) {
                            return (
                              <div className="mb-4 p-4 bg-red-50 border border-red-200 rounded-lg">
                                <div className="flex items-center gap-2 mb-2">
                                  <AlertCircle className="h-4 w-4 text-red-600" />
                                  <span className="font-medium text-red-800">Priority Discussion Needed</span>
                                </div>
                                <p className="text-sm text-red-700 mb-2">
                                  {highDisagreementTraces.length} trace{highDisagreementTraces.length !== 1 ? 's' : ''} with high disagreement (σ &gt; 1.5) for {metricDisplayNames[metricId] || metricId}:
                                </p>
                                <div className="space-y-1">
                                  {highDisagreementTraces.slice(0, 3).map(([traceId, data]) => (
                                    <div key={traceId} className="flex items-center justify-between text-xs">
                                      <span className="text-red-700">
                                        Trace {traceId.slice(0, 8)}... - σ = {data.agreement.toFixed(2)}
                                      </span>
                                      <Button
                                        variant="ghost"
                                        size="sm"
                                        className="h-6 px-2 text-red-600 hover:text-red-800"
                                        onClick={() => {
                                          const element = document.getElementById(`trace-${metricId}-${traceId}`);
                                          if (element) {
                                            element.scrollIntoView({ behavior: 'smooth' });
                                            setExpandedTraces(prev => new Set([...prev, `${metricId}-${traceId}`]));
                                          }
                                        }}
                                      >
                                        View
                                      </Button>
                                    </div>
                                  ))}
                                  {highDisagreementTraces.length > 3 && (
                                    <div className="text-xs text-red-600 italic">
                                      ...and {highDisagreementTraces.length - 3} more
                                    </div>
                                  )}
                                </div>
                              </div>
                            );
                          }
                          return null;
                        })()}

                        {Object.entries(sortTracesByDisagreement(realTraceAgreements)).map(([traceId, data]) => {
                          const trace = traces?.find((t: any) => t.id === traceId);
                          const stdDev = (data as any).agreement;
                          
                          const getHeatMapColor = (stdDev: number) => {
                            if (stdDev < 0.5) return 'bg-green-500';
                            if (stdDev < 1.0) return 'bg-green-400';
                            if (stdDev < 1.5) return 'bg-yellow-400';
                            if (stdDev < 2.0) return 'bg-orange-400';
                            return 'bg-red-500';
                          };
                          
                          const getTextColor = (stdDev: number) => {
                            if (stdDev < 0.5) return 'text-green-700';
                            if (stdDev < 1.0) return 'text-green-600';
                            if (stdDev < 1.5) return 'text-yellow-700';
                            if (stdDev < 2.0) return 'text-orange-700';
                            return 'text-red-700';
                          };
                          
                          const traceAnnotations = annotations?.filter((ann: any) => ann.trace_id === traceId) || [];
                          const isExpanded = expandedTraces.has(`${metricId}-${traceId}`);
                          
                          // Calculate rating distribution for this specific metric
                          const ratingCounts = [0, 0, 0, 0, 0];
                          traceAnnotations.forEach((ann: any) => {
                            const rating = ann.ratings && ann.ratings[metricId] !== undefined 
                              ? ann.ratings[metricId] 
                              : ann.rating;
                            if (rating >= 1 && rating <= 5) {
                              ratingCounts[rating - 1]++;
                            }
                          });
                          
                          return (
                            <div key={traceId} id={`trace-${metricId}-${traceId}`} className={`border rounded-lg p-4 ${stdDev > 1.5 ? 'border-orange-300 bg-orange-50' : stdDev > 1.0 ? 'border-yellow-300 bg-yellow-50' : 'border-gray-200 bg-white'}`}>
                              <div 
                                className="flex items-center justify-between cursor-pointer hover:opacity-80"
                                onClick={() => {
                                  const newExpanded = new Set(expandedTraces);
                                  const key = `${metricId}-${traceId}`;
                                  if (newExpanded.has(key)) {
                                    newExpanded.delete(key);
                                  } else {
                                    newExpanded.add(key);
                                  }
                                  setExpandedTraces(newExpanded);
                                }}
                              >
                                <span className="font-medium flex items-center gap-2">
                                  <MessageCircle className="h-4 w-4" />
                                  Trace {(trace?.mlflow_trace_id || traceId).slice(0, 20)}...
                                  {stdDev > 1.5 && (
                                    <Badge className="bg-red-500 text-white text-xs">
                                      High Disagreement
                                    </Badge>
                                  )}
                                  {trace?.include_in_alignment === false && (
                                    <Badge variant="outline" className="bg-gray-100 text-gray-600 border-gray-200 text-xs">
                                      Excluded
                                    </Badge>
                                  )}
                                  {isExpanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
                                </span>
                                <div className="flex items-center gap-2">
                                  {trace?.mlflow_trace_id && (
                                    <Button 
                                      variant="ghost" 
                                      size="sm"
                                      className="h-7 px-2"
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        if (trace.mlflow_url) {
                                          window.open(trace.mlflow_url, '_blank');
                                        } else if (mlflowConfig) {
                                          const baseUrl = mlflowConfig.databricks_host;
                                          const experimentId = mlflowConfig.experiment_id;
                                          const traceUrl = `${baseUrl}/ml/experiments/${experimentId}/traces?selectedEvaluationId=${trace.mlflow_trace_id}`;
                                          window.open(traceUrl, '_blank');
                                        } else {
                                          
                                          toast.error('MLflow configuration not available');
                                        }
                                      }}
                                    >
                                      <ExternalLink className="h-3 w-3 mr-1" />
                                      MLflow
                                    </Button>
                                  )}
                                  <Badge variant="outline" className="text-xs">
                                    {(data as any).ratingCount} ratings
                                  </Badge>
                                  <Badge className={`${getHeatMapColor(stdDev)} text-white`}>
                                    σ = {stdDev.toFixed(2)}
                                  </Badge>
                                </div>
                              </div>
                              
                              <div className="w-full bg-gray-200 rounded-full h-3 mt-2 overflow-hidden">
                                <div 
                                  className={`h-3 transition-all duration-300 ${getHeatMapColor(stdDev)}`}
                                  style={{ width: `${Math.max(5, 100 - (stdDev * 40))}%` }}
                                />
                              </div>
                              
                              <div className={`text-xs mt-1 ${getTextColor(stdDev)}`}>
                                {stdDev < 0.5 && '✓ Perfect agreement'}
                                {stdDev >= 0.5 && stdDev < 1.0 && '✓ Good agreement'}
                                {stdDev >= 1.0 && stdDev < 1.5 && '~ Moderate disagreement'}
                                {stdDev >= 1.5 && stdDev < 2.0 && '⚠️ High disagreement - discuss'}
                                {stdDev >= 2.0 && '⚠️ Very high disagreement - priority discussion'}
                              </div>
                              
                              {isExpanded && (
                                <div className="mt-3 pt-3 border-t border-gray-200">
                                  <div className="text-sm font-medium mb-2">Rating Details for {metricDisplayNames[metricId] || metricId}:</div>
                                  
                                  {/* Dot plot visualization */}
                                  <div className="flex items-center gap-2 mb-3">
                                    {[1, 2, 3, 4, 5].map(rating => (
                                      <div key={rating} className="flex flex-col items-center">
                                        <div className="flex flex-wrap justify-center gap-0.5 min-h-[20px] mb-1">
                                          {traceAnnotations
                                            .filter((ann: any) => {
                                              const annRating = ann.ratings && ann.ratings[metricId] !== undefined 
                                                ? ann.ratings[metricId] 
                                                : ann.rating;
                                              return annRating === rating;
                                            })
                                            .map((ann: any, idx: number) => (
                                              <div
                                                key={idx}
                                                className={`w-2 h-2 rounded-full ${
                                                  rating <= 2 ? 'bg-red-400' : 
                                                  rating === 3 ? 'bg-yellow-400' : 
                                                  'bg-green-400'
                                                }`}
                                                title={ann.user_name || ann.user_id}
                                              />
                                            ))
                                          }
                                        </div>
                                        <span className="text-xs font-medium">{rating}</span>
                                      </div>
                                    ))}
                                  </div>
                                  
                                  {/* Annotator list with their ratings */}
                                  <div className="space-y-1">
                                    {traceAnnotations.map((ann: any, idx: number) => {
                                      const annRating = ann.ratings && ann.ratings[metricId] !== undefined 
                                        ? ann.ratings[metricId] 
                                        : ann.rating;
                                      
                                      // Enhanced debug logging for per-metric ratings
                                      
                                      
                                      return (
                                        <div key={idx} className="flex items-center justify-between text-xs text-gray-600">
                                          <span>{ann.user_name || ann.user_id}:</span>
                                          <div className="flex items-center gap-1">
                                            <span className="font-medium">{annRating}</span>
                                            <div className={`w-2 h-2 rounded-full ${
                                              annRating <= 2 ? 'bg-red-400' : 
                                              annRating === 3 ? 'bg-yellow-400' : 
                                              'bg-green-400'
                                            }`} />
                                          </div>
                                        </div>
                                      );
                                    })}
                                  </div>

                                  {/* Alignment Toggle */}
                                  {isFacilitator && trace && (
                                    <div className="mt-4 p-4 bg-blue-50 border border-blue-200 rounded-lg">
                                      <div className="flex items-center justify-between">
                                        <div>
                                          <div className="text-sm font-medium text-blue-900">
                                            Include in Judge Alignment
                                          </div>
                                          <div className="text-xs text-blue-700 mt-1">
                                            {stdDev > 1.5 
                                              ? 'High disagreement detected. Consider excluding from alignment.'
                                              : 'This trace will be used to train the AI judge.'}
                                          </div>
                                        </div>
                                        <div className="flex items-center gap-3">
                                          <Switch
                                            checked={trace.include_in_alignment !== false}
                                            onCheckedChange={(checked) => {
                                              updateTraceAlignment.mutate(
                                                { traceId: trace.id, includeInAlignment: checked },
                                                {
                                                  onSuccess: () => {
                                                    toast.success(checked 
                                                      ? 'Trace will be included in alignment' 
                                                      : 'Trace excluded from alignment');
                                                    refetchTraces();
                                                  },
                                                  onError: () => {
                                                    toast.error('Failed to update alignment setting');
                                                  }
                                                }
                                              );
                                            }}
                                            disabled={updateTraceAlignment.isPending}
                                          />
                                          <Badge 
                                            variant="outline" 
                                            className={trace.include_in_alignment !== false 
                                              ? 'bg-green-100 text-green-800 border-green-200' 
                                              : 'bg-gray-100 text-gray-600 border-gray-200'}
                                          >
                                            {trace.include_in_alignment !== false ? 'Included' : 'Excluded'}
                                          </Badge>
                                        </div>
                                      </div>
                                    </div>
                                  )}

                                  {/* Trace Content */}
                                  {trace && (
                                    <div className="mt-4 p-4 bg-gray-50 rounded-lg">
                                      <div className="text-sm font-medium mb-3 text-gray-700">
                                        Trace Content - What the annotators are rating:
                                      </div>
                                      <TraceViewer trace={convertTraceToTraceData(trace)} />
                                    </div>
                                  )}
                                </div>
                              )}
                            </div>
                          );
                        })}
                      </div>
                    </CardContent>
                  </Card>
                ) : (
                  <Card>
                    <CardHeader>
                      <CardTitle>Trace Analysis - {metricDisplayNames[metricId] || metricId}</CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="text-center py-4 text-gray-500">
                        <Info className="h-8 w-8 mx-auto mb-2 text-blue-600" />
                        <p>No trace data available for this metric</p>
                      </div>
                    </CardContent>
                  </Card>
                );
              })()}
            </TabsContent>
          ))}
        </Tabs>

        {/* Next Steps */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Award className="h-5 w-5 text-green-600" />
              Next Steps
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className={`p-4 rounded-lg border-2 ${
              isAlreadyInJudgeTuning
                ? 'border-blue-200 bg-blue-50'
                : (result.ready_to_proceed 
                  ? 'border-green-200 bg-green-50' 
                  : 'border-yellow-200 bg-yellow-50')
            }`}>
              <div className="flex items-center gap-3">
                <div className="flex-1">
                  <p className={`text-sm font-medium mb-1 ${
                    isAlreadyInJudgeTuning ? 'text-blue-800' : (result.ready_to_proceed ? 'text-green-800' : 'text-yellow-800')
                  }`}>
                    {isAlreadyInJudgeTuning 
                      ? 'Workshop in Judge Tuning Phase' 
                      : (result.ready_to_proceed 
                        ? 'Workshop Complete - Ready for Evaluation' 
                        : 'Additional Calibration Recommended')
                    }
                  </p>
                  <p className={`text-sm ${
                    isAlreadyInJudgeTuning ? 'text-blue-700' : (result.ready_to_proceed ? 'text-green-700' : 'text-yellow-700')
                  }`}>
                    {isAlreadyInJudgeTuning 
                      ? 'The workshop has advanced to the judge tuning phase where AI judges can be created and evaluated.'
                      : (result.ready_to_proceed 
                        ? 'The inter-rater reliability is sufficient to proceed with confident evaluation of LLM outputs.'
                        : 'Consider additional training or rubric refinement before proceeding with evaluation.')
                    }
                  </p>
                </div>
                {isFacilitator ? (
                  <div className="flex flex-col gap-2">
                    {!isAlreadyInJudgeTuning ? (
                      <>
                        <Button 
                          className="flex items-center gap-2"
                          onClick={handleAdvanceToJudgeTuning}
                          disabled={isAdvancing}
                        >
                          {isAdvancing ? (
                            <>
                              <RefreshCw className="h-4 w-4 animate-spin" />
                              Advancing...
                            </>
                          ) : (
                            <>
                              Proceed to Judge Tuning
                              <Brain className="h-4 w-4" />
                            </>
                          )}
                        </Button>
                        <p className="text-xs text-gray-600 text-center">
                          Create AI judges from annotation data
                        </p>
                      </>
                    ) : (
                      <>
                        <Button className="flex items-center gap-2" disabled>
                          Workshop in Judge Tuning Phase
                          <CheckCircle className="h-4 w-4" />
                        </Button>
                        <p className="text-xs text-gray-600 text-center">
                          Judge tuning phase is active
                        </p>
                      </>
                    )}
                  </div>
                ) : (
                  <Button className="flex items-center gap-2" disabled>
                    {result.ready_to_proceed ? 'Workshop Complete' : 'Continue Calibration'}
                    <CheckCircle className="h-4 w-4" />
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}