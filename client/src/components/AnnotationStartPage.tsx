import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useRubric, useAllTraces } from '@/hooks/useWorkshopApi';
import { WorkshopsService } from '@/client';
import { Play, Users, Star, ClipboardList, ChevronRight, CheckCircle, Settings, Database, Scale, Binary, MessageSquareText, Shuffle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
import { toast } from 'sonner';
import { parseRubricQuestions } from '@/utils/rubricUtils';

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
  const { data: rubric } = useRubric(workshopId!);
  const { data: traces } = useAllTraces(workshopId!);
  
  const totalTraces = traces?.length || 0;

  const startAnnotationPhase = async () => {
    try {
      setIsStarting(true);
      
      // Determine trace limit based on user selection
      const traceLimit = traceOption === 'all' ? -1 : parseInt(customTraceCount) || 10;
      
      const response = await fetch(`/workshops/${workshopId}/begin-annotation`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ trace_limit: traceLimit, randomize: randomizeTraces })
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to start annotation phase');
      }
      
      const result = await response.json();
      toast.success(result.message || 'Annotation phase started successfully!');
      
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
      
      toast.error('Failed to start annotation phase. Please try again.');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="w-16 h-16 bg-gradient-to-br from-amber-500 to-orange-600 rounded-2xl flex items-center justify-center mx-auto">
          <Star className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900">Ready to Start Annotation Phase</h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Begin the systematic annotation process where SMEs will rate traces using 
          the evaluation rubric created from discovery insights.
        </p>
      </div>

      {/* Trace Count Display */}
      <Card className="border-purple-200 bg-gradient-to-br from-purple-50 to-indigo-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-center gap-3">
            <Database className="w-6 h-6 text-purple-600" />
            <div className="text-center">
              <span className="text-2xl font-bold text-purple-900">{totalTraces}</span>
              <span className="text-base font-medium text-purple-700 ml-2">Traces Available</span>
              {totalTraces === 0 && (
                <div className="text-sm text-purple-600 mt-1">No traces available</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Rubric Preview */}
      {rubric && (
        <Card className="border-green-200 bg-gradient-to-br from-green-50 to-emerald-50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <CheckCircle className="w-5 h-5 text-green-600" />
              Evaluation Rubric Ready
            </CardTitle>
            <CardDescription>
              The rubric created from discovery insights will guide the annotation process
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="bg-white border border-green-200 rounded-lg p-4">
              <div className="flex items-center gap-3 mb-3">
                <ClipboardList className="w-5 h-5 text-green-600" />
                <div>
                  <h4 className="font-semibold text-slate-900">Evaluation Criteria</h4>
                  <p className="text-sm text-slate-600">{parseRubricQuestions(rubric.question).length} question(s)</p>
                </div>
              </div>
              <div className="space-y-2">
                {parseRubricQuestions(rubric.question).map((q, index) => (
                  <div key={q.id} className="bg-slate-50 rounded-md p-3">
                    <div className="flex items-center gap-2 mb-1">
                      {q.judgeType === 'likert' && <Scale className="w-3 h-3 text-blue-500" />}
                      {q.judgeType === 'binary' && <Binary className="w-3 h-3 text-green-500" />}
                      {q.judgeType === 'freeform' && <MessageSquareText className="w-3 h-3 text-purple-500" />}
                      <p className="text-sm font-medium text-slate-700">{q.title}</p>
                      <Badge variant="outline" className="text-xs ml-auto">
                        {q.judgeType === 'likert' ? '1-5 Scale' : q.judgeType === 'binary' ? 'Pass/Fail' : 'Free-form'}
                      </Badge>
                    </div>
                    {q.description && (
                      <p className="text-sm text-slate-600 ml-5">{q.description}</p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Trace Count Selection */}
      <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-600" />
            Annotation Configuration
          </CardTitle>
          <CardDescription>
            Choose how many of the {totalTraces} available traces to include in the annotation phase
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup 
            value={traceOption} 
            onValueChange={(value: 'limited' | 'all') => setTraceOption(value)}
            className="space-y-4"
          >
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="limited" id="limited" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="limited" className="text-base font-medium cursor-pointer">
                  Start with a subset of traces
                </Label>
                <p className="text-sm text-slate-600 mt-1">
                  Recommended for focused annotation sessions. You can add more traces later.
                </p>
                {traceOption === 'limited' && (
                  <div className="mt-3 flex items-center gap-3">
                    <Label htmlFor="traceCount" className="text-sm">Number of traces:</Label>
                    <Input
                      id="traceCount"
                      type="number"
                      min="1"
                      max={totalTraces}
                      value={customTraceCount}
                      onChange={(e) => setCustomTraceCount(e.target.value)}
                      className="w-24"
                    />
                    <span className="text-sm text-slate-600">
                      (max: {totalTraces})
                    </span>
                  </div>
                )}
              </div>
            </div>
            
            <div className="flex items-start space-x-3">
              <RadioGroupItem value="all" id="all" className="mt-1" />
              <div className="flex-1">
                <Label htmlFor="all" className="text-base font-medium cursor-pointer">
                  Use all available traces ({totalTraces} traces)
                </Label>
                <p className="text-sm text-slate-600 mt-1">
                  Include all traces from the start. Best for comprehensive annotation sessions.
                </p>
              </div>
            </div>
          </RadioGroup>
          
          {/* Randomization Toggle */}
          <div className="mt-6 pt-4 border-t border-amber-200">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Shuffle className="w-5 h-5 text-amber-600" />
                <div>
                  <Label htmlFor="annotation-randomize-toggle" className="font-medium cursor-pointer">
                    Randomize Trace Order
                  </Label>
                  <div className="text-sm text-slate-600">
                    Each SME sees traces in a different random order
                  </div>
                </div>
              </div>
              <Switch
                id="annotation-randomize-toggle"
                checked={randomizeTraces}
                onCheckedChange={setRandomizeTraces}
              />
            </div>
            {!randomizeTraces && (
              <div className="text-xs text-slate-500 mt-2 ml-8">
                Default: All SMEs will see traces in the same chronological order
              </div>
            )}
            {randomizeTraces && (
              <div className="text-xs text-amber-700 mt-2 ml-8">
                ✓ Randomization enabled: Each SME will see traces in their own unique order
              </div>
            )}
          </div>
          
          <div className="mt-4 p-3 bg-purple-100 rounded-lg">
            <p className="text-sm text-purple-800">
              <strong>Selected:</strong> {
                traceOption === 'all' 
                  ? `All ${totalTraces} traces`
                  : `${Math.min(parseInt(customTraceCount) || 10, totalTraces)} traces`
              }
              {randomizeTraces && ' (randomized per SME)'}
            </p>
          </div>
        </CardContent>
      </Card>

      {/* What Happens Next */}
      <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Star className="w-5 h-5 text-amber-600" />
            What Happens When You Start Annotation
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-blue-600" />
                For SMEs (Subject Matter Experts)
              </h4>
              <ul className="space-y-2 text-sm text-slate-700">
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3 h-3 mt-0.5 text-slate-400" />
                  Access to annotation interface with rubric criteria
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3 h-3 mt-0.5 text-slate-400" />
                  Rate traces on 1-5 scale with detailed comments
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3 h-3 mt-0.5 text-slate-400" />
                  Progress through traces systematically
                </li>
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                <ClipboardList className="w-4 h-4 text-amber-600" />
                For You (Facilitator)
              </h4>
              <ul className="space-y-2 text-sm text-slate-700">
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3 h-3 mt-0.5 text-slate-400" />
                  Monitor annotation progress across all SMEs
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3 h-3 mt-0.5 text-slate-400" />
                  View real-time completion statistics
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3 h-3 mt-0.5 text-slate-400" />
                  Prepare for IRR analysis once complete
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Participant Note */}
      <Card>
        <CardHeader>
          <CardTitle className="text-slate-700">Note for Participants</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="bg-slate-50 border-2 border-slate-200 rounded-lg p-4">
            <div className="flex items-center gap-3 mb-2">
              <Users className="w-5 h-5 text-slate-500" />
              <p className="font-medium text-slate-700">Regular participants will observe this phase</p>
            </div>
            <p className="text-sm text-slate-600">
              During annotation, participants can watch the process but won't actively annotate. 
              This maintains the integrity of the SME evaluation while keeping everyone engaged in the learning process.
            </p>
          </div>
        </CardContent>
      </Card>

      {/* Start Button */}
      <div className="flex justify-center pt-4">
        <Button
          onClick={startAnnotationPhase}
          disabled={isStarting || !rubric}
          size="lg"
          className="bg-gradient-to-r from-amber-600 to-orange-700 hover:from-amber-700 hover:to-orange-800 text-white px-8 py-3 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-200"
        >
          {isStarting ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
              Starting Annotation...
            </>
          ) : (
            <>
              <Play className="w-5 h-5 mr-2" />
              Start Annotation Phase
            </>
          )}
        </Button>
      </div>

      {!rubric && (
        <div className="text-center text-sm text-red-600">
          <p>A rubric must be created before starting the annotation phase.</p>
        </div>
      )}

      {/* Info Footer */}
      <div className="text-center text-sm text-slate-500">
        <p>Once started, SMEs will immediately access the annotation interface with the evaluation rubric.</p>
      </div>
    </div>
  );
};