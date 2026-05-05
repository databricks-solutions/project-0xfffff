import React from 'react';
import { UserRole } from '@/client';
import { IntakePage } from '@/pages/IntakePage';
import { FacilitatorDashboard } from '@/components/FacilitatorDashboard';
import { FacilitatorUserManager } from '@/components/FacilitatorUserManager';
import { SetupProgressCard } from '@/components/workspace/SetupProgressCard';
import { useUser } from '@/context/UserContext';
import { useProjectSetupStatus } from '@/hooks/useProjectSetupApi';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function FacilitatorRootWorkspace() {
  const { user } = useUser();
  const { data: setupProgress } = useProjectSetupStatus();

  if (user?.role !== UserRole.FACILITATOR) {
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

  const handleDashboardNavigate = () => {
    // The root workspace keeps controls on one page.
  };

  return (
    <div className="space-y-8 p-6">
      {setupProgress && ['pending', 'running', 'failed'].includes(setupProgress.status) && (
        <section>
          <SetupProgressCard progress={setupProgress} />
        </section>
      )}

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
