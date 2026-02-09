/**
 * E2E tests for Authentication flow
 *
 * These tests verify success criteria from AUTHENTICATION_SPEC.md:
 * - Slow network: Loading indicator shown until ready
 * - Error recovery: Errors cleared on new login attempt
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib';

test.describe('Authentication Flow', { tag: ['@spec:AUTHENTICATION_SPEC'] }, () => {
  
  test('loading indicator shown during login on slow network', async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Slow Network Workshop' })
      .withFacilitator()
      .withParticipants(1)
      .inPhase('intake')
      .build();

    await page.goto('/');

    // Wait for login page
    await expect(page.getByText('Workshop Portal')).toBeVisible({ timeout: 10000 });

    // Intercept login API and delay the response to simulate slow network
    await page.route('**/users/auth/login', async (route) => {
      // Delay response by 2 seconds to simulate slow network
      await new Promise((resolve) => setTimeout(resolve, 2000));
      await route.fulfill({
        status: 200,
        contentType: 'application/json',
        body: JSON.stringify({
          user: scenario.facilitator,
          is_preconfigured_facilitator: true,
          message: 'Facilitator login successful',
        }),
      });
    });

    // Fill login form
    await page.locator('#email').fill(scenario.facilitator.email);
    const passwordField = page.locator('#password');
    if (await passwordField.isVisible().catch(() => false)) {
      await passwordField.fill('facilitator123');
    }

    // Wait for workshop options to load
    await page.waitForTimeout(500);

    // Click Create New if visible
    const createNewButton = page.getByRole('button', { name: /Create New/i });
    if (await createNewButton.isVisible().catch(() => false)) {
      await createNewButton.click();
    }

    // Submit the form
    await page.locator('button[type="submit"]').click();

    // During the delayed request, a loading indicator should be visible
    // Look for common loading patterns: spinner, "Loading...", disabled button, etc.
    const loadingIndicator = page.locator('[aria-busy="true"]')
      .or(page.getByText(/loading|signing in|logging in/i))
      .or(page.locator('button[type="submit"][disabled]'))
      .or(page.locator('.animate-spin'));
    await expect(loadingIndicator.first()).toBeVisible({ timeout: 3000 });

    await scenario.cleanup();
  });

  test('error clears on new login attempt', async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Error Recovery Workshop' })
      .withFacilitator()
      .withParticipants(1)
      .inPhase('intake')
      .build();

    await page.goto('/');

    // Wait for login page
    await expect(page.getByText('Workshop Portal')).toBeVisible({ timeout: 10000 });

    // First attempt: make login fail by intercepting with 401
    let loginAttempt = 0;
    await page.route('**/users/auth/login', async (route) => {
      loginAttempt++;
      if (loginAttempt === 1) {
        // First attempt fails
        await route.fulfill({
          status: 401,
          contentType: 'application/json',
          body: JSON.stringify({ detail: 'Invalid email or password' }),
        });
      } else {
        // Second attempt succeeds
        await route.fulfill({
          status: 200,
          contentType: 'application/json',
          body: JSON.stringify({
            user: scenario.facilitator,
            is_preconfigured_facilitator: true,
            message: 'Facilitator login successful',
          }),
        });
      }
    });

    // Fill in credentials
    await page.locator('#email').fill('wrong@example.com');
    const passwordField = page.locator('#password');
    if (await passwordField.isVisible().catch(() => false)) {
      await passwordField.fill('wrongpassword');
    }

    // Wait for workshop options
    await page.waitForTimeout(500);
    const createNewButton = page.getByRole('button', { name: /Create New/i });
    if (await createNewButton.isVisible().catch(() => false)) {
      await createNewButton.click();
    }

    // Submit (first attempt - should fail)
    await page.locator('button[type="submit"]').click();

    // Error message should appear
    await expect(page.getByText(/invalid|error|failed/i)).toBeVisible({ timeout: 5000 });

    // Now attempt a new login - error should clear when user starts typing
    await page.locator('#email').clear();
    await page.locator('#email').fill(scenario.facilitator.email);
    if (await passwordField.isVisible().catch(() => false)) {
      await passwordField.clear();
      await passwordField.fill('facilitator123');
    }

    // Submit again (second attempt - should succeed)
    await page.locator('button[type="submit"]').click();

    // Previous error should be gone and login should succeed
    // Wait for navigation away from login page
    await expect(page.getByText('Workshop Portal')).not.toBeVisible({ timeout: 10000 });

    await scenario.cleanup();
  });
});
