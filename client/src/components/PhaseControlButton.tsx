import React from 'react';
import { Button } from '@/components/ui/button';
import { Play, Pause } from 'lucide-react';
import { useQueryClient } from '@tanstack/react-query';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useWorkshop } from '@/hooks/useWorkshopApi';
import { toast } from 'sonner';

interface PhaseControlButtonProps {
  phase: string;
  onStatusChange?: () => void;
}

export const PhaseControlButton: React.FC<PhaseControlButtonProps> = ({ 
  phase, 
  onStatusChange 
}) => {
  const { workshopId } = useWorkshopContext();
  const { data: workshop } = useWorkshop(workshopId!);
  const queryClient = useQueryClient();
  const [isLoading, setIsLoading] = React.useState(false);
  
  // Check if this phase can be paused/resumed (only discovery and annotation)
  const isControllablePhase = ['discovery', 'annotation'].includes(phase);
  if (!isControllablePhase) return null;
  
  // Check if phase is completed
  const isCompleted = workshop?.completed_phases?.includes(phase) || false;
  
  const handleToggle = async () => {
    if (!workshopId) return;
    
    setIsLoading(true);
    try {
      const endpoint = isCompleted 
              ? `/workshops/${workshopId}/resume-phase/${phase}`
      : `/workshops/${workshopId}/complete-phase/${phase}`;
      
      const response = await fetch(endpoint, { 
        method: 'POST',
        headers: {
          'Content-Type': 'application/json'
        }
      });
      
      if (!response.ok) {
        const error = await response.json();
        throw new Error(error.detail || 'Failed to update phase status');
      }
      
      // Refresh workshop data
      await queryClient.invalidateQueries({ queryKey: ['workshop', workshopId] });
      
      if (onStatusChange) {
        onStatusChange();
      }
      
    } catch (error) {
      
      toast.error(`Failed to ${isCompleted ? 'resume' : 'pause'} phase: ${error.message}`);
    } finally {
      setIsLoading(false);
    }
  };
  
  return (
    <Button
      onClick={handleToggle}
      disabled={isLoading}
      variant={isCompleted ? "default" : "destructive"}
      size="sm"
      className="flex items-center gap-2 min-w-[100px] justify-center"
    >
      {isLoading ? (
        <>
          <div className="w-4 h-4 border-2 border-current/30 border-t-current rounded-full animate-spin" />
          <span className="text-sm">Working...</span>
        </>
      ) : isCompleted ? (
        <>
          <Play className="w-4 h-4" />
          <span className="text-sm font-medium">Resume {phase}</span>
        </>
      ) : (
        <>
          <Pause className="w-4 h-4" />
          <span className="text-sm font-medium">Pause {phase}</span>
        </>
      )}
    </Button>
  );
};