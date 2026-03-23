import React, { useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Search, Users, Lightbulb } from 'lucide-react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useWorkshop } from '@/hooks/useWorkshopApi';

export const DiscoveryPendingPage: React.FC = () => {
  const { workshopId } = useWorkshopContext();
  const { refetch } = useWorkshop(workshopId || '');

  // Auto-refresh every 5 seconds to detect when discovery starts
  useEffect(() => {
    if (!workshopId) return;
    const interval = setInterval(() => {
      refetch();
    }, 5000);
    return () => clearInterval(interval);
  }, [workshopId, refetch]);
  return (
    <div className="max-w-3xl mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-3">
        <div className="w-16 h-16 bg-gradient-to-br from-amber-400 to-orange-500 rounded-2xl flex items-center justify-center mx-auto">
          <Clock className="w-8 h-8 text-white" />
        </div>
        <h1 className="text-3xl font-bold text-slate-900">Discovery Phase Pending</h1>
        <p className="text-lg text-slate-600 max-w-2xl mx-auto">
          Waiting for the facilitator to start the discovery phase. You'll be able to participate once it begins.
        </p>
        <Badge className="bg-amber-100 text-amber-800 px-3 py-1">
          <Clock className="w-3 h-3 mr-1" />
          Waiting for Facilitator
        </Badge>
      </div>

      {/* What to Expect */}
      <Card className="border-blue-200 bg-gradient-to-br from-blue-50 to-indigo-50">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Search className="w-5 h-5 text-blue-600" />
            What You'll Do in Discovery
          </CardTitle>
          <CardDescription>
            Here's what you can expect once the discovery phase begins
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-3">
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-blue-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Search className="w-4 h-4 text-blue-600" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900">Explore LLM Traces</h4>
                <p className="text-sm text-slate-600 mt-1">
                  Review conversation traces between users and AI assistants to understand response patterns and quality.
                </p>
              </div>
            </div>
            
            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-green-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Lightbulb className="w-4 h-4 text-green-600" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900">Share Quality Insights</h4>
                <p className="text-sm text-slate-600 mt-1">
                  Identify what makes responses effective or ineffective, contributing valuable observations for rubric creation.
                </p>
              </div>
            </div>

            <div className="flex items-start gap-3">
              <div className="w-8 h-8 bg-purple-100 rounded-lg flex items-center justify-center flex-shrink-0">
                <Users className="w-4 h-4 text-purple-600" />
              </div>
              <div>
                <h4 className="font-semibold text-slate-900">Collaborate with Team</h4>
                <p className="text-sm text-slate-600 mt-1">
                  Work alongside SMEs and other participants to build a comprehensive understanding of quality criteria.
                </p>
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Status */}
      <Card>
        <CardHeader>
          <CardTitle className="text-slate-700">Current Workshop Status</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-between p-4 bg-slate-50 rounded-lg border-2 border-slate-200">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-amber-400 rounded-full animate-pulse"></div>
              <div>
                <p className="font-medium text-slate-900">Awaiting Phase Start</p>
                <p className="text-sm text-slate-600">The facilitator will begin discovery when everyone is ready</p>
              </div>
            </div>
            <Badge variant="outline" className="text-amber-700 border-amber-300">
              Intake Phase
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Helpful Tips */}
      <Card className="border-slate-200">
        <CardHeader>
          <CardTitle className="text-slate-700">While You Wait</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-3 text-sm text-slate-600">
            <div className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full mt-2 flex-shrink-0"></div>
              <p>This page will automatically update when the discovery phase begins</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full mt-2 flex-shrink-0"></div>
              <p>Think about what makes a good AI response - you'll be analyzing real examples soon</p>
            </div>
            <div className="flex items-start gap-2">
              <div className="w-1.5 h-1.5 bg-slate-400 rounded-full mt-2 flex-shrink-0"></div>
              <p>The facilitator is preparing the workshop materials and will start when ready</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="text-center text-sm text-slate-500">
        <p>Your participation is important - stay tuned for the discovery phase to begin!</p>
      </div>
    </div>
  );
};