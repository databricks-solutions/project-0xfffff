/**
 * Authentication actions
 *
 * Provides login/logout functionality for e2e tests.
 */

import { expect, type Page } from '@playwright/test';
import type { User } from '../types';
import { DEFAULT_FACILITATOR } from '../data';

/**
 * Helper to select a workshop from the dropdown
 */
async function selectWorkshopFromDropdown(page: Page, workshopId: string): Promise<void> {
  // Wait for "Loading workshops..." to disappear
  const loadingText = page.getByText(/Loading workshops/i);
  await expect(loadingText).not.toBeVisible({ timeout: 5000 }).catch(() => {});

  // Find and click the combobox to open the dropdown
  const workshopSelect = page.locator('button[role="combobox"]').first();
  if (await workshopSelect.isVisible().catch(() => false)) {
    await workshopSelect.click();
    // Wait for dropdown content to appear
    await page.waitForSelector('[role="listbox"]', { timeout: 3000 }).catch(() => {});
    await page.waitForTimeout(200);

    // Try multiple selector patterns for Radix Select item with specific value
    // Radix uses data-radix-collection-item and the value is in data-value
    const selectors = [
      `[role="option"][data-value="${workshopId}"]`,
      `[data-radix-collection-item][data-value="${workshopId}"]`,
      `div[role="option"]:has-text("${workshopId.substring(0, 8)}")`, // partial ID match
    ];

    let clicked = false;
    for (const selector of selectors) {
      const workshopOption = page.locator(selector);
      if (await workshopOption.isVisible({ timeout: 500 }).catch(() => false)) {
        await workshopOption.click();
        clicked = true;
        break;
      }
    }

    // Fallback: click first option if nothing else worked
    if (!clicked) {
      const firstOption = page.locator('[role="option"]').first();
      if (await firstOption.isVisible({ timeout: 500 }).catch(() => false)) {
        await firstOption.click();
      }
    }
  }
}

/**
 * Login as a specific user
 *
 * Handles both facilitator login (with password) and participant login (email only).
 *
 * For facilitators: clicks "Create New" if no workshop_id is provided (to create new workshop)
 * For participants/SMEs: selects the workshop from dropdown if workshop_id is provided
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

    // Wait for workshop options to load
    await page.waitForTimeout(500);

    // For facilitators, check if we need to click "Create New" or select existing workshop
    const createNewButton = page.getByRole('button', { name: /Create New/i });
    const joinExistingButton = page.getByRole('button', { name: /Join Existing/i });

    if (await createNewButton.isVisible().catch(() => false)) {
      // If user has a workshop_id, try to join existing; otherwise create new
      if (user.workshop_id) {
        // Click "Join Existing" if it's visible AND enabled, then select the workshop
        const isJoinExistingEnabled = await joinExistingButton.isEnabled().catch(() => false);
        if (isJoinExistingEnabled) {
          await joinExistingButton.click();
          await page.waitForTimeout(300);
          await selectWorkshopFromDropdown(page, user.workshop_id);
        } else {
          // If Join Existing is disabled (no workshops), just click Create New
          // The workshop will be created after login
          await createNewButton.click();
        }
      } else {
        // Click "Create New" to enable submit button for workshop creation
        await createNewButton.click();
      }
    }
  } else {
    // For participants/SMEs, need to select workshop from dropdown
    if (user.workshop_id) {
      // Wait for workshops to load
      await page.waitForTimeout(500);
      await selectWorkshopFromDropdown(page, user.workshop_id);
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
 *
 * This assumes the facilitator wants to create a new workshop.
 */
export async function loginAsFacilitator(page: Page): Promise<void> {
  await page.goto('/');
  await expect(page.getByText('Workshop Portal')).toBeVisible({ timeout: 10000 });

  await page.locator('#email').fill(DEFAULT_FACILITATOR.email);
  await page.locator('#password').fill(DEFAULT_FACILITATOR.password);

  // Wait for workshop options to load
  await page.waitForTimeout(500);

  // Click "Create New" to enable submit button for workshop creation
  const createNewButton = page.getByRole('button', { name: /Create New/i });
  if (await createNewButton.isVisible().catch(() => false)) {
    await createNewButton.click();
  }

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
