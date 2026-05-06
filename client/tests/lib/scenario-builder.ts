import type { Browser, BrowserContext, Page } from '@playwright/test';
import type { BuiltScenario, ProjectSetupState, User } from './types';
import { ApiMocker, buildFacilitator } from './mocks/api-mocker';

const DEFAULT_BASE_URL = 'http://127.0.0.1:3000';

export class TestScenario {
  private readonly pageOrBrowser: Page | Browser;
  private readonly contexts: BrowserContext[] = [];
  private facilitator: User = buildFacilitator();
  private projectSetup?: ProjectSetupState;

  private constructor(pageOrBrowser: Page | Browser) {
    this.pageOrBrowser = pageOrBrowser;
  }

  static create(pageOrBrowser: Page | Browser): TestScenario {
    return new TestScenario(pageOrBrowser);
  }

  withFacilitator(config: Partial<User> = {}): this {
    this.facilitator = buildFacilitator(config);
    return this;
  }

  withProjectSetup(config: ProjectSetupState = {}): this {
    this.projectSetup = {
      project_id: config.project_id || 'project-1',
      name: config.name || 'server-project',
      description: config.description ?? null,
      agent_description: config.agent_description || 'Server synced agent description',
      facilitator_id: config.facilitator_id || this.facilitator.id,
      trace_uc_table_path: config.trace_uc_table_path || 'main.support.original_traces',
      setup_job_id: config.setup_job_id || 'setup-job-1',
      setup_status: config.setup_status || 'completed',
    };
    return this;
  }

  async build(): Promise<BuiltScenario> {
    const page = await this.getPage();
    const mocker = new ApiMocker(page, {
      facilitator: this.facilitator,
      projectSetup: this.projectSetup,
    });
    await mocker.install();

    return {
      page,
      facilitator: this.facilitator,
      projectSetup: this.projectSetup || {},
      loginAs: async (user: User) => {
        const serialized = JSON.stringify(user);
        await page.addInitScript((value) => {
          window.localStorage.setItem('workshop_user', value);
        }, serialized);
        await page.evaluate((value) => {
          window.localStorage.setItem('workshop_user', value);
        }, serialized).catch(() => {
          // The page may not be initialized yet; addInitScript handles first navigation.
        });
      },
      cleanup: async () => {
        await page.evaluate(() => window.localStorage.clear()).catch(() => {});
        for (const context of this.contexts) {
          await context.close().catch(() => {});
        }
      },
    };
  }

  private async getPage(): Promise<Page> {
    if ('goto' in this.pageOrBrowser) {
      return this.pageOrBrowser;
    }

    // Preserve the repo convention: browser-created scenario pages must inherit
    // the configured Playwright base URL so page.goto('/') resolves correctly.
    const context = await this.pageOrBrowser.newContext({
      baseURL: process.env.PLAYWRIGHT_BASE_URL || DEFAULT_BASE_URL,
    });
    this.contexts.push(context);
    return context.newPage();
  }
}
