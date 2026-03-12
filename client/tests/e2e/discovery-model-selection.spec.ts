/**
 * E2E Test: Facilitator can select LLM model for discovery follow-up questions
 *
 * Verifies that:
 * 1. The model selector is visible on the facilitator dashboard during discovery
 * 2. The dropdown shows model options (demo + Databricks models)
 * 3. The model selector is accessible and interactive
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib/scenario-builder';
import { WorkshopPhase } from '../lib/types';

test.describe('Discovery model selection', {
  tag: ['@spec:DISCOVERY_SPEC'],
}, () => {
  test('facilitator sees model selector on dashboard during discovery', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Facilitator can select LLM model for follow-up question generation in Discovery dashboard',
    ],
  }, async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Model Selection Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(3)
      .inPhase(WorkshopPhase.DISCOVERY)
      .build();

    await scenario.loginAs(scenario.facilitator);

    // The model selector should be visible in the Quick Actions section
    const modelSelector = page.getByTestId('model-selector');
    await expect(modelSelector).toBeVisible({ timeout: 10000 });

    // Default should be "Demo (static questions)"
    await expect(modelSelector).toContainText('Demo');

    await scenario.cleanup();
  });

  test('model selector dropdown shows available options', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Facilitator can select LLM model for follow-up question generation in Discovery dashboard',
    ],
  }, async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Model Selection Options' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(3)
      .inPhase(WorkshopPhase.DISCOVERY)
      .build();

    await scenario.loginAs(scenario.facilitator);

    // Wait for the model selector
    const modelSelector = page.getByTestId('model-selector');
    await expect(modelSelector).toBeVisible({ timeout: 10000 });

    // Click the selector to open the dropdown
    await modelSelector.click();

    // The "Demo (static questions)" option should be visible
    const demoOption = page.getByRole('option', { name: /Demo/i });
    await expect(demoOption).toBeVisible();

    // Databricks model options should also be listed (disabled without config)
    const claudeOption = page.getByRole('option', { name: /Claude Opus/i });
    await expect(claudeOption).toBeVisible();

    // Click demo to close dropdown without changing selection
    await demoOption.click();

    await scenario.cleanup();
  });

  test('model selector is accessible during active discovery on facilitator dashboard', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Facilitator can select LLM model for follow-up question generation in Discovery dashboard',
    ],
  }, async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Model Selection During Discovery' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(3)
      .inPhase(WorkshopPhase.DISCOVERY)
      .build();

    // Facilitator lands on the FacilitatorDashboard since discovery_started=true
    await scenario.loginAs(scenario.facilitator);

    // The model selector should be accessible in the Quick Actions section
    const modelSelector = page.getByTestId('model-selector');
    await expect(modelSelector).toBeVisible({ timeout: 10000 });

    // Should show the default model
    await expect(modelSelector).toContainText('Demo');

    await scenario.cleanup();
  });
});
