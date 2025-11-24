/**
 * RubricViewPage Component
 * 
 * Read-only view of the rubric for SMEs and participants.
 * Shows the rubric questions created by the facilitator.
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ClipboardList, 
  CheckCircle, 
  Star,
  Users
} from 'lucide-react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useRubric } from '@/hooks/useWorkshopApi';
import { parseRubricQuestions, type RubricQuestion } from '@/utils/rubricUtils';

// Convert API Rubric to local RubricQuestion format
const convertApiRubricToQuestions = (rubric: any): RubricQuestion[] => {
  if (!rubric || !rubric.question) return [];
  
  return parseRubricQuestions(rubric.question).map((q, index) => ({
    id: `${rubric.id}_${index}`,
    title: q.title,
    description: q.description
  }));
};

export function RubricViewPage() {
  const { workshopId } = useWorkshopContext();
  const { data: rubric, isLoading, error } = useRubric(workshopId!);
  
  if (isLoading) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium text-gray-600 mb-2">Loading rubric...</div>
          <div className="text-sm text-gray-500">Fetching evaluation criteria</div>
        </div>
      </div>
    );
  }
  
  if (error || !rubric) {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center">
          <div className="text-lg font-medium text-gray-600 mb-2">No rubric available</div>
          <div className="text-sm text-gray-500">The facilitator has not created evaluation criteria yet.</div>
        </div>
      </div>
    );
  }
  
  const questions = convertApiRubricToQuestions(rubric);
  
  return (
    <div className="h-full">
      <div className="max-w-4xl mx-auto p-6 space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Evaluation Rubric</h1>
          <p className="text-lg text-gray-600">
            Review the evaluation criteria created by the facilitator
          </p>
        </div>
        
        {/* Status Badges */}
        <div className="flex justify-center gap-2">
          <Badge className="bg-green-500">
            <CheckCircle className="h-3 w-3 mr-1" />
            Rubric Created
          </Badge>
          <Badge variant="outline">
            <Users className="h-3 w-3 mr-1" />
            Read Only
          </Badge>
        </div>
        
        {/* Rubric Questions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <ClipboardList className="h-5 w-5 text-blue-600" />
              Evaluation Criteria
            </CardTitle>
          </CardHeader>
          <CardContent className="space-y-4">
            {questions.map((question, index) => (
              <div key={question.id} className="border border-green-200 rounded-lg p-4 bg-green-50">
                <div className="flex items-start gap-3">
                  <div className="flex-shrink-0 w-8 h-8 bg-green-500 text-white rounded-full flex items-center justify-center text-sm font-medium">
                    {index + 1}
                  </div>
                  <div className="flex-1">
                    <h3 className="font-medium text-green-900 mb-2">{question.title}</h3>
                    <p className="text-green-700 text-sm mb-3">{question.description}</p>
                    
                    {/* Likert Scale Preview */}
                    <div className="bg-white rounded-lg p-3 border border-green-200">
                      <div className="text-xs text-gray-500 mb-2">Rating Scale (1-5)</div>
                      <div className="flex justify-between items-center">
                        {[1, 2, 3, 4, 5].map((value) => (
                          <div key={value} className="flex flex-col items-center gap-1">
                            <div className="w-4 h-4 rounded-full border-2 border-gray-300 bg-white" />
                            <span className="text-xs text-gray-600">
                              {value === 1 && 'Strongly Disagree'}
                              {value === 2 && 'Disagree'}
                              {value === 3 && 'Neutral'}
                              {value === 4 && 'Agree'}
                              {value === 5 && 'Strongly Agree'}
                            </span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </div>
              </div>
            ))}
            
            {questions.length === 0 && (
              <div className="text-center text-gray-500 py-8">
                <ClipboardList className="h-12 w-12 mx-auto mb-4 text-gray-300" />
                <p>No evaluation criteria defined yet.</p>
              </div>
            )}
          </CardContent>
        </Card>
        
        {/* Summary */}
        {questions.length > 0 && (
          <Card className="bg-blue-50 border-blue-200">
            <CardContent className="pt-6">
              <div className="flex items-center gap-2 mb-2">
                <ClipboardList className="h-4 w-4 text-blue-600" />
                <span className="font-medium text-blue-800">Rubric Summary</span>
              </div>
              <p className="text-sm text-blue-700">
                {questions.length} evaluation criteria{questions.length !== 1 ? '' : 'a'} created by the facilitator. 
                Each criterion will be rated on a 1-5 Likert scale during the annotation phase.
              </p>
            </CardContent>
          </Card>
        )}
        
        {/* Instructions */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Star className="h-5 w-5 text-yellow-600" />
              Next Steps
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-4">
              <p className="text-sm text-yellow-800">
                The facilitator will start the annotation phase when ready. During annotation, 
                you will use these evaluation criteria to rate LLM responses on a 1-5 scale.
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
} 