/**
 * WorkflowContext
 * 
 * Manages workflow state and phase progression across the application
 */

import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useWorkshopContext } from './WorkshopContext';
import { useAllTraces, useFindings, useRubric, useAnnotations, useWorkshop } from '@/hooks/useWorkshopApi';
import { useQuery } from '@tanstack/react-query';
import { useUser } from './UserContext';

interface WorkflowContextType {
  currentPhase: string;
  completedPhases: string[];
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
  const { data: workshop } = useWorkshop(isAuthenticated ? workshopId : '');
  const { data: participants } = useQuery({
    queryKey: ['workshop-participants', workshopId],
    queryFn: async () => {
      if (!workshopId) return [];
      const response = await fetch(`/workshops/${workshopId}/participants`);
      if (response.ok) {
        const data = await response.json();
        return data;
      } else {
        return [];
      }
    },
    enabled: isAuthenticated
  });
  // Use all traces for workflow context (general workshop flow tracking)
  const { data: traces } = useAllTraces(isAuthenticated ? workshopId : '');
  const { data: findings } = useFindings(isAuthenticated ? workshopId : '');
  const { data: rubric } = useRubric(isAuthenticated ? workshopId : '');
  const { data: annotations } = useAnnotations(isAuthenticated ? workshopId : '');

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

  // Auto-detect phase completion based on data for non-controllable phases (rubric, annotation, results)
  useEffect(() => {
    if (!traces || !workshopId || !workshop) return;

    const newCompletedPhases: string[] = [...(workshop.completed_phases || [])];

    // NOTE: Discovery and Annotation phase completion are now controlled by backend via pause/resume API
    // Do not auto-complete these phases here

    // Rubric phase: completed when rubric exists AND annotation phase has started
    if (rubric && Array.isArray(rubric) && rubric.length > 0 && 
        workshop?.current_phase && ['annotation', 'results', 'judge_tuning', 'unity_volume'].includes(workshop.current_phase)) {
      newCompletedPhases.push('rubric');
    }
    
    // Results phase: completed when we have enough annotations for IRR analysis OR when we're past this phase
    if ((annotations && annotations.length >= 2) || workshop?.current_phase === 'judge_tuning' || workshop?.current_phase === 'unity_volume') {
      newCompletedPhases.push('results');
    }
    
    // Judge tuning phase: mark complete when we're in judge_tuning or have progressed past it
    if (workshop?.current_phase === 'judge_tuning' || workshop?.current_phase === 'unity_volume') {
      newCompletedPhases.push('judge_tuning');
    }
    
    // Unity Volume phase: mark complete when workshop is in unity_volume phase
    if (workshop?.current_phase === 'unity_volume') {
      newCompletedPhases.push('unity_volume');
    }
        
    // Only update if there are actual changes and avoid overriding backend-controlled phases
    const backendControlledPhases = ['discovery', 'annotation']; 
    const backendPhases = workshop?.completed_phases || [];
    
    // Preserve backend-controlled phases and add frontend-determined phases
    const finalPhases = [
      ...backendPhases,
      ...newCompletedPhases.filter(phase => !backendControlledPhases.includes(phase) && !backendPhases.includes(phase))
    ];
    
    // Only update if different to avoid infinite loops
    const currentSet = new Set(completedPhases);
    const newSet = new Set(finalPhases);
    
    if (currentSet.size !== newSet.size || ![...currentSet].every(phase => newSet.has(phase))) {
      setCompletedPhases(finalPhases);
    }
    
    // REMOVED: Auto-advancement that was causing phase/navigation confusion
    // Phase changes now only happen through explicit facilitator actions via API calls
    // This ensures frontend phase stays in sync with backend workshop phase
  }, [traces, findings, rubric, annotations, participants, workshopId, user, workshop?.current_phase]);

  const markPhaseComplete = (phase: string) => {
    setCompletedPhases(prev => 
      prev.includes(phase) ? prev : [...prev, phase]
    );
  };

  const isPhaseComplete = (phase: string) => {
    return completedPhases.includes(phase);
  };

  const isPhaseEnabled = (phase: string) => {
    const phaseOrder = ['discovery', 'rubric', 'annotation', 'results', 'judge_tuning', 'unity_volume'];
    const currentIndex = phaseOrder.indexOf(phase);
    
    if (currentIndex === 0) return true; // Discovery is always enabled
    
    // Phase is enabled if the previous phase is completed
    const previousPhase = phaseOrder[currentIndex - 1];
    return isPhaseComplete(previousPhase);
  };

  const getPhaseProgress = () => {
    const total = 6; // Total number of phases: discovery, rubric, annotation, results, judge_tuning, unity_volume
    const completed = Math.min(completedPhases.length, total); // Cap completed at total
    const percentage = Math.round((completed / total) * 100);
    
    return { completed, total, percentage };
  };

  return (
    <WorkflowContext.Provider
      value={{
        currentPhase,
        completedPhases,
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