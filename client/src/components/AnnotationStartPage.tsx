import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useRubric, useAllTraces } from '@/hooks/useWorkshopApi';
import { WorkshopsService } from '@/client';
import { Play, Users, Star, ClipboardList, CheckCircle, Settings, Database, Scale, Binary, MessageSquareText, Shuffle, Brain, Lightbulb } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { parseRubricQuestions } from '@/utils/rubricUtils';
import { MODEL_MAPPING } from '@/utils/modelMapping';

interface AnnotationStartPageProps {
  onStartAnnotation?: () => void;
}

export const AnnotationStartPage: React.FC<AnnotationStartPageProps> = ({ onStartAnnotation }) => {
  const { workshopId } = useWorkshopContext();
  const queryClient = useQueryClient();
  const [isStarting, setIsStarting] = React.useState(false);
  const [traceOption, setTraceOption] = React.useState<'limited' | 'all'>('limited');
  const [customTraceCount, setCustomTraceCount] = React.useState<string>('10');
  const [randomizeTraces, setRandomizeTraces] = React.useState<boolean>(false);
  const [evaluationModel, setEvaluationModel] = React.useState<string>('databricks-claude-opus-4-5');
  const [autoEvaluateEnabled, setAutoEvaluateEnabled] = React.useState<boolean>(true);
  const { data: rubric } = useRubric(workshopId!);
  const { data: traces } = useAllTraces(workshopId!);

  const totalTraces = traces?.length || 0;
  const rubricQuestions = rubric ? parseRubricQuestions(rubric.question) : [];

  const startAnnotationPhase = async () => {
    try {
      setIsStarting(true);

      // Determine trace limit based on user selection
      const traceLimit = traceOption === 'all' ? -1 : parseInt(customTraceCount) || 10;

      const requestBody = {
        trace_limit: traceLimit,
        randomize: randomizeTraces,
        evaluation_model_name: autoEvaluateEnabled ? evaluationModel : null,
      };

      const response = await fetch(`/workshops/${workshopId}/begin-annotation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(requestBody)
      });

      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to start annotation phase');
      }

      const result = await response.json();

      // Show success message with auto-evaluation status
      if (result.auto_evaluation_started) {
        toast.success('Annotation started', { description: `Auto-evaluation started with ${evaluationModel}.` });
      } else if (autoEvaluateEnabled) {
        // User wanted auto-eval but it didn't start - show warning
        toast.warning('Annotation started', { description: 'Auto-evaluation could not start. Check MLflow/Databricks configuration.' });
        console.warn('[AnnotationStartPage] Auto-evaluation requested but did not start:', result);
      } else {
        toast.success('Annotation started', { description: 'SMEs can now begin rating traces.' });
      }

      // Set fresh start flag so AnnotationDemo starts from trace 1
      localStorage.setItem(`annotation-fresh-start-${workshopId}`, 'true');

      // Add a small delay to ensure backend has processed the change
      await new Promise(resolve => setTimeout(resolve, 500));

      // Clear all workshop-related queries from cache
      queryClient.removeQueries({ queryKey: ['workshop', workshopId] });
      queryClient.removeQueries({ queryKey: ['annotations', workshopId] });
      queryClient.removeQueries({ queryKey: ['rubric', workshopId] });

      // Force a fresh refetch of the workshop data
      await queryClient.refetchQueries({ queryKey: ['workshop', workshopId] });
      await queryClient.refetchQueries({ queryKey: ['annotations', workshopId] });
      await queryClient.refetchQueries({ queryKey: ['rubric', workshopId] });

      // Navigate to annotation monitor if callback provided
      if (onStartAnnotation) {
        onStartAnnotation();
      }

    } catch (error: any) {

      toast.error('Could not start annotation', { description: 'Please try again.' });
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 pb-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-orange-600">
          <Star className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Start Annotation Phase</h1>
          <p className="text-sm text-gray-500">
            SMEs rate traces using the evaluation rubric.
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          {totalTraces > 0 && (
            <Badge className="bg-blue-50 text-blue-700 border border-blue-200">
              <Database className="w-3 h-3 mr-1" />
              {totalTraces} traces
            </Badge>
          )}
          {rubric && (
            <Badge className="bg-green-50 text-green-700 border border-green-200">
              <CheckCircle className="w-3 h-3 mr-1" />
              {rubricQuestions.length} criteria
            </Badge>
          )}
        </div>
      </div>

      {/* Rubric Preview */}
      {rubric && (
        <Card className="border-l-4 border-green-500">
          <CardContent className="p-4">
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-3">
              <ClipboardList className="w-4 h-4 text-green-600" />
              Evaluation Rubric
            </h3>
            <div className="space-y-2">
              {rubricQuestions.map((q) => (
                <div key={q.id} className="flex items-center gap-2.5 text-sm">
                  <div className="flex h-6 w-6 items-center justify-center rounded bg-gray-100">
                    {q.judgeType === 'likert' && <Scale className="w-3 h-3 text-blue-600" />}
                    {q.judgeType === 'binary' && <Binary className="w-3 h-3 text-green-600" />}
                    {q.judgeType === 'freeform' && <MessageSquareText className="w-3 h-3 text-purple-600" />}
                  </div>
                  <span className="font-medium text-gray-900">{q.title}</span>
                  <Badge variant="secondary" className="text-[10px] ml-auto">
                    {q.judgeType === 'likert' ? '1-5' : q.judgeType === 'binary' ? 'Binary' : 'Text'}
                  </Badge>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* Configuration */}
      <Card className="border-l-4 border-amber-500">
        <CardContent className="p-4 space-y-4">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Settings className="w-4 h-4 text-amber-600" />
            Configuration
          </h3>

          <div className="space-y-2">
            <Label className="text-xs font-medium text-gray-600">Trace Selection</Label>
            <RadioGroup
              value={traceOption}
              onValueChange={(value: 'limited' | 'all') => setTraceOption(value)}
              className="space-y-2"
            >
              <div className="flex items-center space-x-3 p-2.5 rounded-md border border-gray-200 hover:border-gray-300 transition-colors">
                <RadioGroupItem value="limited" id="limited" />
                <Label htmlFor="limited" className="flex-1 cursor-pointer">
                  <div className="text-sm font-medium">Subset of traces</div>
                  <div className="text-xs text-gray-500">Recommended for focused sessions</div>
                </Label>
              </div>
              <div className="flex items-center space-x-3 p-2.5 rounded-md border border-gray-200 hover:border-gray-300 transition-colors">
                <RadioGroupItem value="all" id="all" />
                <Label htmlFor="all" className="flex-1 cursor-pointer">
                  <div className="text-sm font-medium">All traces</div>
                  <div className="text-xs text-gray-500">Use all {totalTraces} traces</div>
                </Label>
              </div>
            </RadioGroup>
          </div>

          {traceOption === 'limited' && (
            <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
              <Label htmlFor="traceCount" className="text-xs font-medium text-gray-700">
                Number of traces
              </Label>
              <Input
                id="traceCount"
                type="number"
                min="1"
                max={totalTraces}
                value={customTraceCount}
                onChange={(e) => setCustomTraceCount(e.target.value)}
                className="mt-1.5 h-8"
              />
              <div className="text-xs text-gray-500 mt-1">
                Max: {totalTraces} available
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <Label htmlFor="annotation-randomize-toggle" className="text-sm text-gray-600 cursor-pointer flex items-center gap-2">
              <Shuffle className="w-3.5 h-3.5 text-gray-400" />
              Randomize trace order
            </Label>
            <Switch
              id="annotation-randomize-toggle"
              checked={randomizeTraces}
              onCheckedChange={setRandomizeTraces}
            />
          </div>

          {/* Summary */}
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-md px-3 py-2">
            <span className="font-medium text-gray-700">Summary:</span>
            {traceOption === 'all'
              ? `All ${totalTraces} traces`
              : `${Math.min(parseInt(customTraceCount) || 10, totalTraces)} traces`
            }
            {randomizeTraces && ' · randomized per SME'}
          </div>
        </CardContent>
      </Card>

      {/* Auto-Evaluation */}
      <Card className="border-l-4 border-purple-500">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Brain className="w-4 h-4 text-purple-600" />
              LLM Auto-Evaluation
            </h3>
            <Switch
              id="auto-evaluate-toggle"
              checked={autoEvaluateEnabled}
              onCheckedChange={setAutoEvaluateEnabled}
            />
          </div>

          {autoEvaluateEnabled && (
            <>
              <div className="space-y-1.5">
                <Label htmlFor="evaluation-model" className="text-xs font-medium text-gray-600">
                  Evaluation Model
                </Label>
                <Select value={evaluationModel} onValueChange={setEvaluationModel}>
                  <SelectTrigger className="h-9">
                    <SelectValue placeholder="Select a model" />
                  </SelectTrigger>
                  <SelectContent>
                    {Object.entries(MODEL_MAPPING).map(([displayName, endpointName]) => (
                      <SelectItem key={endpointName} value={endpointName}>
                        {displayName}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <p className="text-xs text-gray-500">
                  Model for automated trace evaluation
                </p>
              </div>

              <div className="bg-purple-50 rounded-md px-3 py-2 border border-purple-100">
                <p className="text-xs text-purple-700">
                  The LLM judge will automatically evaluate all selected traces. Results appear in the Results page.
                </p>
              </div>
            </>
          )}

          {!autoEvaluateEnabled && (
            <div className="bg-gray-50 rounded-md px-3 py-2 border border-gray-200">
              <p className="text-xs text-gray-600">
                Auto-evaluation disabled. Run evaluation manually from Results page later.
              </p>
            </div>
          )}
        </CardContent>
      </Card>

      {/* What Happens */}
      <Card className="border-l-4 border-blue-500">
        <CardContent className="p-4">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-blue-600" />
            What happens when annotation starts
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wide flex items-center gap-1.5">
                <Users className="w-3 h-3" />
                SMEs
              </h4>
              <ul className="space-y-1 text-sm text-gray-600">
                <li className="flex items-start gap-1.5">
                  <span className="text-gray-300 mt-1.5 text-[6px]">●</span>
                  Access annotation interface with rubric
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-gray-300 mt-1.5 text-[6px]">●</span>
                  Rate traces and provide feedback
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-gray-300 mt-1.5 text-[6px]">●</span>
                  Progress tracked automatically
                </li>
              </ul>
            </div>
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-orange-700 uppercase tracking-wide flex items-center gap-1.5">
                <ClipboardList className="w-3 h-3" />
                Facilitator
              </h4>
              <ul className="space-y-1 text-sm text-gray-600">
                <li className="flex items-start gap-1.5">
                  <span className="text-gray-300 mt-1.5 text-[6px]">●</span>
                  Monitor progress across SMEs
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-gray-300 mt-1.5 text-[6px]">●</span>
                  View real-time completion stats
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-gray-300 mt-1.5 text-[6px]">●</span>
                  Prepare for IRR analysis
                </li>
              </ul>
            </div>
          </div>

          <div className="mt-3 pt-3 border-t border-gray-100">
            <div className="flex items-start gap-2 text-xs text-gray-500">
              <Users className="w-3.5 h-3.5 text-blue-500 shrink-0 mt-0.5" />
              <p>
                <span className="font-medium text-gray-700">Participants</span> can observe but won't actively annotate.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* No Rubric Warning */}
      {!rubric && (
        <Card className="border-l-4 border-red-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <ClipboardList className="h-5 w-5 text-red-600" />
              <div>
                <h3 className="text-sm font-semibold text-red-900">Rubric required</h3>
                <p className="text-xs text-red-700">
                  Create a rubric before starting annotation phase.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Start Button */}
      <div className="flex flex-col items-center gap-2 pt-2">
        <Button
          onClick={startAnnotationPhase}
          disabled={isStarting || !rubric || totalTraces === 0}
          size="lg"
          className="px-8 bg-orange-600 hover:bg-orange-700"
        >
          {isStarting ? (
            <>
              <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
              Starting...
            </>
          ) : totalTraces === 0 ? (
            <>
              <Database className="w-4 h-4 mr-2" />
              No Traces Available
            </>
          ) : !rubric ? (
            <>
              <ClipboardList className="w-4 h-4 mr-2" />
              Rubric Required
            </>
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Start Annotation Phase
            </>
          )}
        </Button>
        <span className="text-xs text-gray-400">
          SMEs will access the annotation interface immediately.
        </span>
      </div>
    </div>
  );
};
