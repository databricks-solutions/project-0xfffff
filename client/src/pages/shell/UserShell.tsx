import React from 'react';
import { Outlet } from 'react-router-dom';
import { AlertCircle, Loader2 } from 'lucide-react';
import { Card, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useUser } from '@/context/UserContext';

export function UserShell() {
  const { user, isLoading, error } = useUser();

  if (isLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-background p-6">
        <Card className="max-w-md">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <AlertCircle className="h-5 w-5 text-destructive" />
              Authentication required
            </CardTitle>
            <CardDescription>
              Open this app through Databricks, then refresh after login. {error ? `(${error})` : null}
            </CardDescription>
          </CardHeader>
        </Card>
      </div>
    );
  }

  return <Outlet />;
}
