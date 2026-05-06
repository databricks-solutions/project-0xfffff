// @spec PROJECT_SETUP_SPEC
// @req The app shell navigation bar exposes a project setup link for facilitators and users with `can_manage_workshop`

import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { AppShellPathBar } from './App';

const userContext = vi.hoisted(() => ({
  value: {
    user: {
      id: 'facilitator-1',
      email: 'facilitator@example.com',
      name: 'Facilitator One',
      role: 'facilitator',
    },
    permissions: { can_manage_workshop: true },
  },
}));

const workshopContext = vi.hoisted(() => ({
  value: {
    workshopId: null,
    workshop: null,
    setWorkshopId: vi.fn(),
    setWorkshop: vi.fn(),
    workflowMode: 'filled',
    setWorkflowMode: vi.fn(),
    clearInvalidWorkshopId: vi.fn(),
  },
}));

vi.mock('@/context/UserContext', () => ({
  useUser: () => userContext.value,
  UserProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/context/WorkshopContext', () => ({
  useWorkshopContext: () => workshopContext.value,
  WorkshopProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/context/WorkflowContext', () => ({
  WorkflowProvider: ({ children }: { children: ReactNode }) => children,
}));

vi.mock('@/hooks/useWorkshopApi', () => ({
  useWorkshopMeta: () => ({ data: null }),
}));

function LocationProbe() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderPathBar(route = '/') {
  return render(
    <MemoryRouter initialEntries={[route]}>
      <AppShellPathBar />
      <Routes>
        <Route path="*" element={<LocationProbe />} />
      </Routes>
    </MemoryRouter>
  );
}

describe('AppShellPathBar', () => {
  it('links facilitators back to project setup from the shell nav', async () => {
    renderPathBar('/');

    await userEvent.click(screen.getByRole('button', { name: /project setup/i }));

    expect(screen.getByTestId('location')).toHaveTextContent('/project/setup');
  });

  it('renders project setup as the current crumb on the setup route', () => {
    renderPathBar('/project/setup');

    expect(screen.getByText('Project setup')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /project setup/i })).not.toBeInTheDocument();
  });
});
