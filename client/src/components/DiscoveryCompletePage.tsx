import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { CheckCircle2, PartyPopper } from 'lucide-react';

export const DiscoveryCompletePage: React.FC = () => {
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      <div className="text-center space-y-3">
        <div className="w-16 h-16 bg-gradient-to-br from-green-400 to-emerald-500 rounded-2xl flex items-center justify-center mx-auto">
          <CheckCircle2 className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900">Discovery Complete!</h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          You've reviewed all assigned traces and provided feedback. Thank you for your contributions!
        </p>
        <Badge className="bg-green-100 text-green-800 px-3 py-1">
          <CheckCircle2 className="w-3 h-3 mr-1" />
          All Traces Reviewed
        </Badge>
      </div>

      <Card className="border-green-200 bg-gradient-to-br from-green-50 to-emerald-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <PartyPopper className="w-5 h-5 text-green-600" />
            What Happens Next
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-slate-600">
          <p>
            The facilitator will review all participant feedback and use it to create evaluation criteria
            for the next phase of the workshop.
          </p>
          <p>
            Your feedback helps build better rubrics for evaluating AI responses. The facilitator
            will let you know when the next phase is ready.
          </p>
        </CardContent>
      </Card>
    </div>
  );
};
