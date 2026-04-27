import React from 'react';
import { Outlet } from 'react-router-dom';
import { UserRole } from '@/client';
import { WorkshopCreationPage } from '@/components/WorkshopCreationPage';
import { ProductionLogin } from '@/components/ProductionLogin';
import { useUser } from '@/context/UserContext';
import { useWorkshopContext } from '@/context/WorkshopContext';

export function WorkshopShell() {
  const { user } = useUser();
  const { workshopId } = useWorkshopContext();

  if (!workshopId || workshopId.startsWith('temp-')) {
    if (user?.role === UserRole.FACILITATOR) {
      return <WorkshopCreationPage />;
    }
    return <ProductionLogin />;
  }

  return <Outlet />;
}
