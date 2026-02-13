import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
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
import { Play, Users, Search, Lightbulb, Database, Settings, Shuffle } from 'lucide-react';
import { Switch } from '@/components/ui/switch';
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
  const [randomizeTraces, setRandomizeTraces] = React.useState<boolean>(false);
  
  // Get total number of traces
  const { data: traces } = useAllTraces(workshopId!);
  const totalTraces = traces?.length || 0;

  const startDiscoveryPhase = async () => {
    try {
      setIsStarting(true);
      
      // Calculate actual limit based on selection
      const limit = traceLimit === 'custom' ? parseInt(customLimit) : parseInt(traceLimit);
      

      
      // Make direct API call with trace_limit and randomize parameters
      const params = new URLSearchParams();
      if (limit) params.append('trace_limit', limit.toString());
      params.append('randomize', randomizeTraces.toString());
      const url = `/workshops/${workshopId}/begin-discovery?${params.toString()}`;
      
      
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
    } catch {
      toast.error('Could not start discovery', { description: 'Please try again.' });
    } finally {
      setIsStarting(false);
    }
  };

  return (
    <div className="max-w-3xl mx-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 pb-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
          <Search className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Start Discovery Phase</h1>
          <p className="text-sm text-gray-500">
            Participants explore traces and provide insights to inform the evaluation rubric.
          </p>
        </div>
        {totalTraces > 0 && (
          <Badge className="ml-auto bg-blue-50 text-blue-700 border border-blue-200">
            <Database className="w-3 h-3 mr-1" />
            {totalTraces} traces
          </Badge>
        )}
      </div>

      {/* What Happens */}
      <Card className="border-l-4 border-blue-500">
        <CardContent className="p-4">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <Lightbulb className="w-4 h-4 text-blue-600" />
            What happens when discovery starts
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-green-700 uppercase tracking-wide flex items-center gap-1.5">
                <Users className="w-3 h-3" />
                SMEs & Participants
              </h4>
              <ul className="space-y-1 text-sm text-gray-600">
                <li className="flex items-start gap-1.5">
                  <span className="text-gray-300 mt-1.5 text-[6px]">●</span>
                  Access trace viewer and analysis interface
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-gray-300 mt-1.5 text-[6px]">●</span>
                  Explore traces and submit quality insights
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-gray-300 mt-1.5 text-[6px]">●</span>
                  Progress tracked automatically
                </li>
              </ul>
            </div>
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-blue-700 uppercase tracking-wide flex items-center gap-1.5">
                <Search className="w-3 h-3" />
                Facilitator
              </h4>
              <ul className="space-y-1 text-sm text-gray-600">
                <li className="flex items-start gap-1.5">
                  <span className="text-gray-300 mt-1.5 text-[6px]">●</span>
                  Monitor participation in real-time
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-gray-300 mt-1.5 text-[6px]">●</span>
                  Review findings and identify patterns
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-gray-300 mt-1.5 text-[6px]">●</span>
                  Use insights to guide rubric creation
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Configuration */}
      <Card className="border-l-4 border-amber-500">
        <CardContent className="p-4 space-y-4">
          <div className="flex items-center justify-between">
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
              <Settings className="w-4 h-4 text-amber-600" />
              Configuration
            </h3>
            <span className="text-xs text-gray-500">{totalTraces} traces available</span>
          </div>

          <RadioGroup value={traceLimit} onValueChange={setTraceLimit} className="space-y-2">
            <div className="flex items-center space-x-3 p-2.5 rounded-md border border-gray-200 hover:border-gray-300 transition-colors">
              <RadioGroupItem value="10" id="traces-standard" />
              <Label htmlFor="traces-standard" className="flex-1 cursor-pointer">
                <div className="text-sm font-medium">Standard (10 traces)</div>
                <div className="text-xs text-gray-500">Recommended for most workshops</div>
              </Label>
            </div>
            <div className="flex items-center space-x-3 p-2.5 rounded-md border border-gray-200 hover:border-gray-300 transition-colors">
              <RadioGroupItem value="custom" id="traces-custom" />
              <Label htmlFor="traces-custom" className="flex-1 cursor-pointer">
                <div className="text-sm font-medium">Custom</div>
                <div className="text-xs text-gray-500">Choose your own number of traces</div>
              </Label>
            </div>
          </RadioGroup>

          {traceLimit === 'custom' && (
            <div className="p-3 bg-gray-50 rounded-md border border-gray-200">
              <Label htmlFor="custom-trace-count" className="text-xs font-medium text-gray-700">
                Number of traces
              </Label>
              <Input
                id="custom-trace-count"
                type="number"
                min="1"
                max={totalTraces}
                value={customLimit}
                onChange={(e) => setCustomLimit(e.target.value)}
                className="mt-1.5 h-8"
                placeholder="Enter number"
              />
              <div className="text-xs text-gray-500 mt-1">
                Max: {totalTraces} available
              </div>
            </div>
          )}

          <div className="flex items-center justify-between pt-2 border-t border-gray-100">
            <Label htmlFor="randomize-toggle" className="text-sm text-gray-600 cursor-pointer flex items-center gap-2">
              <Shuffle className="w-3.5 h-3.5 text-gray-400" />
              Randomize trace order
            </Label>
            <Switch
              id="randomize-toggle"
              checked={randomizeTraces}
              onCheckedChange={setRandomizeTraces}
            />
          </div>

          {/* Summary */}
          <div className="flex items-center gap-2 text-xs text-gray-500 bg-gray-50 rounded-md px-3 py-2">
            <span className="font-medium text-gray-700">Summary:</span>
            {traceLimit === 'custom' ? `${customLimit} traces` : `${traceLimit} traces`}
            {randomizeTraces && ' · randomized per user'}
            {parseInt(traceLimit === 'custom' ? customLimit : traceLimit) < totalTraces && (
              <span className="ml-auto text-gray-400">
                ({totalTraces - parseInt(traceLimit === 'custom' ? customLimit : traceLimit)} unused)
              </span>
            )}
          </div>
        </CardContent>
      </Card>

      {/* No Traces Warning */}
      {totalTraces === 0 && (
        <Card className="border-l-4 border-amber-500">
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <Database className="h-5 w-5 text-amber-600" />
              <div>
                <h3 className="text-sm font-semibold text-amber-900">No traces available</h3>
                <p className="text-xs text-amber-700">
                  Complete MLflow ingestion in the Intake phase first, then return here.
                </p>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Start Button */}
      <div className="flex flex-col items-center gap-2 pt-2">
        <Button
          onClick={startDiscoveryPhase}
          disabled={isStarting || totalTraces === 0}
          size="lg"
          className="px-8"
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
          ) : (
            <>
              <Play className="w-4 h-4 mr-2" />
              Start Discovery Phase
            </>
          )}
        </Button>
        <span className="text-xs text-gray-400">
          Participants will access the discovery interface immediately.
        </span>
      </div>
    </div>
  );
};