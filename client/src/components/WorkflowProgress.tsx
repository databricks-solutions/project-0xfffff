/**
 * WorkflowProgress Component
 * 
 * Shows the current phase and progress through the workshop workflow
 */

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import {
  CheckCircle,
  Circle,
  ArrowRight,
  Search,
  FileText,
  Star,
  BarChart3,
  ChevronRight,
  Brain,
  Table,
  Settings,
  Database,
  Sparkles,
} from 'lucide-react';

export interface WorkflowPhase {
  id: string;
  name: string;
  description: string;
  icon: React.ComponentType<any>;
  path: string;
  completed: boolean;
  current: boolean;
  enabled: boolean;
}

interface WorkflowProgressProps {
  phases: WorkflowPhase[];
  onNavigate?: (phase: WorkflowPhase) => void;
  showNavigation?: boolean;
}

export const WorkflowProgress: React.FC<WorkflowProgressProps> = ({
  phases,
  onNavigate,
  showNavigation = true
}) => {
  const currentPhase = phases.find(p => p.current);
  const completedPhases = phases.filter(p => p.completed);
  const totalPhases = phases.length;

  return (
    <Card className="mb-6">
      <CardContent className="pt-6">
        <div className="flex items-center justify-between mb-4">
          <div>
            <h3 className="text-lg font-semibold text-gray-900">Workshop Progress</h3>
            <p className="text-sm text-gray-600">
              {currentPhase?.name} • {completedPhases.length} of {totalPhases} phases complete
            </p>
          </div>
          <Badge variant="outline" className="bg-blue-50 text-blue-700">
            {Math.round((completedPhases.length / totalPhases) * 100)}% Complete
          </Badge>
        </div>

        {/* Progress Bar */}
        <div className="w-full bg-gray-200 rounded-full h-2 mb-6">
          <div 
            className="bg-blue-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(completedPhases.length / totalPhases) * 100}%` }}
          />
        </div>

        {/* Phase Steps */}
        <div className="flex items-center justify-between">
          {phases.map((phase, index) => {
            const Icon = phase.icon;
            const isLast = index === phases.length - 1;
            
            return (
              <div key={phase.id} className="flex items-center">
                <div className="flex flex-col items-center">
                  <div 
                    className={`
                      w-10 h-10 rounded-full flex items-center justify-center mb-2 transition-all
                      ${phase.completed 
                        ? 'bg-green-500 text-white' 
                        : phase.current 
                          ? 'bg-blue-500 text-white' 
                          : phase.enabled 
                            ? 'bg-gray-200 text-gray-600 hover:bg-gray-300' 
                            : 'bg-gray-100 text-gray-400'
                      }
                      ${showNavigation && phase.enabled && onNavigate ? 'cursor-pointer' : ''}
                    `}
                    onClick={() => {
                      if (showNavigation && phase.enabled && onNavigate) {
                        onNavigate(phase);
                      }
                    }}
                  >
                    {phase.completed ? (
                      <CheckCircle className="h-5 w-5" />
                    ) : (
                      <Icon className="h-5 w-5" />
                    )}
                  </div>
                  <div className="text-center">
                    <p className={`text-xs font-medium ${
                      phase.current ? 'text-blue-600' : 
                      phase.completed ? 'text-green-600' : 
                      phase.enabled ? 'text-gray-600' : 'text-gray-400'
                    }`}>
                      {phase.name}
                    </p>
                    <p className="text-xs text-gray-500 mt-1 max-w-[80px]">
                      {phase.description}
                    </p>
                  </div>
                </div>
                
                {!isLast && (
                  <ChevronRight className="h-4 w-4 text-gray-400 mx-4 mt-[-20px]" />
                )}
              </div>
            );
          })}
        </div>

        {/* Current Phase Info */}
        {currentPhase && (
          <div className="mt-6 p-4 bg-blue-50 rounded-lg border border-blue-200">
            <div className="flex items-center gap-2 mb-2">
              <currentPhase.icon className="h-4 w-4 text-blue-600" />
              <span className="font-medium text-blue-800">{currentPhase.name}</span>
            </div>
            <p className="text-sm text-blue-700">{currentPhase.description}</p>
          </div>
        )}
      </CardContent>
    </Card>
  );
};

// Default workflow phases
export const createDefaultWorkflowPhases = (
  currentPhaseId: string,
  completedPhases: string[] = []
): WorkflowPhase[] => {
  const phases: WorkflowPhase[] = [
    {
      id: 'discovery',
      name: 'Discovery',
      description: 'Review traces and identify insights',
      icon: Search,
      path: '/discovery',
      completed: completedPhases.includes('discovery'),
      current: currentPhaseId === 'discovery',
      enabled: true
    },
    {
      id: 'rubric',
      name: 'Rubric',
      description: 'Create evaluation criteria',
      icon: FileText,
      path: '/rubric',
      completed: completedPhases.includes('rubric'),
      current: currentPhaseId === 'rubric',
      enabled: completedPhases.includes('discovery')
    },
    {
      id: 'annotation',
      name: 'Annotation',
      description: 'Rate traces using rubric',
      icon: Star,
      path: '/annotation',
      completed: completedPhases.includes('annotation'),
      current: currentPhaseId === 'annotation',
      enabled: completedPhases.includes('rubric')
    },
    {
      id: 'results',
      name: 'Results Review',
      description: 'View reliability analysis',
      icon: BarChart3,
      path: '/results',
      completed: completedPhases.includes('results'),
      current: currentPhaseId === 'results',
      enabled: completedPhases.includes('annotation')
    },
    {
      id: 'judge_tuning',
      name: 'Judge Tuning',
      description: 'Tune AI judges from annotations',
      icon: Settings,
      path: '/judge_tuning',
      completed: completedPhases.includes('judge_tuning'),
      current: currentPhaseId === 'judge_tuning',
      enabled: completedPhases.includes('results')
    },
    {
      id: 'prompt_optimization',
      name: 'Prompt Optimization',
      description: 'Optimize agent prompt with GEPA',
      icon: Sparkles,
      path: '/prompt_optimization',
      completed: completedPhases.includes('prompt_optimization'),
      current: currentPhaseId === 'prompt_optimization',
      enabled: completedPhases.includes('judge_tuning')
    },
    {
      id: 'unity_volume',
      name: 'Manage Workshop Data',
      description: 'Upload to Unity Volume or download workshop data',
      icon: Database,
      path: '/unity_volume',
      completed: completedPhases.includes('unity_volume'),
      current: currentPhaseId === 'unity_volume',
      enabled: completedPhases.includes('prompt_optimization') || completedPhases.includes('judge_tuning')
    }
  ];

  return phases;
};