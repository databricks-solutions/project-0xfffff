import React from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  ListChecks, 
  ToggleLeft, 
  MessageSquareText,
  CheckCircle2
} from 'lucide-react';
import type { JudgeType } from '@/client';

interface JudgeTypeSelectorProps {
  selectedType: JudgeType;
  onTypeChange: (type: JudgeType) => void;
  disabled?: boolean;
}

const judgeTypes: { 
  type: JudgeType; 
  title: string; 
  description: string; 
  icon: React.ReactNode;
  features: string[];
  useCases: string[];
}[] = [
  {
    type: 'likert',
    title: 'Likert Scale Judge',
    description: 'Rubric-based scoring with 1-5 scale ratings',
    icon: <ListChecks className="w-6 h-6" />,
    features: [
      '1-5 Likert scale ratings',
      'Multiple evaluation criteria',
      'Detailed rubric alignment',
      'IRR metrics support'
    ],
    useCases: [
      'Quality evaluation',
      'Response completeness',
      'Factual accuracy scoring'
    ]
  },
  {
    type: 'binary',
    title: 'Binary Judge',
    description: 'Simple pass/fail or yes/no evaluation',
    icon: <ToggleLeft className="w-6 h-6" />,
    features: [
      'Pass/Fail decisions',
      'Custom label support',
      'High-speed evaluation',
      'Clear thresholds'
    ],
    useCases: [
      'Safety checks',
      'Policy compliance',
      'Hallucination detection'
    ]
  },
  {
    type: 'freeform',
    title: 'Free-form Feedback',
    description: 'Open-ended qualitative analysis',
    icon: <MessageSquareText className="w-6 h-6" />,
    features: [
      'Detailed text feedback',
      'Qualitative insights',
      'Flexible format',
      'Rich explanations'
    ],
    useCases: [
      'Improvement suggestions',
      'Error categorization',
      'Detailed critique'
    ]
  }
];

export function JudgeTypeSelector({ selectedType, onTypeChange, disabled }: JudgeTypeSelectorProps) {
  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
      {judgeTypes.map((judge) => {
        const isSelected = selectedType === judge.type;
        
        return (
          <Card
            key={judge.type}
            className={`cursor-pointer transition-all duration-200 hover:shadow-md ${
              isSelected 
                ? 'ring-2 ring-primary border-primary bg-primary/5' 
                : 'hover:border-primary/50'
            } ${disabled ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => !disabled && onTypeChange(judge.type)}
          >
            <CardHeader className="pb-2">
              <div className="flex items-center justify-between">
                <div className={`p-2 rounded-lg ${isSelected ? 'bg-primary text-primary-foreground' : 'bg-muted'}`}>
                  {judge.icon}
                </div>
                {isSelected && (
                  <CheckCircle2 className="w-5 h-5 text-primary" />
                )}
              </div>
              <CardTitle className="text-lg mt-2">{judge.title}</CardTitle>
              <CardDescription>{judge.description}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-3">
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Features</p>
                  <div className="flex flex-wrap gap-1">
                    {judge.features.slice(0, 3).map((feature, idx) => (
                      <Badge key={idx} variant="secondary" className="text-xs">
                        {feature}
                      </Badge>
                    ))}
                  </div>
                </div>
                <div>
                  <p className="text-xs font-medium text-muted-foreground mb-1.5">Use Cases</p>
                  <ul className="text-xs text-muted-foreground space-y-0.5">
                    {judge.useCases.map((useCase, idx) => (
                      <li key={idx} className="flex items-center gap-1">
                        <span className="w-1 h-1 rounded-full bg-muted-foreground" />
                        {useCase}
                      </li>
                    ))}
                  </ul>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}

// Default prompt templates for each judge type
export const defaultPromptTemplates: Record<JudgeType, string> = {
  likert: `You are an expert evaluator assessing the quality of an AI assistant's response.

## Evaluation Criteria
{rubric}

## Task
Rate the response on a scale of 1-5 where:
- 1 = Poor: Does not meet the criteria
- 2 = Below Average: Partially meets criteria with significant issues
- 3 = Average: Meets basic criteria but has room for improvement
- 4 = Good: Meets criteria well with minor issues
- 5 = Excellent: Fully meets or exceeds all criteria

## Input
{input}

## Output to Evaluate
{output}

Provide your rating as a single number (1-5) followed by a brief explanation.`,

  binary: `You are an expert evaluator performing a quality check on an AI assistant's response.

## Evaluation Criteria
{criteria}

## Task
Determine if the response meets the evaluation criteria.

- 1: The response meets the required criteria (PASS)
- 0: The response does not meet the required criteria (FAIL)

## Input
{input}

## Output to Evaluate
{output}

Think step by step about whether the output meets the criteria, then provide your rating.

Your response MUST start with a single integer rating (0 or 1) on its own line, followed by your reasoning.

Example format:
1
The response meets the criteria because...`,

  freeform: `You are an expert evaluator providing detailed feedback on an AI assistant's response.

## Evaluation Focus
{focus}

## Task
Provide constructive feedback on the response, including:
1. Strengths of the response
2. Areas for improvement
3. Specific suggestions for enhancement

## Input
{input}

## Output to Evaluate
{output}

Provide your detailed feedback below.`
};

// Binary label presets
export const binaryLabelPresets: Record<string, Record<string, string>> = {
  'pass_fail': { pass: 'Pass', fail: 'Fail' },
  'yes_no': { pass: 'Yes', fail: 'No' },
  'accept_reject': { pass: 'Accept', fail: 'Reject' },
  'safe_unsafe': { pass: 'Safe', fail: 'Unsafe' },
  'compliant_violation': { pass: 'Compliant', fail: 'Violation' }
};

