// @spec PROJECT_SETUP_SPEC
// @req `POST /api/project/setup` returns `project_id` and `setup_job_id`

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { ProjectSetupPage } from './ProjectSetupPage';

const userContext = vi.hoisted(() => ({
  value: {
    user: {
      id: 'facilitator-1',
      email: 'facilitator@example.com',
      name: 'Facilitator One',
      role: 'facilitator' as string,
    },
    permissions: { can_manage_project: true },
  },
}));

vi.mock('@/context/UserContext', () => ({
  useUser: () => userContext.value,
}));

describe('ProjectSetupPage', () => {
  beforeEach(() => {
    userContext.value = {
      user: {
        id: 'facilitator-1',
        email: 'facilitator@example.com',
        name: 'Facilitator One',
        role: 'facilitator',
      },
      permissions: { can_manage_project: true },
    };
    vi.restoreAllMocks();
  });

  it('submits the day-one bootstrap form and navigates to the workspace', async () => {
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockImplementation(async (_input, init) => {
      if (init?.method === 'POST') {
        return new Response(
          JSON.stringify({
            project_id: 'project-1',
            setup_job_id: 'setup-job-1',
            status: 'pending',
            current_step: 'queued',
            message: 'Setup queued',
          }),
          { status: 201, headers: { 'Content-Type': 'application/json' } }
        );
      }
      return new Response(
        JSON.stringify({ detail: 'Project not found' }),
        { status: 404, headers: { 'Content-Type': 'application/json' } }
      );
    });

    renderWithProviders(<ProjectSetupPage />, { route: '/project/setup' });

    await userEvent.clear(screen.getByLabelText(/project name/i));
    await userEvent.type(screen.getByLabelText(/project name/i), 'support-agent-eval');
    await userEvent.clear(screen.getByLabelText(/agent\/app description/i));
    await userEvent.type(screen.getByLabelText(/agent\/app description/i), 'Calibrate the support agent.');
    await userEvent.type(screen.getByLabelText(/unity catalog trace table/i), 'main.support.traces');
    await userEvent.click(screen.getByRole('button', { name: /create project and start setup/i }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith('/api/project/setup', expect.objectContaining({ method: 'POST' }));
    });

    const postCall = fetchMock.mock.calls.find(([, init]) => init?.method === 'POST');
    const body = JSON.parse(String(postCall?.[1]?.body));
    expect(body).toMatchObject({
      name: 'support-agent-eval',
      agent_description: 'Calibrate the support agent.',
      trace_uc_table_path: 'main.support.traces',
    });
  });

  it('blocks users without workshop management permission from the setup form', () => {
    userContext.value = {
      user: {
        id: 'sme-1',
        email: 'sme@example.com',
        name: 'SME One',
        role: 'sme',
      },
      permissions: { can_manage_project: false },
    };

    renderWithProviders(<ProjectSetupPage />, { route: '/project/setup' });

    expect(screen.getByText(/project setup requires facilitator access/i)).toBeInTheDocument();
    expect(screen.queryByLabelText(/project name/i)).not.toBeInTheDocument();
  });
});
