import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Monitor, Users, Info } from 'lucide-react';

interface FacilitatorScreenShareProps {
  phase: string;
}

export const FacilitatorScreenShare: React.FC<FacilitatorScreenShareProps> = ({ phase }) => {
  const getPhaseDescription = () => {
    switch (phase.toLowerCase()) {
      case 'intake':
        return 'The facilitator is configuring and loading MLflow traces for the workshop.';
      case 'rubric':
        return 'The facilitator is creating the evaluation criteria for annotations.';
      case 'results':
        return 'The facilitator will present the inter-rater reliability results and insights.';
      case 'judge_tuning':
        return 'The facilitator is fine-tuning the LLM judge based on workshop annotations.';
      case 'prompt_optimization':
        return 'The facilitator is optimizing the agent system prompt using GEPA.';
      case 'dbsql_export':
        return 'The facilitator is exporting the judge configuration to Databricks SQL.';
      default:
        return 'The facilitator is managing this phase of the workshop.';
    }
  };

  return (
    <div className="max-w-2xl mx-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 pb-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-blue-600">
          <Monitor className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Facilitator-Led Activity</h1>
          <p className="text-sm text-gray-500">The facilitator is managing this phase of the workshop.</p>
        </div>
      </div>

      {/* Info Card */}
      <Card className="border-l-4 border-blue-500">
        <CardContent className="p-4">
          <p className="text-sm text-gray-700 mb-3">
            {getPhaseDescription()}
          </p>
          <p className="text-xs text-gray-500">
            The facilitator will share their screen with the group for this part of the workshop.
          </p>
        </CardContent>
      </Card>

      {/* Tip Card */}
      <Card className="border-l-4 border-gray-500">
        <CardContent className="p-4">
          <div className="flex items-start gap-2">
            <Info className="w-4 h-4 text-blue-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm text-gray-700">
                <span className="font-semibold">Tip:</span> You can participate by providing feedback and asking questions during the screen share.
              </p>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
