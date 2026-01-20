/**
 * Authentication actions
 *
 * Provides login/logout functionality for e2e tests.
 */

import { expect, type Page } from '@playwright/test';
import type { User } from '../types';
import { DEFAULT_FACILITATOR } from '../data';

/**
 * Login as a specific user
 *
 * Handles both facilitator login (with password) and participant login (email only).
 * Also handles workshop selection when multiple workshops are available.
 */
export async function loginAs(page: Page, user: User): Promise<void> {
  // Navigate to the app if not already there
  const currentUrl = page.url();
  if (!currentUrl.includes('localhost') && !currentUrl.includes('127.0.0.1')) {
    await page.goto('/');
  }

  // Wait for login page to be visible
  await expect(page.getByText('Workshop Portal')).toBeVisible({ timeout: 10000 });

  // Fill email
  await page.locator('#email').fill(user.email);

  // Facilitators need password
  if (user.role === 'facilitator') {
    const passwordField = page.locator('#password');
    if (await passwordField.isVisible().catch(() => false)) {
      // Use default facilitator password if this is the default facilitator
      const password =
        user.email === DEFAULT_FACILITATOR.email
          ? DEFAULT_FACILITATOR.password
          : 'password123';
      await passwordField.fill(password);
    }

    // For facilitators with password, workshop selection UI appears after password is entered
    // Wait for workshops to load (loading spinner disappears or workshop buttons appear)
    await page.waitForTimeout(300);

    // Check if "Join Existing" button exists AND is enabled (workshops loaded)
    const joinExistingButton = page.getByRole('button', { name: 'Join Existing' });
    const joinExistingVisible = await joinExistingButton.isVisible().catch(() => false);
    const joinExistingEnabled = joinExistingVisible && await joinExistingButton.isEnabled().catch(() => false);

    if (joinExistingEnabled) {
      // Workshops exist - click "Join Existing" and select workshop
      await joinExistingButton.click();

      // Select workshop from dropdown
      const facilitatorWorkshopSelect = page.locator('[role="combobox"]').first();
      if (await facilitatorWorkshopSelect.isVisible().catch(() => false)) {
        await facilitatorWorkshopSelect.click();
        // Wait for dropdown content to appear
        await page.waitForTimeout(100);
        // Click the first workshop option (user's workshop should be in the mocked list)
        const firstOption = page.locator('[role="option"]').first();
        if (await firstOption.isVisible().catch(() => false)) {
          await firstOption.click();
        }
      }
    }
    // If "Join Existing" is disabled or not visible, "Create New" is likely already selected
    // which is fine for facilitators - they'll create a new workshop after login
  } else {
    // For participants/SMEs, workshop selection appears when password is empty
    // Wait for workshops to load (loading spinner disappears)
    await page.waitForTimeout(300);

    // Select workshop from dropdown
    const workshopSelect = page.locator('[role="combobox"]');
    if (await workshopSelect.isVisible().catch(() => false)) {
      await workshopSelect.click();
      // Wait for dropdown content to appear
      await page.waitForTimeout(100);
      // Click the first workshop option
      const firstOption = page.locator('[role="option"]').first();
      if (await firstOption.isVisible().catch(() => false)) {
        await firstOption.click();
      }
    }
  }

  // Submit login form
  await page.locator('button[type="submit"]').click();

  // Wait for navigation away from login page
  // The login page shows "Workshop Portal" - wait for that to disappear
  await expect(page.getByText('Workshop Portal')).not.toBeVisible({ timeout: 10000 });
}

/**
 * Login as facilitator using default credentials
 */
export async function loginAsFacilitator(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByText('Workshop Portal')).toBeVisible({ timeout: 10000 });

  await page.locator('#email').fill(DEFAULT_FACILITATOR.email);
  await page.locator('#password').fill(DEFAULT_FACILITATOR.password);
  await page.locator('button[type="submit"]').click();

  await expect(page.getByText(/Welcome, Facilitator!/i)).toBeVisible({ timeout: 10000 });
}

/**
 * Logout the current user
 */
export async function logout(page: Page): Promise<void> {
  // Look for logout button or dropdown
  const logoutButton = page.getByRole('button', { name: /logout|sign out/i });
  if (await logoutButton.isVisible().catch(() => false)) {
    await logoutButton.click();
  } else {
    // Try user menu dropdown
    const userMenu = page.getByRole('button', { name: /user|account|profile/i });
    if (await userMenu.isVisible().catch(() => false)) {
      await userMenu.click();
      await page.getByRole('menuitem', { name: /logout|sign out/i }).click();
    } else {
      // Fallback: clear storage and navigate to root
      await page.evaluate(() => {
        localStorage.clear();
        sessionStorage.clear();
      });
      await page.goto('/');
    }
  }

  // Verify we're back at login
  await expect(page.getByText('Workshop Portal')).toBeVisible({ timeout: 10000 });
}

/**
 * Set mock user in localStorage (for bypassing login in certain tests)
 */
export async function setMockUser(page: Page, user: User): Promise<void> {
  await page.addInitScript((userData) => {
    localStorage.setItem('workshop_user', JSON.stringify(userData));
  }, user);
}

/**
 * Clear the current user session
 */
export async function clearSession(page: Page): Promise<void> {
  await page.evaluate(() => {
    localStorage.removeItem('workshop_user');
    sessionStorage.clear();
  });
}
