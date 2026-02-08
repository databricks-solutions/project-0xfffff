import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Pause, Clock, ArrowLeft, CheckCircle } from 'lucide-react';
import { useWorkflowContext } from '@/context/WorkflowContext';

interface PhasePausedViewProps {
  phase: 'discovery' | 'annotation';
  onBack?: () => void;
}

export const PhasePausedView: React.FC<PhasePausedViewProps> = ({ phase, onBack }) => {
  const { currentPhase } = useWorkflowContext();

  const phaseConfig = {
    discovery: {
      title: 'Discovery Phase Paused',
      description: 'The discovery phase has been temporarily paused by the facilitator.',
      iconColor: 'text-blue-600',
      borderColor: 'border-blue-500',
      nextPhase: 'The facilitator will resume discovery or advance to the rubric creation phase.'
    },
    annotation: {
      title: 'Annotation Phase Paused',
      description: 'The annotation phase has been temporarily paused by the facilitator.',
      iconColor: 'text-purple-600',
      borderColor: 'border-purple-500',
      nextPhase: 'The facilitator will resume annotation or advance to the results phase.'
    }
  };

  const config = phaseConfig[phase];

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 pb-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
          <Pause className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">{config.title}</h1>
          <p className="text-sm text-gray-500">{config.description}</p>
        </div>
      </div>

      {/* Status Card */}
      <Card className={`border-l-4 ${config.borderColor}`}>
        <CardContent className="p-4 space-y-3">
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-gray-900">Your Contributions Saved</p>
              <p className="text-xs text-gray-600">
                All your {phase === 'discovery' ? 'findings' : 'annotations'} have been saved successfully.
              </p>
            </div>
          </div>

          <div className="flex items-start gap-3">
            <Clock className="w-5 h-5 text-amber-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-gray-900">Waiting for Facilitator</p>
              <p className="text-xs text-gray-600">
                {config.nextPhase}
              </p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* What to Do Card */}
      <Card className="border-l-4 border-gray-500">
        <CardContent className="p-4">
          <h3 className="text-base font-semibold text-gray-900 mb-3">What You Can Do Now</h3>
          <ul className="space-y-2 text-sm text-gray-600">
            <li className="flex items-start gap-2">
              <span className="text-gray-300 mt-1">•</span>
              <span>Take a break and wait for the facilitator to resume</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-300 mt-1">•</span>
              <span>Stay on this page to be notified when the phase resumes</span>
            </li>
            <li className="flex items-start gap-2">
              <span className="text-gray-300 mt-1">•</span>
              <span>The page will automatically update when the phase status changes</span>
            </li>
          </ul>
        </CardContent>
      </Card>

      {/* Action Button */}
      {onBack && (
        <div className="flex justify-center pt-2">
          <Button
            variant="outline"
            size="sm"
            onClick={onBack}
            className="flex items-center gap-2"
          >
            <ArrowLeft className="w-4 h-4" />
            Return to Dashboard
          </Button>
        </div>
      )}

      {/* Footer */}
      <div className="text-center text-xs text-gray-400 pt-2">
        <p>This page will refresh automatically when the phase status changes.</p>
        <p className="mt-1">No action is required from you at this time.</p>
      </div>
    </div>
  );
};
