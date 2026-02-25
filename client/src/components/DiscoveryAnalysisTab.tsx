/**
 * DiscoveryAnalysisTab Component
 *
 * Allows facilitators to trigger AI analysis of discovery feedback,
 * view findings, disagreements, and previous analysis history.
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Play,
  FileText,
  AlertTriangle,
  AlertCircle,
  Info,
  Clock,
  Users,
  ChevronDown,
  ChevronRight,
  Loader2,
} from 'lucide-react';
import { getModelOptions, getBackendModelName } from '@/utils/modelMapping';
import {
  useDiscoveryAnalyses,
  useRunDiscoveryAnalysis,
  type DiscoveryAnalysis,
} from '@/hooks/useWorkshopApi';
import { useQuery } from '@tanstack/react-query';
import { toast } from 'sonner';

interface DiscoveryAnalysisTabProps {
  workshopId: string;
}

export const DiscoveryAnalysisTab: React.FC<DiscoveryAnalysisTabProps> = ({ workshopId }) => {
  const [template, setTemplate] = useState<string>('evaluation_criteria');
  const [modelName, setModelName] = useState<string>('Claude Sonnet 4.5');
  const [selectedAnalysisId, setSelectedAnalysisId] = useState<string | null>(null);

  // Check if Databricks is configured (mlflow config exists)
  const { data: mlflowConfig } = useQuery({
    queryKey: ['mlflowConfig', workshopId],
    queryFn: async () => {
      const response = await fetch(`/workshops/${workshopId}/mlflow-config`);
      if (!response.ok) return null;
      return response.json();
    },
    enabled: !!workshopId,
  });

  const hasMlflowConfig = !!mlflowConfig;
  const modelOptions = getModelOptions(hasMlflowConfig);

  const { data: analyses, isLoading: analysesLoading } = useDiscoveryAnalyses(workshopId);
  const runAnalysis = useRunDiscoveryAnalysis(workshopId);

  // Current analysis = selected from history, or latest
  const currentAnalysis: DiscoveryAnalysis | null = selectedAnalysisId
    ? analyses?.find((a) => a.id === selectedAnalysisId) ?? null
    : analyses?.[0] ?? null;

  const handleRunAnalysis = () => {
    const backendModel = getBackendModelName(modelName);
    runAnalysis.mutate(
      { template, model: backendModel },
      {
        onSuccess: (result) => {
          toast.success('Analysis completed successfully');
          setSelectedAnalysisId(result.id);
        },
        onError: (error) => {
          toast.error(error.message || 'Analysis failed');
        },
      }
    );
  };

  return (
    <div className="space-y-6">
      {/* Analysis Controls */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Play className="w-5 h-5 text-emerald-600" />
            Run Discovery Analysis
          </CardTitle>
          <CardDescription>
            Aggregate participant feedback, detect disagreements, and distill findings using AI
          </CardDescription>
        </CardHeader>
        <CardContent>
          <div className="flex flex-wrap items-end gap-4">
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Analysis Template</label>
              <Select value={template} onValueChange={setTemplate}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="evaluation_criteria">Evaluation Criteria</SelectItem>
                  <SelectItem value="themes_patterns">Themes &amp; Patterns</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700">Model</label>
              <Select value={modelName} onValueChange={setModelName}>
                <SelectTrigger className="w-56">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {modelOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value} disabled={opt.disabled}>
                      {opt.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>

            <Button
              onClick={handleRunAnalysis}
              disabled={runAnalysis.isPending || !hasMlflowConfig}
              className="bg-emerald-600 hover:bg-emerald-700"
            >
              {runAnalysis.isPending ? (
                <>
                  <Loader2 className="w-4 h-4 mr-2 animate-spin" />
                  Analyzing...
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 mr-2" />
                  Run Analysis
                </>
              )}
            </Button>

            {/* History dropdown */}
            {analyses && analyses.length > 0 && (
              <div className="space-y-1.5">
                <label className="text-sm font-medium text-slate-700">History</label>
                <Select
                  value={selectedAnalysisId ?? analyses[0]?.id ?? ''}
                  onValueChange={(id) => setSelectedAnalysisId(id)}
                >
                  <SelectTrigger className="w-64">
                    <SelectValue placeholder="Select analysis run" />
                  </SelectTrigger>
                  <SelectContent>
                    {analyses.map((a, i) => (
                      <SelectItem key={a.id} value={a.id}>
                        {i === 0 ? 'Latest' : `Run ${analyses.length - i}`} — {a.template_used === 'evaluation_criteria' ? 'Eval Criteria' : 'Themes'} ({new Date(a.created_at).toLocaleString()})
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </div>

          {!hasMlflowConfig && (
            <Alert className="mt-4" variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertTitle>Databricks Not Configured</AlertTitle>
              <AlertDescription>
                Configure Databricks connection in the Intake phase to use AI analysis.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Loading state */}
      {runAnalysis.isPending && (
        <Card>
          <CardContent className="py-8">
            <div className="space-y-4">
              <div className="flex items-center gap-3">
                <Loader2 className="w-5 h-5 animate-spin text-emerald-600" />
                <span className="text-slate-700 font-medium">Running analysis... This may take 10-30 seconds.</span>
              </div>
              <Skeleton className="h-4 w-3/4" />
              <Skeleton className="h-4 w-1/2" />
              <Skeleton className="h-20 w-full" />
              <Skeleton className="h-20 w-full" />
            </div>
          </CardContent>
        </Card>
      )}

      {/* Results */}
      {!runAnalysis.isPending && currentAnalysis && (
        <AnalysisResults analysis={currentAnalysis} />
      )}

      {/* No results state */}
      {!runAnalysis.isPending && !currentAnalysis && !analysesLoading && (
        <Card>
          <CardContent className="py-12 text-center">
            <FileText className="w-12 h-12 mx-auto mb-4 text-slate-300" />
            <p className="text-slate-500">No analysis runs yet. Run your first analysis above.</p>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

// ─── Analysis Results ────────────────────────────────────────────────────

interface AnalysisResultsProps {
  analysis: DiscoveryAnalysis;
}

const AnalysisResults: React.FC<AnalysisResultsProps> = ({ analysis }) => {
  const highCount = analysis.disagreements?.high?.length ?? 0;
  const mediumCount = analysis.disagreements?.medium?.length ?? 0;
  const lowerCount = analysis.disagreements?.lower?.length ?? 0;

  return (
    <div className="space-y-6">
      {/* Warning if < 2 participants */}
      {analysis.participant_count < 2 && (
        <Alert>
          <AlertTriangle className="h-4 w-4" />
          <AlertTitle>Limited Participant Data</AlertTitle>
          <AlertDescription>
            This analysis is based on feedback from only {analysis.participant_count} participant{analysis.participant_count !== 1 ? 's' : ''}. Results may not be representative. Consider waiting for more feedback.
          </AlertDescription>
        </Alert>
      )}

      {/* Data Freshness Banner */}
      <Card className="border-blue-200 bg-blue-50">
        <CardContent className="py-4">
          <div className="flex items-center gap-4 flex-wrap text-sm">
            <span className="flex items-center gap-1.5 text-blue-800">
              <Users className="w-4 h-4" />
              {analysis.participant_count} participant{analysis.participant_count !== 1 ? 's' : ''}
            </span>
            <span className="flex items-center gap-1.5 text-blue-800">
              <Clock className="w-4 h-4" />
              {new Date(analysis.created_at).toLocaleString()}
            </span>
            <span className="flex items-center gap-1.5 text-blue-800">
              <FileText className="w-4 h-4" />
              {analysis.template_used === 'evaluation_criteria' ? 'Evaluation Criteria' : 'Themes & Patterns'}
            </span>
            <Badge variant="outline" className="text-blue-700 border-blue-300">
              {analysis.model_used}
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Summary Card */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-slate-900">{analysis.findings?.length ?? 0}</div>
            <div className="text-sm text-slate-600">Findings</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-red-600">{highCount}</div>
            <div className="text-sm text-slate-600">HIGH Disagreements</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-yellow-600">{mediumCount}</div>
            <div className="text-sm text-slate-600">MEDIUM Disagreements</div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 text-center">
            <div className="text-2xl font-bold text-blue-600">{lowerCount}</div>
            <div className="text-sm text-slate-600">LOWER Disagreements</div>
          </CardContent>
        </Card>
      </div>

      {/* Summary Text */}
      {analysis.analysis_data && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">Summary</CardTitle>
          </CardHeader>
          <CardContent>
            <p className="text-slate-700 whitespace-pre-wrap">{analysis.analysis_data}</p>
          </CardContent>
        </Card>
      )}

      {/* Findings */}
      {analysis.findings && analysis.findings.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg flex items-center gap-2">
              <FileText className="w-5 h-5 text-emerald-600" />
              Findings ({analysis.findings.length})
            </CardTitle>
            <CardDescription>
              {analysis.template_used === 'evaluation_criteria'
                ? 'Distilled evaluation criteria from participant feedback'
                : 'Identified themes and patterns across feedback'}
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {analysis.findings.map((finding, i) => (
                <div key={i} className="border rounded-lg p-4 bg-slate-50">
                  <div className="flex items-start justify-between mb-2">
                    <p className="text-slate-800 font-medium flex-1">{finding.text}</p>
                    <PriorityBadge priority={finding.priority} />
                  </div>
                  {finding.evidence_trace_ids && finding.evidence_trace_ids.length > 0 && (
                    <div className="flex flex-wrap gap-1 mt-2">
                      <span className="text-xs text-slate-500">Evidence:</span>
                      {finding.evidence_trace_ids.map((tid) => (
                        <Badge key={tid} variant="outline" className="text-xs font-mono">
                          {tid.slice(0, 8)}
                        </Badge>
                      ))}
                    </div>
                  )}
                  <div className="mt-3">
                    <Button variant="outline" size="sm" disabled className="text-xs">
                      Promote to Rubric (Step 3)
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Disagreement Sections */}
      <DisagreementSection
        title="HIGH Priority — Rating Disagreements"
        description="Reviewers gave opposite labels (GOOD vs BAD)"
        items={analysis.disagreements?.high ?? []}
        colorClass="red"
      />
      <DisagreementSection
        title="MEDIUM Priority — Both BAD, Different Issues"
        description="All reviewers rated BAD but identified different problems"
        items={analysis.disagreements?.medium ?? []}
        colorClass="yellow"
      />
      <DisagreementSection
        title="LOWER Priority — Both GOOD, Different Strengths"
        description="All reviewers rated GOOD but valued different aspects"
        items={analysis.disagreements?.lower ?? []}
        colorClass="blue"
      />
    </div>
  );
};

// ─── Subcomponents ───────────────────────────────────────────────────────

function PriorityBadge({ priority }: { priority: string }) {
  const colorMap: Record<string, string> = {
    high: 'bg-red-100 text-red-800 border-red-200',
    medium: 'bg-yellow-100 text-yellow-800 border-yellow-200',
    low: 'bg-blue-100 text-blue-800 border-blue-200',
  };
  return (
    <Badge variant="outline" className={colorMap[priority] ?? colorMap.medium}>
      {priority}
    </Badge>
  );
}

interface DisagreementItem {
  trace_id: string;
  summary: string;
  underlying_theme: string;
  followup_questions: string[];
  facilitator_suggestions: string[];
}

interface DisagreementSectionProps {
  title: string;
  description: string;
  items: DisagreementItem[];
  colorClass: 'red' | 'yellow' | 'blue';
}

const DisagreementSection: React.FC<DisagreementSectionProps> = ({
  title,
  description,
  items,
  colorClass,
}) => {
  const [isOpen, setIsOpen] = useState(true);

  if (items.length === 0) return null;

  const borderColor = {
    red: 'border-red-200',
    yellow: 'border-yellow-200',
    blue: 'border-blue-200',
  }[colorClass];

  const bgColor = {
    red: 'bg-red-50',
    yellow: 'bg-yellow-50',
    blue: 'bg-blue-50',
  }[colorClass];

  const badgeColor = {
    red: 'bg-red-100 text-red-800',
    yellow: 'bg-yellow-100 text-yellow-800',
    blue: 'bg-blue-100 text-blue-800',
  }[colorClass];

  const iconColor = {
    red: 'text-red-600',
    yellow: 'text-yellow-600',
    blue: 'text-blue-600',
  }[colorClass];

  return (
    <Card className={borderColor}>
      <CardHeader
        className="cursor-pointer select-none"
        onClick={() => setIsOpen(!isOpen)}
      >
        <CardTitle className="text-lg flex items-center gap-2">
          {isOpen ? (
            <ChevronDown className={`w-5 h-5 ${iconColor}`} />
          ) : (
            <ChevronRight className={`w-5 h-5 ${iconColor}`} />
          )}
          <Info className={`w-5 h-5 ${iconColor}`} />
          {title}
          <Badge className={badgeColor}>{items.length}</Badge>
        </CardTitle>
        <CardDescription>{description}</CardDescription>
      </CardHeader>
      {isOpen && (
        <CardContent>
          <div className="space-y-4">
            {items.map((item, i) => (
              <div key={i} className={`rounded-lg p-4 ${bgColor}`}>
                <div className="flex items-center gap-2 mb-2">
                  <Badge variant="outline" className="text-xs font-mono">
                    Trace: {item.trace_id?.slice(0, 8)}
                  </Badge>
                </div>
                <p className="text-sm text-slate-800 font-medium mb-2">{item.summary}</p>
                <p className="text-sm text-slate-600 mb-3">
                  <span className="font-medium">Theme:</span> {item.underlying_theme}
                </p>

                {item.followup_questions && item.followup_questions.length > 0 && (
                  <div className="mb-3">
                    <p className="text-xs font-medium text-slate-500 uppercase mb-1">Follow-up Questions</p>
                    <ul className="list-disc list-inside space-y-1">
                      {item.followup_questions.map((q, qi) => (
                        <li key={qi} className="text-sm text-slate-700">{q}</li>
                      ))}
                    </ul>
                  </div>
                )}

                {item.facilitator_suggestions && item.facilitator_suggestions.length > 0 && (
                  <div>
                    <p className="text-xs font-medium text-slate-500 uppercase mb-1">Facilitator Suggestions</p>
                    <ul className="list-disc list-inside space-y-1">
                      {item.facilitator_suggestions.map((s, si) => (
                        <li key={si} className="text-sm text-slate-700">{s}</li>
                      ))}
                    </ul>
                  </div>
                )}
              </div>
            ))}
          </div>
        </CardContent>
      )}
    </Card>
  );
};
