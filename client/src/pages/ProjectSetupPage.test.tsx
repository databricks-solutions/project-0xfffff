// @spec PROJECT_SETUP_SPEC
// @req `POST /project/setup` returns `project_id` and `setup_job_id`

import { screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { ProjectSetupService } from '@/client';
import { renderWithProviders } from '@/test/render';
import { ProjectSetupPage } from './ProjectSetupPage';

describe('ProjectSetupPage', () => {
  it('submits the day-one bootstrap form and navigates to the workspace', async () => {
    const setupMock = vi
      .spyOn(ProjectSetupService, 'startProjectSetupProjectSetupPost')
      .mockResolvedValue({
        project_id: 'project-1',
        setup_job_id: 'setup-job-1',
        status: 'pending',
        current_step: 'queued',
        message: 'Setup queued',
      });

    renderWithProviders(<ProjectSetupPage />, { route: '/project/setup' });

    await userEvent.clear(screen.getByLabelText(/project name/i));
    await userEvent.type(screen.getByLabelText(/project name/i), 'support-agent-eval');
    await userEvent.type(screen.getByLabelText(/agent description/i), 'Calibrate the support agent.');
    await userEvent.type(screen.getByLabelText(/unity catalog trace table/i), 'main.support.traces');
    await userEvent.click(screen.getByRole('button', { name: /launch bootstrap/i }));

    await waitFor(() => {
      expect(setupMock).toHaveBeenCalled();
    });

    expect(setupMock.mock.calls[0][0]).toMatchObject({
      name: 'support-agent-eval',
      agent_description: 'Calibrate the support agent.',
      trace_uc_table_path: 'main.support.traces',
    });
  });
});
