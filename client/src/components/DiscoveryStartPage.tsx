import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useWorkflowContext } from '@/context/WorkflowContext';
import { WorkshopsService } from '@/client';
import { useAllTraces } from '@/hooks/useWorkshopApi';
import { Play, Users, Search, Lightbulb, ChevronRight, Database, Settings } from 'lucide-react';
import { toast } from 'sonner';

interface DiscoveryStartPageProps {
  onStartDiscovery?: () => void;
}

export const DiscoveryStartPage: React.FC<DiscoveryStartPageProps> = ({ onStartDiscovery }) => {
  const { workshopId } = useWorkshopContext();
  const queryClient = useQueryClient();
  const [isStarting, setIsStarting] = React.useState(false);
  const [traceLimit, setTraceLimit] = React.useState<string>('10');
  const [customLimit, setCustomLimit] = React.useState<string>('10');
  
  // Get total number of traces
  const { data: traces } = useAllTraces(workshopId!);
  const totalTraces = traces?.length || 0;

  const startDiscoveryPhase = async () => {
    try {
      setIsStarting(true);
      
      // Calculate actual limit based on selection
      const limit = traceLimit === 'custom' ? parseInt(customLimit) : parseInt(traceLimit);
      

      
      // Make direct API call with trace_limit parameter
      const url = limit 
        ? `/workshops/${workshopId}/begin-discovery?trace_limit=${limit}`
        : `/workshops/${workshopId}/begin-discovery`;
      
      
      const response = await fetch(url, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        }
      });
      
      if (!response.ok) {
        throw new Error('Failed to start discovery phase');
      }
      
      const result = await response.json();
      // Invalidate queries to refresh the UI
      queryClient.invalidateQueries({ queryKey: ['workshop', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['traces', workshopId] });
      queryClient.invalidateQueries({ queryKey: ['all-traces', workshopId] });
      
      // Trigger navigation to discovery monitor
      if (onStartDiscovery) {
        onStartDiscovery();
      }
    } catch (error: any) {
      toast.error('Failed to start discovery phase. Please try again.');
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="max-w-4xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="w-16 h-16 bg-gradient-to-br from-blue-500 to-indigo-600 rounded-2xl flex items-center justify-center mx-auto">
          <Search className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900">Ready to Start Discovery Phase</h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Begin the collaborative discovery process where participants explore traces and provide insights 
          that will inform the evaluation rubric.
        </p>
      </div>

      {/* Trace Count Display */}
      <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
        <CardContent className="p-4">
          <div className="flex items-center justify-center gap-3">
            <Database className="w-6 h-6 text-blue-600" />
            <div className="text-center">
              <span className="text-2xl font-bold text-blue-900">{totalTraces}</span>
              <span className="text-base font-medium text-blue-700 ml-2">Traces Available</span>
              {totalTraces === 0 && (
                <div className="text-sm text-blue-600 mt-1">No traces loaded yet</div>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* What Happens Next */}
      <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Lightbulb className="w-5 h-5 text-blue-600" />
            What Happens When You Start Discovery
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid md:grid-cols-2 gap-6">
            <div className="space-y-3">
              <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                <Users className="w-4 h-4 text-green-600" />
                For SMEs & Participants
              </h4>
              <ul className="space-y-2 text-sm text-slate-700">
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3 h-3 mt-0.5 text-slate-400" />
                  Access to the trace viewer and analysis interface
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3 h-3 mt-0.5 text-slate-400" />
                  Can explore traces and submit quality insights
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3 h-3 mt-0.5 text-slate-400" />
                  Progress tracked automatically as they contribute
                </li>
              </ul>
            </div>
            <div className="space-y-3">
              <h4 className="font-semibold text-slate-900 flex items-center gap-2">
                <Search className="w-4 h-4 text-blue-600" />
                For You (Facilitator)
              </h4>
              <ul className="space-y-2 text-sm text-slate-700">
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3 h-3 mt-0.5 text-slate-400" />
                  Monitor participation and progress in real-time
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3 h-3 mt-0.5 text-slate-400" />
                  Review all findings and identify patterns
                </li>
                <li className="flex items-start gap-2">
                  <ChevronRight className="w-3 h-3 mt-0.5 text-slate-400" />
                  Use insights to guide rubric creation
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Trace Selection Card */}
      <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="w-5 h-5 text-amber-600" />
            Discovery Configuration
          </CardTitle>
          <CardDescription>
            Choose how many of the {totalTraces} available traces to include in the discovery phase
          </CardDescription>
        </CardHeader>
        <CardContent>
          <RadioGroup value={traceLimit} onValueChange={setTraceLimit} className="space-y-3">
            <div className="flex items-center space-x-3 p-3 rounded-lg hover:bg-white/50 transition-colors">
              <RadioGroupItem value="10" id="traces-standard" />
              <Label htmlFor="traces-standard" className="flex-1 cursor-pointer">
                <div className="font-medium">Standard Discovery (10 traces)</div>
                <div className="text-sm text-slate-600">Recommended for most workshops</div>
              </Label>
            </div>
            <div className="flex items-center space-x-3 p-3 rounded-lg hover:bg-white/50 transition-colors">
              <RadioGroupItem value="custom" id="traces-custom" />
              <Label htmlFor="traces-custom" className="flex-1 cursor-pointer">
                <div className="font-medium">Custom</div>
                <div className="text-sm text-slate-600">Choose your own number of traces</div>
              </Label>
            </div>
          </RadioGroup>

          {/* Custom trace input */}
          {traceLimit === 'custom' && (
            <div className="mt-4 p-3 bg-white/50 rounded-lg">
              <Label htmlFor="custom-trace-count" className="text-sm font-medium">
                Number of traces to use
              </Label>
              <Input
                id="custom-trace-count"
                type="number"
                min="1"
                max={totalTraces}
                value={customLimit}
                onChange={(e) => setCustomLimit(e.target.value)}
                className="mt-2"
                placeholder="Enter number of traces"
              />
              <div className="text-xs text-slate-500 mt-1">
                You have {totalTraces} traces available
              </div>
            </div>
          )}

          {/* Show current selection info */}
          <div className="mt-4 p-3 bg-blue-50 rounded-lg">
            <div className="text-sm">
              <strong>Selected configuration:</strong> {
                traceLimit === 'custom' 
                  ? `${customLimit} traces` 
                  : `${traceLimit} traces (Standard)`
              }
            </div>
            {parseInt(traceLimit === 'custom' ? customLimit : traceLimit) < totalTraces && (
              <div className="text-xs text-slate-600 mt-1">
                Note: You have {totalTraces} traces loaded from MLFlow, only the first {traceLimit === 'custom' ? customLimit : traceLimit} will be used.
              </div>
            )}
          </div>
        </CardContent>
      </Card>


      {/* No Traces Warning */}
      {totalTraces === 0 && (
        <Card className="border-amber-200 bg-gradient-to-br from-amber-50 to-orange-50">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Database className="h-8 w-8 text-amber-600" />
              <div>
                <h3 className="font-semibold text-amber-900">No traces available</h3>
                <p className="text-sm text-amber-700">
                  Complete MLflow ingestion in the Intake phase first, then return here to start discovery.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Start Button */}
      <div className="flex justify-center pt-4">
        <Button
          onClick={startDiscoveryPhase}
          disabled={isStarting || totalTraces === 0}
          size="lg"
          className="bg-gradient-to-r from-blue-600 to-indigo-700 hover:from-blue-700 hover:to-indigo-800 text-white px-8 py-3 text-lg font-semibold shadow-lg hover:shadow-xl transition-all duration-200 disabled:opacity-50 disabled:cursor-not-allowed"
        >
          {isStarting ? (
            <>
              <div className="w-5 h-5 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
              Starting Discovery...
            </>
          ) : totalTraces === 0 ? (
            <>
              <Database className="w-5 h-5 mr-2" />
              No Traces Available
            </>
          ) : (
            <>
              <Play className="w-5 h-5 mr-2" />
              Start Discovery Phase
            </>
          )}
        </Button>
      </div>

      {/* Info Footer */}
      <div className="text-center text-sm text-slate-500">
        <p>Once started, participants will be able to access the discovery interface immediately.</p>
      </div>
    </div>
  );
};