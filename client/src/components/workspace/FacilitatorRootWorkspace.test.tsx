import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserRole } from '@/client';
import { useUser } from '@/context/UserContext';
import { useProjectSetupStatus } from '@/hooks/useProjectSetupApi';
import { FacilitatorRootWorkspace } from './FacilitatorRootWorkspace';

vi.mock('@/context/UserContext', () => ({
  useUser: vi.fn(),
}));

vi.mock('react-router-dom', () => ({
  useNavigate: () => vi.fn(),
}));

vi.mock('@/hooks/useProjectSetupApi', () => ({
  isProjectSetupApiError: () => false,
  isSetupBlockingStatus: (status: string | undefined) => (
    status === 'pending' || status === 'running' || status === 'failed' || status === 'enqueue_failed' || status === 'cancelled'
  ),
  useProjectSetupStatus: vi.fn(),
}));

vi.mock('@/pages/IntakePage', () => ({
  IntakePage: () => <div>intake-controls-module</div>,
}));

vi.mock('@/components/FacilitatorUserManager', () => ({
  FacilitatorUserManager: () => <div>invite-participants-module</div>,
}));

vi.mock('@/components/FacilitatorDashboard', () => ({
  FacilitatorDashboard: () => <div>facilitator-dashboard-module</div>,
}));

const userContextMock = vi.mocked(useUser);
const setupStatusMock = vi.mocked(useProjectSetupStatus);

describe('FacilitatorRootWorkspace', () => {
  it('renders setup controls, invite participants, and dashboard together for facilitator', () => {
    userContextMock.mockReturnValue({
      user: { id: 'facilitator-1', role: UserRole.FACILITATOR },
      permissions: null,
      setUser: vi.fn(),
      login: vi.fn(),
      logout: vi.fn(),
      updateLastActive: vi.fn(),
      isLoading: false,
      error: null,
    });
    setupStatusMock.mockReturnValue({
      data: {
        project_id: 'project-1',
        setup_job_id: 'setup-job-1',
        status: 'completed',
        current_step: 'completed',
        message: null,
        queue_job_id: null,
        delegated_run_ids: [],
        details: {},
      },
      isLoading: false,
      error: null,
    } as ReturnType<typeof useProjectSetupStatus>);

    render(<FacilitatorRootWorkspace />);

    expect(screen.getByText('Invite Participants')).toBeInTheDocument();
    expect(screen.getByText('Facilitator Dashboard')).toBeInTheDocument();
    expect(screen.getByText('intake-controls-module')).toBeInTheDocument();
    expect(screen.getByText('invite-participants-module')).toBeInTheDocument();
    expect(screen.getByText('facilitator-dashboard-module')).toBeInTheDocument();
  });
});
