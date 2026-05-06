import type { Page, Route } from '@playwright/test';
import type { ProjectSetupState, User } from '../types';
import { UserRole } from '../types';

export interface MockDataStore {
  facilitator: User;
  projectSetup?: ProjectSetupState;
}

export class ApiMocker {
  constructor(
    private readonly page: Page,
    private readonly store: MockDataStore
  ) {}

  async install(): Promise<void> {
    await this.page.route('**/api/auth/**', async (route) => {
      await this.handleAuthRoute(route);
    });

    await this.page.route('**/api/users/**', async (route) => {
      await this.handleUsersRoute(route);
    });

    await this.page.route('**/api/project/**', async (route) => {
      await this.handleProjectRoute(route);
    });

    await this.page.route('**/workshops/**', async (route) => {
      await route.fulfill({ status: 404, json: { detail: 'Legacy workshop route disabled in V2 setup tests' } });
    });
  }

  private async handleAuthRoute(route: Route): Promise<void> {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (url.pathname === '/api/auth/session' && method === 'GET') {
      await route.fulfill({
        json: {
          user: this.store.facilitator,
          permissions: {
            can_view_discovery: true,
            can_create_findings: false,
            can_view_all_findings: true,
            can_create_rubric: true,
            can_view_rubric: true,
            can_annotate: false,
            can_view_all_annotations: true,
            can_view_results: true,
            can_manage_workshop: true,
            can_manage_project: true,
            can_assign_annotations: true,
          },
          provider: 'local_dev',
          provider_role: 'CAN_MANAGE',
          project: this.store.projectSetup
            ? {
                id: this.store.projectSetup.project_id || 'project-1',
                name: this.store.projectSetup.name,
                setup_status: this.store.projectSetup.setup_status || 'completed',
              }
            : null,
        },
      });
      return;
    }

    await route.fulfill({ status: 404, json: { detail: 'Auth route not mocked' } });
  }

  private async handleUsersRoute(route: Route): Promise<void> {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (url.pathname === `/api/users/${this.store.facilitator.id}` && method === 'GET') {
      await route.fulfill({ json: this.store.facilitator });
      return;
    }

    if (url.pathname === `/api/users/${this.store.facilitator.id}/permissions` && method === 'GET') {
      await route.fulfill({
        json: {
          can_view_discovery: true,
          can_create_findings: false,
          can_view_all_findings: true,
          can_create_rubric: true,
          can_view_rubric: true,
          can_annotate: false,
          can_view_all_annotations: true,
          can_view_results: true,
          can_manage_workshop: true,
          can_manage_project: true,
          can_assign_annotations: true,
        },
      });
      return;
    }

    await route.fulfill({ status: 404, json: { detail: 'User route not mocked' } });
  }

  private async handleProjectRoute(route: Route): Promise<void> {
    const url = new URL(route.request().url());
    const method = route.request().method();

    if (url.pathname === '/api/project/setup' && method === 'GET') {
      if (this.store.projectSetup) {
        await route.fulfill({ json: this.store.projectSetup });
      } else {
        await route.fulfill({ status: 404, json: { detail: 'Project not found' } });
      }
      return;
    }

    if (url.pathname === '/api/project/setup' && method === 'PATCH') {
      if (!this.store.projectSetup) {
        await route.fulfill({ status: 404, json: { detail: 'Project not found' } });
        return;
      }

      const body = route.request().postDataJSON();
      this.store.projectSetup = {
        ...this.store.projectSetup,
        name: body?.name ?? this.store.projectSetup.name,
        description: body?.description ?? this.store.projectSetup.description,
        agent_description: body?.agent_description ?? this.store.projectSetup.agent_description,
        facilitator_id: this.store.projectSetup.facilitator_id,
        trace_uc_table_path: body?.trace_uc_table_path ?? this.store.projectSetup.trace_uc_table_path,
      };
      await route.fulfill({ json: this.store.projectSetup });
      return;
    }

    if (url.pathname === '/api/project/setup-status' && method === 'GET') {
      if (this.store.projectSetup) {
        await route.fulfill({
          json: {
            project_id: this.store.projectSetup.project_id,
            setup_job_id: this.store.projectSetup.setup_job_id || 'setup-job-1',
            status: this.store.projectSetup.setup_status || 'completed',
            current_step: 'bootstrap_completed',
            message: 'Project setup bootstrap completed',
            queue_job_id: 'dev-unqueued:setup-job-1',
            delegated_run_ids: [],
            details: {},
          },
        });
      } else {
        await route.fulfill({ status: 404, json: { detail: 'Setup job not found' } });
      }
      return;
    }

    await route.fulfill({ status: 404, json: { detail: 'Project route not mocked' } });
  }
}

export function buildFacilitator(overrides: Partial<User> = {}): User {
  return {
    id: 'facilitator-1',
    email: 'facilitator@example.com',
    name: 'Facilitator One',
    role: UserRole.FACILITATOR,
    workshop_id: null,
    ...overrides,
  };
}
