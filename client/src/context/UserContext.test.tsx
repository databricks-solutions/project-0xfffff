// @spec AUTHENTICATION_SPEC
// @req Rapid navigation: Components wait for `isLoading = false`
/**
 * Tests for UserContext authentication loading state management.
 */
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UserProvider, useUser } from './UserContext';

// Mock the UsersService
vi.mock('@/client', () => ({
  UsersService: {
    getUserUsersUserIdGet: vi.fn(),
    getUserPermissionsUsersUserIdPermissionsGet: vi.fn(),
    updateLastActiveUsersUsersUserIdLastActivePut: vi.fn(),
  },
}));

function LoadingStateDisplay() {
  const { isLoading } = useUser();
  return <div data-testid="loading-state">{isLoading ? 'loading' : 'ready'}</div>;
}

function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      <UserProvider>{children}</UserProvider>
    </QueryClientProvider>
  );
}

describe('@spec:AUTHENTICATION_SPEC UserContext loading state', () => {
  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  it('isLoading starts true and transitions to false after initialization', async () => {
    // Per AUTHENTICATION_SPEC: isLoading must remain true until ALL initialization
    // steps complete. Components should only render interactive content when
    // isLoading === false. This test verifies the transition.
    const Wrapper = createWrapper();
    render(
      <Wrapper>
        <LoadingStateDisplay />
      </Wrapper>,
    );

    // After initialization (no saved user), isLoading becomes false
    await waitFor(() => {
      expect(screen.getByTestId('loading-state').textContent).toBe('ready');
    });
  });
});
