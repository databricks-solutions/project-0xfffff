import { useQuery } from '@tanstack/react-query';
import type { User, UserPermissions } from '@/client';

export type ProviderRole = 'CAN_MANAGE' | 'CAN_USE';

export interface CurrentProjectSummary {
  id: string;
  name: string;
  setup_status?: string | null;
}

export interface AuthSession {
  user: User;
  permissions: UserPermissions;
  provider: string;
  provider_role: ProviderRole;
  project?: CurrentProjectSummary | null;
}

export class AuthSessionError extends Error {
  status: number;

  constructor(status: number, message: string) {
    super(message);
    this.name = 'AuthSessionError';
    this.status = status;
  }
}

async function fetchAuthSession(): Promise<AuthSession> {
  const response = await fetch('/api/auth/session', {
    credentials: 'include',
    headers: { Accept: 'application/json' },
  });

  if (!response.ok) {
    const body = await response.json().catch(() => null);
    throw new AuthSessionError(response.status, body?.detail || 'Failed to load session');
  }

  return response.json();
}

export function useAuthSession() {
  return useQuery({
    queryKey: ['auth-session'],
    queryFn: fetchAuthSession,
    retry: false,
    staleTime: 60_000,
  });
}

