import React from 'react';
import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { UserRole } from '@/client';
import { useUser } from '@/context/UserContext';
import { FacilitatorRootWorkspace } from './FacilitatorRootWorkspace';

vi.mock('@/context/UserContext', () => ({
  useUser: vi.fn(),
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

    render(<FacilitatorRootWorkspace />);

    expect(screen.getByText('Invite Participants')).toBeInTheDocument();
    expect(screen.getByText('Facilitator Dashboard')).toBeInTheDocument();
    expect(screen.getByText('intake-controls-module')).toBeInTheDocument();
    expect(screen.getByText('invite-participants-module')).toBeInTheDocument();
    expect(screen.getByText('facilitator-dashboard-module')).toBeInTheDocument();
  });
});
