import React from 'react';
import { UserRole } from '@/client';
import { useUser } from '@/context/UserContext';
import { FacilitatorRootWorkspace } from '@/components/workspace/FacilitatorRootWorkspace';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function SprintWorkspacePage() {
  const { user } = useUser();

  if (user?.role === UserRole.FACILITATOR) {
    return <FacilitatorRootWorkspace />;
  }

  return (
    <div className="p-6">
      <Card>
        <CardHeader>
          <CardTitle>Workspace access</CardTitle>
          <CardDescription>
            This workspace root is currently focused on facilitator tools.
          </CardDescription>
        </CardHeader>
      </Card>
    </div>
  );
}
