/**
 * Workshop actions
 *
 * Provides phase navigation and advancement functionality.
 */

import { expect, type Page } from '@playwright/test';
import type { Workshop, WorkshopPhase } from '../types';

/**
 * Navigate to a specific phase view in the UI
 *
 * Uses the sidebar or tab navigation to switch to a phase view.
 */
export async function goToPhase(page: Page, phase: WorkshopPhase): Promise<void> {
  const phaseLabels: Record<WorkshopPhase, string> = {
    intake: 'Intake',
    discovery: 'Discovery',
    rubric: 'Rubric',
    annotation: 'Annotation',
    results: 'Results',
    judge_tuning: 'Judge Tuning',
    unity_volume: 'Unity Volume',
  };

  const label = phaseLabels[phase];

  // Try sidebar navigation first
  const sidebarLink = page.getByRole('link', { name: new RegExp(label, 'i') });
  if (await sidebarLink.isVisible().catch(() => false)) {
    await sidebarLink.click();
    return;
  }

  // Try tab navigation
  const tab = page.getByRole('tab', { name: new RegExp(label, 'i') });
  if (await tab.isVisible().catch(() => false)) {
    await tab.click();
    return;
  }

  // Try button navigation
  const button = page.getByRole('button', { name: new RegExp(label, 'i') });
  if (await button.isVisible().catch(() => false)) {
    await button.click();
    return;
  }

  throw new Error(`Could not find navigation element for phase: ${phase}`);
}

/**
 * Navigate to a specific tab within the current view
 */
export async function goToTab(page: Page, tabName: string): Promise<void> {
  const tab = page.getByRole('tab', { name: new RegExp(tabName, 'i') });
  await expect(tab).toBeVisible({ timeout: 5000 });
  await tab.click();
}

/**
 * Advance the workshop to a specific phase via API
 *
 * This makes the actual API call to advance phases.
 * Used when you want to programmatically advance without UI interaction.
 */
export async function advanceToPhase(
  page: Page,
  workshopId: string,
  phase: WorkshopPhase,
  apiUrl: string = 'http://127.0.0.1:8000'
): Promise<void> {
  const phaseEndpoints: Record<WorkshopPhase, string | null> = {
    intake: null, // Can't advance to intake
    discovery: 'advance-to-discovery',
    rubric: 'advance-to-rubric',
    annotation: 'advance-to-annotation',
    results: 'advance-to-results',
    judge_tuning: 'advance-to-judge-tuning',
    unity_volume: 'advance-to-unity-volume',
  };

  const endpoint = phaseEndpoints[phase];
  if (!endpoint) {
    throw new Error(`Cannot advance to phase: ${phase}`);
  }

  // Use page.request() to make the API call
  const response = await page.request.post(
    `${apiUrl}/workshops/${workshopId}/${endpoint}`
  );

  if (!response.ok()) {
    throw new Error(
      `Failed to advance to ${phase}: ${response.status()} ${await response.text()}`
    );
  }
}

/**
 * Click the "Start Workshop Now" button and wait for workshop creation
 */
export async function startWorkshop(page: Page): Promise<string> {
  // Wait for and click the start button
  const startButton = page.getByRole('button', { name: /Start Workshop Now/i });
  await expect(startButton).toBeVisible({ timeout: 10000 });

  // Wait for the workshop creation response
  const [response] = await Promise.all([
    page.waitForResponse(
      (resp) =>
        resp.request().method() === 'POST' &&
        resp.url().includes('/workshops') &&
        resp.status() === 201
    ),
    startButton.click(),
  ]);

  // Extract workshop ID from URL
  await expect(page).toHaveURL(/\?workshop=[a-f0-9-]{36}/i, { timeout: 10000 });
  const workshopId = new URL(page.url()).searchParams.get('workshop');

  if (!workshopId) {
    throw new Error('Workshop ID not found in URL after creation');
  }

  return workshopId;
}

/**
 * Begin the discovery phase with traces
 */
export async function beginDiscovery(
  page: Page,
  workshopId: string,
  traceLimit?: number,
  apiUrl: string = 'http://127.0.0.1:8000'
): Promise<void> {
  const url = traceLimit
    ? `${apiUrl}/workshops/${workshopId}/begin-discovery?trace_limit=${traceLimit}`
    : `${apiUrl}/workshops/${workshopId}/begin-discovery`;

  const response = await page.request.post(url);

  if (!response.ok()) {
    throw new Error(
      `Failed to begin discovery: ${response.status()} ${await response.text()}`
    );
  }
}

/**
 * Begin the annotation phase
 */
export async function beginAnnotation(
  page: Page,
  workshopId: string,
  apiUrl: string = 'http://127.0.0.1:8000'
): Promise<void> {
  const response = await page.request.post(
    `${apiUrl}/workshops/${workshopId}/begin-annotation`
  );

  if (!response.ok()) {
    throw new Error(
      `Failed to begin annotation: ${response.status()} ${await response.text()}`
    );
  }
}

/**
 * Reload the page to pick up workshop state changes
 */
export async function reloadWorkshop(
  page: Page,
  workshopId: string
): Promise<void> {
  await page.goto(`/?workshop=${workshopId}`);
  await page.waitForLoadState('networkidle');
}
