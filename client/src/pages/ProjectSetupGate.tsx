import React from 'react';
import { Navigate, Outlet } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { UserRole } from '@/client';
import { useUser } from '@/context/UserContext';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import {
  isProjectSetupApiError,
  isSetupBlockingStatus,
  useProjectSetupStatus,
} from '@/hooks/useProjectSetupApi';

function SetupWaitingState() {
  return (
    <div className="min-h-screen bg-background p-6">
      <Card className="mx-auto max-w-xl">
        <CardHeader>
          <CardTitle>Project setup is not ready</CardTitle>
          <CardDescription>
            A facilitator needs to complete project setup before this workspace is available.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}

export function ProjectSetupGate() {
  const { user, permissions } = useUser();
  const canManageSetup = user?.role === UserRole.FACILITATOR || permissions?.can_manage_workshop === true;
  const setupStatus = useProjectSetupStatus({ enabled: !!user });

  if (setupStatus.isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (isProjectSetupApiError(setupStatus.error) && setupStatus.error.status === 404) {
    return canManageSetup ? <Navigate to="/project/setup" replace /> : <SetupWaitingState />;
  }

  if (setupStatus.error) {
    return (
      <div className="min-h-screen bg-background p-6">
        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <CardTitle>Setup status unavailable</CardTitle>
            <CardDescription>
              We could not load project setup status. Try refreshing the page.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (isSetupBlockingStatus(setupStatus.data?.status) && !canManageSetup) {
    return <SetupWaitingState />;
  }

  return <Outlet />;
}
