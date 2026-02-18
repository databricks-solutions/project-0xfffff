/**
 * AnnotationReviewPage Component
 * 
 * Read-only view of user's annotations shown when annotation phase is paused.
 * Similar to FindingsReviewPage for discovery phase.
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { TraceViewer, TraceData } from '@/components/TraceViewer';
import { 
  Star,
  ChevronLeft, 
  ChevronRight, 
  FileText, 
  CheckCircle,
  Clock,
  MessageCircle,
  User
} from 'lucide-react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useUser } from '@/context/UserContext';
import { useTraces, useRubric, useUserAnnotations } from '@/hooks/useWorkshopApi';
import type { Trace, Annotation } from '@/client';
import { parseRubricQuestions as parseQuestions } from '@/utils/rubricUtils';

// Convert API trace to TraceData format
const convertTraceToTraceData = (trace: Trace): TraceData => ({
  id: trace.id,
  input: trace.input,
  output: trace.output,
  context: trace.context || undefined,
  mlflow_trace_id: trace.mlflow_trace_id || undefined,
  mlflow_url: trace.mlflow_url || undefined,
  mlflow_host: trace.mlflow_host || undefined,
  mlflow_experiment_id: trace.mlflow_experiment_id || undefined
});

// Parse rubric question from API format
const parseRubricQuestions = (rubric: any) => {
  if (!rubric || !rubric.question) return [];
  
  return parseQuestions(rubric.question).map((q, index) => ({
    id: `${rubric.id}_${index}`,
    title: q.title,
    description: q.description
  }));
};

interface AnnotationReviewPageProps {
  onBack?: () => void;
}

export function AnnotationReviewPage({ onBack }: AnnotationReviewPageProps) {
  const { workshopId } = useWorkshopContext();
  const { user } = useUser();
  const [currentTraceIndex, setCurrentTraceIndex] = useState(0);

  // Fetch data - pass user ID for personalized trace ordering (must be before early returns)
  const { data: traces, isLoading: tracesLoading } = useTraces(workshopId!, user?.id ?? '');
  const { data: rubric, isLoading: rubricLoading } = useRubric(workshopId!);
  const { data: userAnnotations } = useUserAnnotations(workshopId!, user);

  // Check if user is logged in (after all hooks)
  if (!user || !user.id) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="text-lg font-medium text-gray-900 mb-2">
            Please Log In
          </div>
          <div className="text-sm text-gray-500">
            You must be logged in to review annotations.
          </div>
        </div>
      </div>
    );
  }
  
  // Filter to only show traces that have annotations
  const annotatedTraces = traces?.filter((trace: { id: string }) =>
    userAnnotations?.some(ann => ann.trace_id === trace.id)
  ) || [];
  
  const currentTrace = annotatedTraces[currentTraceIndex];
  const currentAnnotation = userAnnotations?.find(ann => ann.trace_id === currentTrace?.id);
  const questions = parseRubricQuestions(rubric);
  
  // Navigation
  const prevTrace = () => {
    if (currentTraceIndex > 0) {
      setCurrentTraceIndex(currentTraceIndex - 1);
    }
  };
  
  const nextTrace = () => {
    if (currentTraceIndex < annotatedTraces.length - 1) {
      setCurrentTraceIndex(currentTraceIndex + 1);
    }
  };
  
  // Get rating display
  const getRatingStars = (rating: number) => {
    return Array.from({ length: 5 }, (_, i) => (
      <Star
        key={i}
        className={`h-5 w-5 ${
          i < rating 
            ? 'fill-yellow-400 text-yellow-400' 
            : 'fill-gray-200 text-gray-200'
        }`}
      />
    ));
  };
  
  if (tracesLoading || rubricLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium text-gray-600">Loading annotations...</div>
        </div>
      </div>
    );
  }
  
  if (!userAnnotations || userAnnotations.length === 0) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center max-w-md">
          <div className="w-16 h-16 bg-amber-100 rounded-2xl flex items-center justify-center mx-auto mb-4">
            <Clock className="h-8 w-8 text-amber-600" />
          </div>
          <h3 className="text-lg font-semibold text-gray-900 mb-2">Annotation Phase Paused</h3>
          <p className="text-sm text-gray-600 mb-4">
            The annotation phase is currently paused by the facilitator.
          </p>
          <p className="text-xs text-gray-500">
            You haven't submitted any annotations yet. Wait for the facilitator to resume the annotation phase.
          </p>
        </div>
      </div>
    );
  }
  
  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-6xl mx-auto">
        {/* Header */}
        <div className="mb-6">
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-2xl font-bold text-gray-900 mb-2">Your Annotation Review</h1>
              <p className="text-gray-600">
                The annotation phase is paused. Review your submitted annotations below.
              </p>
            </div>
            <div className="text-right">
              <Badge variant="outline" className="mb-2">
                <Clock className="h-3 w-3 mr-1" />
                Phase Paused
              </Badge>
              <div className="text-sm text-gray-600">
                {userAnnotations?.length || 0} of {traces?.length || 0} traces annotated
              </div>
            </div>
          </div>
        </div>
        
        {/* Progress Bar */}
        <Card className="mb-6">
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-medium text-gray-700">Your Progress</span>
              <span className="text-sm text-gray-600">
                {userAnnotations?.length || 0}/{traces?.length || 0} completed
              </span>
            </div>
            <div className="w-full bg-gray-200 rounded-full h-2">
              <div 
                className="bg-green-600 h-2 rounded-full transition-all"
                style={{ width: `${((userAnnotations?.length || 0) / (traces?.length || 1)) * 100}%` }}
              />
            </div>
          </CardContent>
        </Card>
        
        {annotatedTraces.length > 0 ? (
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
            {/* Trace Viewer */}
            <div>
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <span>Trace {currentTraceIndex + 1} of {annotatedTraces.length}</span>
                    <Badge variant="outline">
                      {currentTrace?.id.slice(0, 8)}...
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  {currentTrace && (
                    <TraceViewer trace={convertTraceToTraceData(currentTrace)} />
                  )}
                </CardContent>
              </Card>
            </div>
            
            {/* Annotation Details */}
            <div className="space-y-4">
              {/* Rubric Questions and Ratings */}
              <Card>
                <CardHeader>
                  <CardTitle className="flex items-center gap-2">
                    <CheckCircle className="h-5 w-5 text-green-600" />
                    Your Submitted Ratings
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-4">
                  {questions.map((question, index) => (
                    <div key={question.id} className="p-4 bg-gray-50 rounded-lg">
                      <div className="font-medium text-gray-900 mb-1">
                        {question.title}
                      </div>
                      <div className="text-sm text-gray-600 mb-3">
                        {question.description}
                      </div>
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-medium text-gray-700">Your Rating:</span>
                        <div className="flex items-center gap-1">
                          {getRatingStars(currentAnnotation?.rating || 0)}
                        </div>
                        <Badge variant="outline">
                          {currentAnnotation?.rating || 0}/5
                        </Badge>
                      </div>
                    </div>
                  ))}
                </CardContent>
              </Card>
              
              {/* Feedback for Judge Alignment */}
              {currentAnnotation?.comment && (
                <Card>
                  <CardHeader>
                    <CardTitle className="flex items-center gap-2">
                      <MessageCircle className="h-5 w-5" />
                      Your Feedback for Judge Alignment
                    </CardTitle>
                  </CardHeader>
                  <CardContent>
                    <p className="text-xs text-gray-500 mb-2">
                      This feedback will be used to train and align the AI judge.
                    </p>
                    <div className="p-3 bg-gray-50 rounded-lg">
                      <p className="text-sm text-gray-700 whitespace-pre-wrap">
                        {currentAnnotation.comment}
                      </p>
                    </div>
                  </CardContent>
                </Card>
              )}
              
              {/* Navigation */}
              <div className="flex items-center justify-between">
                <Button
                  variant="outline"
                  onClick={prevTrace}
                  disabled={currentTraceIndex === 0}
                  className="flex items-center gap-2"
                >
                  <ChevronLeft className="h-4 w-4" />
                  Previous
                </Button>
                
                <span className="text-sm text-gray-600">
                  Reviewing {currentTraceIndex + 1} of {annotatedTraces.length} annotated traces
                </span>
                
                <Button
                  variant="outline"
                  onClick={nextTrace}
                  disabled={currentTraceIndex >= annotatedTraces.length - 1}
                  className="flex items-center gap-2"
                >
                  Next
                  <ChevronRight className="h-4 w-4" />
                </Button>
              </div>
            </div>
          </div>
        ) : (
          <Card>
            <CardContent className="p-8 text-center">
              <FileText className="h-12 w-12 text-gray-400 mx-auto mb-4" />
              <p className="text-gray-600">No annotations to review</p>
            </CardContent>
          </Card>
        )}
      </div>
    </div>
  );
}