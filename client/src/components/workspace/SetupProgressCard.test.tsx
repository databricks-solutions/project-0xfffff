// @spec PROJECT_SETUP_SPEC
// @req The workspace can query setup progress and display pending or running setup state

import { screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { renderWithProviders } from '@/test/render';
import { SetupProgressCard } from './SetupProgressCard';

describe('SetupProgressCard', () => {
  it('shows running setup progress', () => {
    renderWithProviders(
      <SetupProgressCard
        progress={{
          project_id: 'project-1',
          setup_job_id: 'setup-job-1',
          status: 'running',
          current_step: 'snapshot_pending',
          message: 'Preparing trace snapshot',
          queue_job_id: 'queue-job-1',
          delegated_run_ids: [],
          details: {},
        }}
      />
    );

    expect(screen.getByText(/setup running/i)).toBeInTheDocument();
    expect(screen.getByText(/snapshot_pending/i)).toBeInTheDocument();
    expect(screen.getByText(/preparing trace snapshot/i)).toBeInTheDocument();
  });
});
