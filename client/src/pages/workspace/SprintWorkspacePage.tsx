import React from 'react';
import { useUser } from '@/context/UserContext';
import { FacilitatorRootWorkspace } from '@/components/workspace/FacilitatorRootWorkspace';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function SprintWorkspacePage() {
  const { permissions } = useUser();
  const canManageWorkspace = permissions?.can_manage_project === true;

  if (canManageWorkspace) {
    return <FacilitatorRootWorkspace />;
  }

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>User workspace coming soon</CardTitle>
          <CardDescription>
            Your onboarding, home, and feed workspace will appear here.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
