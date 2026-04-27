import React from 'react';
import { UserRole } from '@/client';
import { IntakePage } from '@/pages/IntakePage';
import { FacilitatorDashboard } from '@/components/FacilitatorDashboard';
import { FacilitatorUserManager } from '@/components/FacilitatorUserManager';
import { useUser } from '@/context/UserContext';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function FacilitatorRootWorkspace() {
  const { user } = useUser();

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
      <section>
        <Card>
          <CardHeader>
            <CardTitle>Setup Controls</CardTitle>
            <CardDescription>
              Connect data and manage trace intake from this section.
            </CardDescription>
          </CardHeader>
          <CardContent>
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
