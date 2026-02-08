import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Clock, Star, Users, ClipboardList, Eye, CheckCircle } from 'lucide-react';

export const AnnotationPendingPage: React.FC = () => {
  return (
    <div className="max-w-2xl mx-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 pb-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-amber-600">
          <Clock className="w-4 h-4 text-white" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Annotation Phase Pending</h1>
          <p className="text-sm text-gray-500">
            Waiting for the facilitator to start annotation. SMEs will begin rating traces once it begins.
          </p>
        </div>
        <Badge className="ml-auto bg-amber-50 text-amber-700 border border-amber-200">
          <Clock className="w-3 h-3 mr-1" />
          Waiting
        </Badge>
      </div>

      {/* What Happens During Annotation */}
      <Card className="border-l-4 border-purple-500">
        <CardContent className="p-4">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <Star className="w-4 h-4 text-purple-600" />
            What happens during annotation
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
                  Rate traces using the evaluation rubric
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-gray-300 mt-1.5 text-[6px]">●</span>
                  Score on 1-5 scale with detailed comments
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-gray-300 mt-1.5 text-[6px]">●</span>
                  Create consistent evaluation data
                </li>
              </ul>
            </div>
            <div className="space-y-1.5">
              <h4 className="text-xs font-semibold text-amber-700 uppercase tracking-wide flex items-center gap-1.5">
                <Eye className="w-3 h-3" />
                Participants
              </h4>
              <ul className="space-y-1 text-sm text-gray-600">
                <li className="flex items-start gap-1.5">
                  <span className="text-gray-300 mt-1.5 text-[6px]">●</span>
                  Observe the annotation process
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-gray-300 mt-1.5 text-[6px]">●</span>
                  Learn systematic evaluation methods
                </li>
                <li className="flex items-start gap-1.5">
                  <span className="text-gray-300 mt-1.5 text-[6px]">●</span>
                  Prepare for IRR results analysis
                </li>
              </ul>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Prerequisites */}
      <Card className="border-l-4 border-green-500">
        <CardContent className="p-4 space-y-3">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <ClipboardList className="w-4 h-4 text-green-600" />
            Prerequisites
          </h3>
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-gray-900">Discovery Phase Completed</p>
              <p className="text-xs text-gray-600">All participants have contributed insights</p>
            </div>
          </div>
          <div className="flex items-start gap-3">
            <CheckCircle className="w-5 h-5 text-green-600 mt-0.5 shrink-0" />
            <div>
              <p className="text-sm font-semibold text-gray-900">Evaluation Rubric Created</p>
              <p className="text-xs text-gray-600">Facilitator has built rubric from discovery findings</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Current Status */}
      <Card className="border-l-4 border-amber-500">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <div className="w-3 h-3 bg-amber-400 rounded-full animate-pulse"></div>
              <div>
                <p className="text-sm font-semibold text-gray-900">Preparing for Annotation</p>
                <p className="text-xs text-gray-600">The facilitator will start annotation when ready</p>
              </div>
            </div>
            <Badge variant="outline" className="text-amber-700 border-amber-300">
              Pre-Annotation
            </Badge>
          </div>
        </CardContent>
      </Card>

      {/* Footer */}
      <div className="text-center text-xs text-gray-400 pt-2">
        <p>This page will automatically update when the annotation phase begins.</p>
        <p className="mt-1">No action is required from you at this time.</p>
      </div>
    </div>
  );
};