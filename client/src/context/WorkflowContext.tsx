/**
 * WorkflowContext
 * 
 * Manages workflow state and phase progression across the application
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useWorkshopContext } from './WorkshopContext';
import { useWorkshopPhase } from '@/hooks/useWorkshopApi';
import { useUser } from './UserContext';

interface WorkflowContextType {
  currentPhase: string;
  completedPhases: string[];
  workshopMode: 'workshop' | 'eval';
  isEvalMode: boolean;
  supportsGlobalRubric: boolean;
  supportsPerTraceCriteria: boolean;
  getDefaultRouteForPhase: (phase: string) => string;
  setCurrentPhase: (phase: string) => void;
  markPhaseComplete: (phase: string) => void;
  isPhaseComplete: (phase: string) => boolean;
  isPhaseEnabled: (phase: string) => boolean;
  getPhaseProgress: () => { completed: number; total: number; percentage: number };
}

const WorkflowContext = createContext<WorkflowContextType | undefined>(undefined);

interface WorkflowProviderProps {
  children: ReactNode;
}

export function WorkflowProvider({ children }: WorkflowProviderProps) {
  const { workshopId } = useWorkshopContext();
  const { user } = useUser();
  const [currentPhase, setCurrentPhase] = useState<string>('intake');
  const [completedPhases, setCompletedPhases] = useState<string[]>([]);

  // Fetch workshop data to determine completion status
  // Only fetch if we have a valid workshop ID AND an authenticated user.
  // Without the user gate, stale workshopId from localStorage causes polling
  // on the login page, hammering the backend with requests (503 storms).
  const isAuthenticated = !!workshopId && !!user;
  const { data: workshop } = useWorkshopPhase(isAuthenticated ? workshopId : '');
  const workshopMode: 'workshop' | 'eval' = workshop?.mode === 'eval' ? 'eval' : 'workshop';
  const isEvalMode = workshopMode === 'eval';
  const supportsGlobalRubric = workshopMode === 'workshop';
  const supportsPerTraceCriteria = workshopMode === 'eval';
  // Sync currentPhase with backend workshop phase - backend is source of truth
  useEffect(() => {
    if (workshop?.current_phase) {
      setCurrentPhase(workshop.current_phase);
    }
  }, [workshop?.current_phase]);

  // Sync completed phases with backend - backend is source of truth for phase completion
  useEffect(() => {
    if (workshop?.completed_phases) {
      setCompletedPhases(workshop.completed_phases);
    }
  }, [workshop?.completed_phases]);

  const markPhaseComplete = (phase: string) => {
    setCompletedPhases(prev => 
      prev.includes(phase) ? prev : [...prev, phase]
    );
  };

  const isPhaseComplete = (phase: string) => {
    return completedPhases.includes(phase);
  };

  const isPhaseEnabled = (phase: string) => {
    const phaseOrder = ['discovery', 'rubric', 'annotation', 'results', 'judge_tuning'];
    const currentIndex = phaseOrder.indexOf(phase);
    
    if (currentIndex === 0) return true; // Discovery is always enabled
    
    // Phase is enabled if the previous phase is completed
    const previousPhase = phaseOrder[currentIndex - 1];
    return isPhaseComplete(previousPhase);
  };

  const getPhaseProgress = () => {
    const total = 5; // Total number of phases: discovery, rubric, annotation, results, judge_tuning
    const completed = Math.min(completedPhases.length, total); // Cap completed at total
    const percentage = Math.round((completed / total) * 100);
    
    return { completed, total, percentage };
  };

  const getDefaultRouteForPhase = (phase: string) => {
    if (workshopId) {
      return `/workshop/${workshopId}/${phase}`;
    }
    return '/';
  };

  return (
    <WorkflowContext.Provider
      value={{
        currentPhase,
        completedPhases,
        workshopMode,
        isEvalMode,
        supportsGlobalRubric,
        supportsPerTraceCriteria,
        getDefaultRouteForPhase,
        setCurrentPhase,
        markPhaseComplete,
        isPhaseComplete,
        isPhaseEnabled,
        getPhaseProgress
      }}
    >
      {children}
    </WorkflowContext.Provider>
  );
}

export function useWorkflowContext() {
  const context = useContext(WorkflowContext);
  if (context === undefined) {
    throw new Error('useWorkflowContext must be used within a WorkflowProvider');
  }
  return context;
}