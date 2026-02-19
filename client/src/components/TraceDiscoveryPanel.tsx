import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { AlertCircle, Zap, Users, Eye } from 'lucide-react';

interface TraceDiscoveryPanelProps {
  traceId: string;
  state: {
    trace_id: string;
    categories?: Record<string, any[]>;
    disagreements?: any[];
    questions?: any[];
    thresholds?: Record<string, number>;
  };
  onGenerateQuestion: () => void;
  onPromote: (findingId: string) => void;
  onUpdateThresholds: (thresholds: Record<string, number>) => void;
}

const CATEGORIES = [
  'themes',
  'edge_cases',
  'boundary_conditions',
  'failure_modes',
  'missing_info',
];

export const TraceDiscoveryPanel: React.FC<TraceDiscoveryPanelProps> = ({
  traceId,
  state,
  onGenerateQuestion,
  onPromote,
  onUpdateThresholds,
}) => {
  const [thresholds, setThresholds] = React.useState<Record<string, number>>(
    state.thresholds || {}
  );
  const [isUpdatingThresholds, setIsUpdatingThresholds] = React.useState(false);
  const [isGeneratingQuestion, setIsGeneratingQuestion] = React.useState(false);

  const categories = state.categories || {};
  const disagreements = state.disagreements || [];
  const questions = state.questions || [];

  const handleUpdateThresholds = async () => {
    setIsUpdatingThresholds(true);
    try {
      onUpdateThresholds(thresholds);
    } finally {
      setIsUpdatingThresholds(false);
    }
  };

  const handleGenerateQuestion = async () => {
    setIsGeneratingQuestion(true);
    try {
      onGenerateQuestion();
    } finally {
      setIsGeneratingQuestion(false);
    }
  };

  return (
    <div className="space-y-6" data-testid="trace-discovery-panel">
      {/* Header */}
      <div>
        <h3 className="text-lg font-semibold mb-2">Trace Discovery: {traceId.slice(0, 12)}...</h3>
        <p className="text-sm text-slate-600">Structured view of findings, coverage, and participant insights</p>
      </div>

      {/* Category Coverage */}
      <Card data-testid="category-coverage-section">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base">
            <Zap className="w-4 h-4" />
            Category Coverage
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-4">
            {CATEGORIES.map((category) => {
              const findings = categories[category] || [];
              const threshold = thresholds[category] || 3;
              const percentage = threshold > 0 ? (findings.length / threshold) * 100 : 0;

              return (
                <div key={category} data-testid={`category-${category}`}>
                  <div className="flex justify-between items-center mb-2">
                    <label className="text-sm font-medium capitalize">{category.replace(/_/g, ' ')}</label>
                    <Badge variant="outline" className="text-xs" data-testid={`category-${category}-count`}>
                      {findings.length}/{threshold}
                    </Badge>
                  </div>
                  <Progress value={Math.min(percentage, 100)} className="h-2" />
                  {findings.length > 0 && (
                    <div className="mt-2 space-y-1" data-testid={`category-${category}-findings`}>
                      {findings.map((finding: any, idx: number) => (
                        <div key={finding.id || idx} className="text-xs text-slate-600 flex items-center justify-between gap-2 p-1 rounded hover:bg-slate-50">
                          <div className="flex items-center gap-2 min-w-0 flex-1">
                            <Badge variant="secondary" className="text-[10px] px-1 shrink-0" data-testid="finding-user-id">
                              {finding.user_id?.slice(0, 8) || 'unknown'}
                            </Badge>
                            <span className="line-clamp-1">{finding.text?.slice(0, 50)}...</span>
                          </div>
                          <Button
                            variant="ghost"
                            size="sm"
                            className="h-6 px-2 text-xs shrink-0"
                            onClick={() => onPromote(finding.id)}
                            disabled={finding.promoted}
                            data-testid="promote-finding-btn"
                          >
                            {finding.promoted ? 'Promoted' : 'Promote'}
                          </Button>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              );
            })}
          </div>

          {/* Threshold Controls */}
          <div className="mt-6 pt-6 border-t" data-testid="threshold-controls">
            <Label className="text-sm font-medium mb-3 block">Update Thresholds</Label>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
              {CATEGORIES.map((category) => (
                <div key={category}>
                  <label className="text-xs text-slate-600 capitalize">{category.split('_')[0]}</label>
                  <Input
                    type="number"
                    min="1"
                    max="20"
                    value={thresholds[category] || 3}
                    onChange={(e) =>
                      setThresholds({ ...thresholds, [category]: parseInt(e.target.value) || 3 })
                    }
                    className="h-8 text-xs"
                    data-testid={`threshold-input-${category}`}
                  />
                </div>
              ))}
            </div>
            <Button
              onClick={handleUpdateThresholds}
              disabled={isUpdatingThresholds}
              size="sm"
              className="mt-3 w-full"
              data-testid="update-thresholds-btn"
            >
              {isUpdatingThresholds ? 'Updating...' : 'Update Thresholds'}
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* Disagreements */}
      {disagreements.length > 0 && (
        <Card className="border-amber-200 bg-amber-50" data-testid="disagreements-section">
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base text-amber-900">
              <AlertCircle className="w-4 h-4" />
              Detected Disagreements ({disagreements.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {disagreements.map((disagreement: any, idx: number) => (
                <div key={disagreement.id || idx} className="bg-white rounded p-3" data-testid="disagreement-item">
                  <p className="text-sm text-slate-800 mb-2">{disagreement.summary}</p>
                  <div className="flex gap-2 flex-wrap">
                    {disagreement.user_ids?.map((userId: string) => (
                      <Badge key={userId} variant="outline" className="text-xs">
                        {userId}
                      </Badge>
                    ))}
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Questions */}
      {questions.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Eye className="w-4 h-4" />
              Active Questions ({questions.length})
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              {questions.map((question: any, idx: number) => (
                <div key={idx} className="bg-slate-50 rounded p-3">
                  <div className="text-sm font-medium text-slate-800 mb-1">{question.prompt}</div>
                  {question.target_category && (
                    <Badge variant="outline" className="text-xs">
                      Target: {question.target_category}
                    </Badge>
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Generate Question */}
      <Card className="border-blue-200 bg-blue-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2 text-base text-blue-900">
            <Users className="w-4 h-4" />
            Generate Next Question
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-sm text-blue-800 mb-4">
            Generate a targeted question to guide participants toward undercovered areas.
          </p>
          <Button
            onClick={handleGenerateQuestion}
            disabled={isGeneratingQuestion}
            className="w-full bg-blue-600 hover:bg-blue-700 text-white"
            data-testid="generate-question-btn"
          >
            {isGeneratingQuestion ? 'Generating...' : 'Generate Question'}
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};
