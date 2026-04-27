import React from 'react';
import { Outlet } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { ProductionLogin } from '@/components/ProductionLogin';
import { useUser } from '@/context/UserContext';

export function UserShell() {
  const { user, isLoading } = useUser();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return <ProductionLogin />;
  }

  return <Outlet />;
}
