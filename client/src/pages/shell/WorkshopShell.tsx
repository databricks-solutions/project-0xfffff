import React from 'react';
import { Outlet } from 'react-router-dom';
import { UserRole } from '@/client';
import { WorkshopCreationPage } from '@/components/WorkshopCreationPage';
import { useUser } from '@/context/UserContext';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

export function WorkshopShell() {
  const { user } = useUser();
  const { workshopId } = useWorkshopContext();

  if (!workshopId || workshopId.startsWith('temp-')) {
    if (user?.role === UserRole.FACILITATOR) {
      return <WorkshopCreationPage />;
    }
    return (
      <div className="min-h-screen bg-background p-6">
        <Card className="mx-auto max-w-xl">
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

  return <Outlet />;
}
