import React from 'react';
import { Outlet } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { WorkshopHeader } from '@/components/WorkshopHeader';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useWorkshopPhase } from '@/hooks/useWorkshopApi';

export function WorkflowShell() {
  const { workshopId, clearInvalidWorkshopId } = useWorkshopContext();
  const { error, isLoading } = useWorkshopPhase(workshopId || '');

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md w-full">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Workshop unavailable
            </CardTitle>
            <CardDescription>
              The selected workshop could not be loaded.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button onClick={clearInvalidWorkshopId} className="w-full">
              Select another workshop
            </Button>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="h-screen flex flex-col overflow-hidden bg-background">
      <WorkshopHeader
        showDescription={true}
        showPhase={true}
        showParticipantCount={false}
        variant="default"
      />
      <div className="flex-1 overflow-y-auto">
        <Outlet />
      </div>
    </div>
  );
}
