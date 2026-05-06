import React from 'react';
import { useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { IntakePage } from '@/pages/IntakePage';
import { FacilitatorDashboard } from '@/components/FacilitatorDashboard';
import { FacilitatorUserManager } from '@/components/FacilitatorUserManager';
import { useUser } from '@/context/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { isProjectSetupApiError, isSetupBlockingStatus, useProjectSetupStatus } from '@/hooks/useProjectSetupApi';
import { SetupProgressCard } from './SetupProgressCard';

export function FacilitatorRootWorkspace() {
  const navigate = useNavigate();
  const { user, permissions } = useUser();
  const setupStatus = useProjectSetupStatus({ enabled: !!user });
  const canManageSetup = permissions?.can_manage_project === true;

  if (!canManageSetup) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Facilitator access required</CardTitle>
            <CardDescription>
              This workspace is available for facilitator accounts.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  if (setupStatus.isLoading) {
    return (
      <div className="flex min-h-96 items-center justify-center">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (setupStatus.data && isSetupBlockingStatus(setupStatus.data.status)) {
    return (
      <div className="p-6">
        <SetupProgressCard
          progress={setupStatus.data}
          onRetry={() => navigate('/project/setup')}
        />
      </div>
    );
  }

  if (setupStatus.error && !isProjectSetupApiError(setupStatus.error)) {
    return (
      <div className="p-6">
        <Card>
          <CardHeader>
            <CardTitle>Setup status unavailable</CardTitle>
            <CardDescription>
              We could not load setup status. Refresh the page to try again.
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  const handleDashboardNavigate = () => {
    // The root workspace keeps controls on one page.
  };

  return (
    <div className="space-y-8 p-6">
      <section>
        <Card>
          <CardContent className="pt-6">
            <IntakePage />
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Invite Participants</CardTitle>
            <CardDescription>
              Add workshop users and update SME or participant roles.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FacilitatorUserManager />
          </CardContent>
        </Card>
      </section>

      <section>
        <Card>
          <CardHeader>
            <CardTitle>Facilitator Dashboard</CardTitle>
            <CardDescription>
              Monitor current workshop activity and operational metrics.
            </CardDescription>
          </CardHeader>
          <CardContent>
            <FacilitatorDashboard onNavigate={handleDashboardNavigate} />
          </CardContent>
        </Card>
      </section>
    </div>
  );
}
