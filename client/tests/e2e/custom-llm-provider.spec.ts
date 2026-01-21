/**
 * E2E tests for Custom LLM Provider feature
 *
 * These tests verify the success criteria from CUSTOM_LLM_PROVIDER_SPEC.md:
 * - Configuration UI is accessible in Judge Tuning phase
 * - Users can configure custom LLM provider (provider name, URL, API key, model)
 * - Test connection validates configuration
 * - Configuration can be deleted
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib';

test.describe('Custom LLM Provider Configuration', () => {
  test.use({ tag: ['@spec:CUSTOM_LLM_PROVIDER_SPEC'] });
  test('facilitator can access custom LLM provider config in judge tuning', async ({ page }) => {
    // Setup workshop in tuning phase with annotation data
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'LLM Provider Test Workshop' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(3)
      .withRubric({ question: 'How helpful is this response?' })
      .withAnnotation({ rating: 4, comment: 'Good response' })
      .inPhase('tuning')
      .build();

    await page.goto('/');
    await scenario.loginAs(scenario.facilitator);

    // Navigate to the workshop - should see workshop name
    await expect(page.getByRole('heading', { name: 'LLM Provider Test Workshop' })).toBeVisible({ timeout: 15000 });

    // Navigate to Judge Tuning via sidebar
    await page.getByRole('button', { name: /Judge Tuning/i }).click();

    // Look for the Custom LLM Provider section
    await expect(page.getByText('Custom LLM Provider')).toBeVisible({ timeout: 10000 });

    await scenario.cleanup();
  });

  test('facilitator can configure and test custom LLM provider', async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Config Test Workshop' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .withRubric({ question: 'Quality assessment' })
      .withAnnotation({ rating: 3 })
      .inPhase('tuning')
      .build();

    await page.goto('/');
    await scenario.loginAs(scenario.facilitator);

    // Wait for the page to load
    await expect(page.getByRole('heading', { name: 'Config Test Workshop' })).toBeVisible({ timeout: 15000 });

    // Navigate to Judge Tuning via sidebar
    await page.getByRole('button', { name: /Judge Tuning/i }).click();

    // Wait for Custom LLM Provider section to be visible
    await expect(page.getByText('Custom LLM Provider')).toBeVisible({ timeout: 10000 });

    // Expand the Custom LLM Provider section by clicking Configure
    await page.getByRole('button', { name: /Configure/i }).first().click();

    // Fill in the configuration form
    await page.getByLabel('Provider Name').fill('Azure OpenAI');
    await page.getByLabel('Base URL').fill('https://my-resource.openai.azure.com/openai/deployments/gpt-4');
    await page.getByLabel('Model Name').fill('gpt-4');
    await page.getByLabel('API Key').fill('test-api-key-12345');

    // Save the configuration
    await page.getByRole('button', { name: /Save Configuration/i }).click();

    // Verify success - toast or badge should appear
    await expect(page.getByText(/saved/i).or(page.getByText('Active')).first()).toBeVisible({ timeout: 5000 });

    // Now the Test Connection button should be available
    await expect(page.getByRole('button', { name: /Test Connection/i })).toBeVisible({ timeout: 5000 });

    // Click test connection
    await page.getByRole('button', { name: /Test Connection/i }).click();

    // Wait for test result
    await expect(page.getByText(/Successfully connected/i)).toBeVisible({ timeout: 10000 });

    await scenario.cleanup();
  });

  test('facilitator can delete custom LLM provider configuration', async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Delete Test Workshop' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .withRubric()
      .withAnnotation({ rating: 4 })
      .inPhase('tuning')
      .build();

    await page.goto('/');
    await scenario.loginAs(scenario.facilitator);

    // Wait for page load
    await expect(page.getByRole('heading', { name: 'Delete Test Workshop' })).toBeVisible({ timeout: 15000 });

    // Navigate to Judge Tuning via sidebar
    await page.getByRole('button', { name: /Judge Tuning/i }).click();

    await expect(page.getByText('Custom LLM Provider')).toBeVisible({ timeout: 10000 });

    // First configure the provider
    await page.getByRole('button', { name: /Configure/i }).first().click();
    await page.getByLabel('Provider Name').fill('Test Provider');
    await page.getByLabel('Base URL').fill('https://example.com');
    await page.getByLabel('Model Name').fill('test-model');
    await page.getByLabel('API Key').fill('test-key');
    await page.getByRole('button', { name: /Save Configuration/i }).click();

    // Wait for save to complete
    await expect(page.getByText(/saved/i).or(page.getByText('Active')).first()).toBeVisible({ timeout: 5000 });

    // Now delete - find the trash button (last icon button in the actions area)
    const trashButton = page.locator('button').filter({ has: page.locator('[class*="lucide-trash"]') }).first();
    if (await trashButton.isVisible()) {
      await trashButton.click();
    } else {
      // Alternative: look for any button with trash icon
      await page.getByRole('button').filter({ hasText: '' }).last().click();
    }

    // Verify configuration was removed
    await expect(page.getByText(/removed/i)).toBeVisible({ timeout: 5000 });

    await scenario.cleanup();
  });

  test('shows stored badge after saving API key', async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'API Key Badge Workshop' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .withRubric()
      .withAnnotation({ rating: 5 })
      .inPhase('tuning')
      .build();

    await page.goto('/');
    await scenario.loginAs(scenario.facilitator);

    // Wait for page load
    await expect(page.getByRole('heading', { name: 'API Key Badge Workshop' })).toBeVisible({ timeout: 15000 });

    // Navigate to Judge Tuning via sidebar
    await page.getByRole('button', { name: /Judge Tuning/i }).click();

    await expect(page.getByText('Custom LLM Provider')).toBeVisible({ timeout: 10000 });

    // Configure with API key
    await page.getByRole('button', { name: /Configure/i }).first().click();
    await page.getByLabel('Provider Name').fill('Provider With Key');
    await page.getByLabel('Base URL').fill('https://example.com');
    await page.getByLabel('Model Name').fill('model');
    await page.getByLabel('API Key').fill('secret-key-123');
    await page.getByRole('button', { name: /Save Configuration/i }).click();

    // Wait for save
    await expect(page.getByText(/saved/i).or(page.getByText('Active')).first()).toBeVisible({ timeout: 5000 });

    // Verify stored badge is shown (may be "Stored" or "API Key Stored")
    await expect(page.getByText(/Stored/)).toBeVisible({ timeout: 5000 });

    await scenario.cleanup();
  });

  test('validation requires all fields', async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Validation Workshop' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .withRubric()
      .withAnnotation({ rating: 3 })
      .inPhase('tuning')
      .build();

    await page.goto('/');
    await scenario.loginAs(scenario.facilitator);

    // Wait for page load
    await expect(page.getByRole('heading', { name: 'Validation Workshop' })).toBeVisible({ timeout: 15000 });

    // Navigate to Judge Tuning via sidebar
    await page.getByRole('button', { name: /Judge Tuning/i }).click();

    await expect(page.getByText('Custom LLM Provider')).toBeVisible({ timeout: 10000 });

    // Expand config section
    await page.getByRole('button', { name: /Configure/i }).first().click();

    // Try to save without filling fields
    await page.getByRole('button', { name: /Save Configuration/i }).click();

    // Should show error about required fields
    await expect(page.getByText(/required/i).or(page.getByText(/fill/i))).toBeVisible({ timeout: 5000 });

    await scenario.cleanup();
  });
});
