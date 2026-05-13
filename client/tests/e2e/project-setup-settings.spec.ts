import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib';

test.describe('Project setup server-synced form', {
  tag: ['@spec:PROJECT_SETUP_SPEC'],
}, () => {
  test('loads server project state and saves updates through the setup form', {
    tag: [
      '@req:The setup form is synced with server project state before and after setup completes',
      '@req:Facilitators and users with `can_manage_workshop` can update project name and agent/app description after setup completes',
      '@req:Facilitators and users with `can_manage_workshop` can update Databricks UC trace table path after setup completes',
    ],
  }, async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withFacilitator()
      .withProjectSetup({
        name: 'server-project',
        agent_description: 'Server synced agent description',
        trace_uc_table_path: 'main.support.original_traces',
      })
      .build();

    await scenario.loginAs(scenario.facilitator);
    await page.goto('/project/setup');

    await expect(page.getByLabel(/project name/i)).toHaveValue('server-project');
    await expect(page.getByLabel(/agent\/app description/i)).toHaveValue('Server synced agent description');
    await expect(page.getByLabel(/unity catalog trace table/i)).toHaveValue('main.support.original_traces');

    await page.getByLabel(/project name/i).fill('updated-project');
    await page.getByLabel(/agent\/app description/i).fill('Updated agent description from settings form');
    await page.getByLabel(/unity catalog trace table/i).fill('main.support.updated_traces');
    await page.getByRole('button', { name: /save project setup/i }).click();

    await page.goto('/project/setup');
    await expect(page.getByLabel(/project name/i)).toHaveValue('updated-project');
    await expect(page.getByLabel(/agent\/app description/i)).toHaveValue('Updated agent description from settings form');
    await expect(page.getByLabel(/unity catalog trace table/i)).toHaveValue('main.support.updated_traces');

    await scenario.cleanup();
  });
});
