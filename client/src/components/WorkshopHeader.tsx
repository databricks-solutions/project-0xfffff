import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { useQuery } from '@tanstack/react-query';
import { WorkshopsService } from '@/client';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useWorkflowContext } from '@/context/WorkflowContext';
import { useWorkshop } from '@/hooks/useWorkshopApi';

interface WorkshopHeaderProps {
  showDescription?: boolean;
  showPhase?: boolean;
  showParticipantCount?: boolean;
  variant?: 'default' | 'detailed';
}

export const WorkshopHeader: React.FC<WorkshopHeaderProps> = ({
  showDescription = true,
  showPhase = true,
  showParticipantCount = true,
  variant = 'default'
}) => {
  const { workshopId } = useWorkshopContext();
  const { currentPhase } = useWorkflowContext();
  const { data: workshop } = useWorkshop(workshopId!);
  const { data: participants = [] } = useQuery({
    queryKey: ['workshop-participants', workshopId],
    queryFn: async () => {
      if (!workshopId) return [];
      return WorkshopsService.getWorkshopParticipantsWorkshopsWorkshopIdParticipantsGet(workshopId);
    },
    enabled: !!workshopId,
  });

  const participantCount = Array.isArray(participants)
    ? participants.length
    : Array.isArray((participants as any)?.users)
      ? (participants as any).users.length
      : 0;

  if (!workshop) {
    return (
      <div className="border-b bg-background p-6">
        <div className="animate-pulse">
          <div className="h-6 bg-muted rounded w-1/3 mb-2"></div>
          <div className="h-4 bg-muted rounded w-1/2"></div>
        </div>
      </div>
    );
  }

  const getPhaseColor = (phase: string) => {
    switch (phase) {
      case 'intake': return 'bg-blue-100 text-blue-700 border-blue-200';
      case 'discovery': return 'bg-green-100 text-green-700 border-green-200';
      case 'rubric': return 'bg-purple-100 text-purple-700 border-purple-200';
      case 'annotation': return 'bg-orange-100 text-orange-700 border-orange-200';
      case 'results': return 'bg-red-100 text-red-700 border-red-200';
      case 'judge_tuning': return 'bg-indigo-100 text-indigo-700 border-indigo-200';
      case 'unity_volume': return 'bg-teal-100 text-teal-700 border-teal-200';
      default: return 'bg-muted text-muted-foreground border-border';
    }
  };

  const getPhaseName = (phase: string) => {
    switch (phase) {
      case 'intake': return 'Intake';
      case 'discovery': return 'Discovery';
      case 'rubric': return 'Rubric Creation';
      case 'annotation': return 'Annotation';
      case 'results': return 'Results';
      case 'judge_tuning': return 'Judge Tuning';
      case 'unity_volume': return 'Data Management';
      default: return phase;
    }
  };

  return (
    <div className="border-b bg-background/95 backdrop-blur supports-[backdrop-filter]:bg-background/60 px-6 py-4">
      <div className="flex items-center justify-between">
        <div className="flex-1">
          <div className="flex items-center gap-3">
            <h1 className="text-lg font-semibold text-foreground">
              {workshop.name}
            </h1>
            {showPhase && (
              <Badge variant="outline" className={`${getPhaseColor(currentPhase)} border font-medium`}>
                {getPhaseName(currentPhase)}
              </Badge>
            )}
          </div>
          
          {showDescription && workshop.description && (
            <p className="text-sm text-muted-foreground mt-1 max-w-2xl">
              {workshop.description}
            </p>
          )}
          
          {variant === 'detailed' && (
            <div className="flex items-center gap-4 text-xs text-muted-foreground mt-2">
              <span>ID: {workshop.id.slice(0, 8)}...</span>
              <span>Created: {new Date(workshop.created_at ?? '').toLocaleDateString()}</span>
              {showParticipantCount && (
                <span>Participants: {participantCount}</span>
              )}
            </div>
          )}
        </div>
        
        {variant === 'default' && showParticipantCount && (
          <div className="text-right">
            <div className="text-xs text-muted-foreground">Participants</div>
            <div className="text-2xl font-bold text-foreground">
              {participantCount}
            </div>
          </div>
        )}
      </div>
    </div>
  );
};