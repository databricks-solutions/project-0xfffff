/**
 * Authentication actions
 *
 * Provides login/logout functionality for e2e tests.
 */

import { expect, type Page } from '@playwright/test';
import type { User } from '../types';
import { UserRole } from '../types';
import { DEFAULT_FACILITATOR } from '../data';

/**
 * Helper to select a workshop from the dropdown
 */
async function selectWorkshopFromDropdown(page: Page, workshopId: string): Promise<void> {
  // Wait for "Loading workshops..." to disappear
  const loadingText = page.getByText(/Loading workshops/i);
  await expect(loadingText).not.toBeVisible({ timeout: 5000 }).catch(() => {});

  // Find the combobox (Select trigger)
  const workshopSelect = page.locator('button[role="combobox"]').first();
  if (!await workshopSelect.isVisible().catch(() => false)) {
    // No dropdown visible - might be auto-submitted or different UI state
    return;
  }

  // Check if the workshop is already selected by looking at the trigger's data-state
  // and the displayed text. If it shows the workshop name, we might be done.
  // The Radix Select sets aria-expanded when open
  const triggerText = await workshopSelect.textContent();

  // Click to open the dropdown
  await workshopSelect.click();

  // Wait for dropdown content to appear
  await page.waitForSelector('[role="listbox"]', { timeout: 3000 }).catch(() => {});
  await page.waitForTimeout(200);

  // Radix Select stores the value in data-value attribute on the option element
  // Try the data-value selector first (most reliable)
  const dataValueSelector = `[role="option"][data-value="${workshopId}"]`;
  const workshopOption = page.locator(dataValueSelector);

  if (await workshopOption.isVisible({ timeout: 1000 }).catch(() => false)) {
    await workshopOption.click();
  } else {
    // If data-value selector didn't work, check if the listbox is empty or workshop not found
    const availableOptions = await page.locator('[role="option"]').all();

    if (availableOptions.length === 0) {
      // No options available - might be a timing issue or no workshops
      // Close the dropdown by clicking elsewhere and throw
      await page.keyboard.press('Escape');
      throw new Error(
        `No workshop options available in dropdown. Expected workshop: ${workshopId}`
      );
    }

    const optionValues = await Promise.all(
      availableOptions.map(async (opt) => {
        const value = await opt.getAttribute('data-value');
        const text = await opt.textContent();
        return `${value}: ${text}`;
      })
    );

    // Close dropdown before throwing
    await page.keyboard.press('Escape');

    console.error(
      `[selectWorkshopFromDropdown] Could not find workshop ${workshopId}. ` +
      `Trigger showed: "${triggerText}". Available options: ${optionValues.join(', ')}`
    );
    throw new Error(
      `Workshop ${workshopId} not found in dropdown. ` +
      `Available: ${optionValues.join(', ')}`
    );
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
  // Always navigate to login page explicitly
  await page.goto('/');

  // Wait for React to mount
  await page.waitForSelector('#root > *', { timeout: 10000 });
  await page.waitForLoadState('networkidle');

  // Wait for login page to be visible
  await expect(page.getByText('Workshop Portal')).toBeVisible({ timeout: 10000 });

  // Fill email
  await page.locator('#email').fill(user.email);

  // Facilitators need password
  if (user.role === UserRole.FACILITATOR) {
    const passwordField = page.locator('#password');
    if (await passwordField.isVisible().catch(() => false)) {
      // Use default facilitator password if this is the default facilitator
      const password =
        user.email === DEFAULT_FACILITATOR.email
          ? DEFAULT_FACILITATOR.password
          : 'password123';
      await passwordField.fill(password);
    }

    // Wait for workshop options to load - wait for "Loading workshops..." to disappear
    const loadingText = page.getByText(/Loading workshops/i);
    await expect(loadingText).not.toBeVisible({ timeout: 10000 }).catch(() => {});

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
      // Wait for workshops to load - wait for "Loading workshops..." to disappear
      const loadingText = page.getByText(/Loading workshops/i);
      await expect(loadingText).not.toBeVisible({ timeout: 10000 }).catch(() => {});
      await selectWorkshopFromDropdown(page, user.workshop_id);
    }
  }

  // Submit login form
  await page.locator('button[type="submit"]').click();

  // Wait for navigation away from login page
  // The login page shows "Workshop Portal" - wait for that to disappear
  await expect(page.getByText('Workshop Portal')).not.toBeVisible({ timeout: 10000 });

  // For facilitators with a workshop_id, we need to navigate into the workshop
  // After login, facilitators land on the "Welcome, Facilitator" page showing workshop cards
  if (user.role === UserRole.FACILITATOR && user.workshop_id) {
    // Check if we're on the workshop selection page
    const welcomeFacilitator = page.getByText('Welcome, Facilitator');
    if (await welcomeFacilitator.isVisible({ timeout: 3000 }).catch(() => false)) {
      // Wait for workshops to load on this page
      const loadingWorkshops = page.getByText(/Loading workshops/i);
      await expect(loadingWorkshops).not.toBeVisible({ timeout: 10000 }).catch(() => {});

      // Click on the workshop card to enter the workshop
      // The card has data-testid="workshop-card-{id}"
      const workshopCard = page.locator(`[data-testid="workshop-card-${user.workshop_id}"]`);
      if (await workshopCard.isVisible({ timeout: 5000 }).catch(() => false)) {
        await workshopCard.click();
        // Wait for URL to update with workshop ID
        await page.waitForURL(/\?workshop=/, { timeout: 10000 });
      } else {
        // Fallback: try clicking on any workshop card that's visible
        const anyCard = page.locator('[data-testid^="workshop-card-"]').first();
        if (await anyCard.isVisible({ timeout: 2000 }).catch(() => false)) {
          await anyCard.click();
          await page.waitForURL(/\?workshop=/, { timeout: 10000 });
        }
      }
    }
  }

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

  await expect(page.getByText(/Welcome, Facilitator/i)).toBeVisible({ timeout: 10000 });
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
