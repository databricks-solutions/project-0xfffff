import React from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserRole } from '@/client';
import { useUser } from '@/context/UserContext';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useWorkshopPhase } from '@/hooks/useWorkshopApi';
import { UserShell } from './UserShell';
import { WorkshopShell } from './WorkshopShell';
import { WorkflowShell } from './WorkflowShell';

vi.mock('@/context/UserContext', () => ({
  useUser: vi.fn(),
}));

vi.mock('@/context/WorkshopContext', () => ({
  useWorkshopContext: vi.fn(),
}));

vi.mock('@/hooks/useWorkshopApi', () => ({
  useWorkshopPhase: vi.fn(),
}));

vi.mock('@/components/ProductionLogin', () => ({
  ProductionLogin: () => <div>production-login</div>,
}));

vi.mock('@/components/WorkshopCreationPage', () => ({
  WorkshopCreationPage: () => <div>workshop-creation</div>,
}));

vi.mock('@/components/WorkshopHeader', () => ({
  WorkshopHeader: () => <div>workshop-header</div>,
}));

const userContextMock = vi.mocked(useUser);
const workshopContextMock = vi.mocked(useWorkshopContext);
const workshopPhaseMock = vi.mocked(useWorkshopPhase);

describe('Shell flow', () => {
  it('shows login at user shell when no user', () => {
    userContextMock.mockReturnValue({
      user: null,
      permissions: null,
      setUser: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      updateLastActive: vi.fn(),
      isLoading: false,
      error: null,
    });

    render(
      <MemoryRouter>
        <Routes>
          <Route element={<UserShell />}>
            <Route path="/" element={<div>child-content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('production-login')).toBeInTheDocument();
  });

  it('shows workshop creation for facilitators without workshop id', () => {
    userContextMock.mockReturnValue({
      user: { id: 'u1', role: UserRole.FACILITATOR },
      permissions: null,
      setUser: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      updateLastActive: vi.fn(),
      isLoading: false,
      error: null,
    });
    workshopContextMock.mockReturnValue({
      workshopId: null,
      workshop: null,
      setWorkshopId: vi.fn(),
      setWorkshop: vi.fn(),
      workflowMode: 'filled',
      setWorkflowMode: vi.fn(),
      clearInvalidWorkshopId: vi.fn(),
    });

    render(
      <MemoryRouter>
        <Routes>
          <Route element={<WorkshopShell />}>
            <Route path="/" element={<div>child-content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('workshop-creation')).toBeInTheDocument();
  });

  it('renders workflow shell outlet when workshop is available', () => {
    const clearInvalidWorkshopId = vi.fn();
    const setWorkshopId = vi.fn();
    userContextMock.mockReturnValue({
      user: { id: 'u1', name: 'Alex', role: UserRole.FACILITATOR },
      permissions: null,
      setUser: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      updateLastActive: vi.fn(),
      isLoading: false,
      error: null,
    });
    workshopContextMock.mockReturnValue({
      workshopId: '11111111-1111-1111-1111-111111111111',
      workshop: null,
      setWorkshopId,
      setWorkshop: vi.fn(),
      workflowMode: 'filled',
      setWorkflowMode: vi.fn(),
      clearInvalidWorkshopId,
    });
    workshopPhaseMock.mockReturnValue({
      data: {
        mode: 'workshop',
        current_phase: 'intake',
        completed_phases: [],
        discovery_started: false,
        annotation_started: false,
      },
      error: null,
      isLoading: false,
    } as never);

    render(
      <MemoryRouter initialEntries={['/workshop/11111111-1111-1111-1111-111111111111']}>
        <Routes>
          <Route element={<WorkflowShell />}>
            <Route path="/workshop/:workshopId" element={<div>workspace-content</div>} />
          </Route>
        </Routes>
      </MemoryRouter>
    );

    expect(screen.getByText('workshop-header')).toBeInTheDocument();
    expect(screen.getByText('workspace-content')).toBeInTheDocument();
  });
});
