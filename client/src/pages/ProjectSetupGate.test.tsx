// @spec PROJECT_SETUP_SPEC
// @req Authenticated facilitators and users with `can_manage_workshop` can access `/project/setup` when no project has completed setup

import { Routes, Route } from 'react-router-dom';
import { screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { ProjectSetupGate } from './ProjectSetupGate';

const userContext = vi.hoisted(() => ({
  value: {
    user: {
      id: 'facilitator-1',
      email: 'facilitator@example.com',
      name: 'Facilitator One',
      role: 'facilitator' as string,
    },
    permissions: { can_manage_workshop: true },
  },
}));

vi.mock('@/context/UserContext', () => ({
  useUser: () => userContext.value,
}));

function TestRoutes() {
  return (
    <Routes>
      <Route element={<ProjectSetupGate />}>
        <Route index element={<div>ready workspace</div>} />
      </Route>
      <Route path="/project/setup" element={<div>setup form</div>} />
    </Routes>
  );
}

describe('ProjectSetupGate', () => {
  beforeEach(() => {
    userContext.value = {
      user: {
        id: 'facilitator-1',
        email: 'facilitator@example.com',
        name: 'Facilitator One',
        role: 'facilitator',
      },
      permissions: { can_manage_workshop: true },
    };
    vi.restoreAllMocks();
  });

  it('routes facilitators to setup when no setup job exists', async () => {
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ detail: 'Setup job not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    );

    renderWithProviders(<TestRoutes />, { route: '/' });

    await waitFor(() => {
      expect(screen.getByText(/setup form/i)).toBeInTheDocument();
    });
  });

  it('keeps non-managers away from the setup form', async () => {
    userContext.value = {
      user: {
        id: 'sme-1',
        email: 'sme@example.com',
        name: 'SME One',
        role: 'sme',
      },
      permissions: { can_manage_workshop: false },
    };
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({ detail: 'Setup job not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      )
    );

    renderWithProviders(<TestRoutes />, { route: '/' });

    await waitFor(() => {
      expect(screen.getByText(/project setup is not ready/i)).toBeInTheDocument();
    });
    expect(screen.queryByText(/setup form/i)).not.toBeInTheDocument();
  });
});
