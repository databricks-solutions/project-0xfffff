/**
 * Discovery phase actions
 *
 * Provides functionality for discovery phase interactions.
 */

import { expect, type Page } from '@playwright/test';
import type { DiscoveryFinding, Trace } from '../types';

interface SubmitFindingOptions {
  /** The trace to submit findings for (provide trace or traceIndex) */
  trace?: Trace;
  /** Index of the trace (if not providing trace object) */
  traceIndex?: number;
  /** The insight text */
  insight: string;
}

/**
 * Submit a discovery finding via the UI
 */
export async function submitFinding(
  page: Page,
  options: SubmitFindingOptions
): Promise<void> {
  const { insight } = options;

  // Look for the discovery form fields
  // The app uses question1 and question2 for the two text areas
  const question1 = page.locator('#question1');
  const question2 = page.locator('#question2');

  if (await question1.isVisible().catch(() => false)) {
    // Split insight into two parts if both fields exist
    if (await question2.isVisible().catch(() => false)) {
      const parts = insight.split('\n\n');
      await question1.fill(parts[0] || insight);
      await question2.fill(parts[1] || 'Additional observations.');
    } else {
      await question1.fill(insight);
    }
  } else {
    // Try generic textarea or input
    const textarea = page.locator('textarea').first();
    if (await textarea.isVisible().catch(() => false)) {
      await textarea.fill(insight);
    }
  }

  // Submit the finding
  const submitButton = page.getByRole('button', { name: /^Complete$/i });
  if (await submitButton.isVisible().catch(() => false)) {
    await submitButton.click();
  }
}

/**
 * Submit a finding via API
 */
export async function submitFindingViaApi(
  page: Page,
  workshopId: string,
  finding: {
    trace_id: string;
    user_id: string;
    insight: string;
  },
  apiUrl: string = 'http://127.0.0.1:8000'
): Promise<DiscoveryFinding> {
  const response = await page.request.post(
    `${apiUrl}/workshops/${workshopId}/findings`,
    {
      headers: { 'Content-Type': 'application/json' },
      data: finding,
    }
  );

  if (!response.ok()) {
    throw new Error(
      `Failed to submit finding: ${response.status()} ${await response.text()}`
    );
  }

  return (await response.json()) as DiscoveryFinding;
}

/**
 * Complete the discovery phase for the current user
 */
export async function completeDiscovery(page: Page): Promise<void> {
  // Look for the "Complete Discovery Phase" button
  const completeButton = page.getByTestId('complete-discovery-phase-button');

  if (await completeButton.isVisible().catch(() => false)) {
    await completeButton.click();
    // Wait for confirmation or phase transition
    await page.waitForTimeout(500);
  } else {
    // Try alternative button text
    const altButton = page.getByRole('button', {
      name: /complete.*discovery|finish.*discovery/i,
    });
    if (await altButton.isVisible().catch(() => false)) {
      await altButton.click();
    }
  }
}

/**
 * Mark user's discovery as complete via API
 */
export async function markDiscoveryCompleteViaApi(
  page: Page,
  workshopId: string,
  userId: string,
  apiUrl: string = 'http://127.0.0.1:8000'
): Promise<void> {
  const response = await page.request.post(
    `${apiUrl}/workshops/${workshopId}/users/${userId}/complete-discovery`
  );

  if (!response.ok()) {
    throw new Error(
      `Failed to mark discovery complete: ${response.status()} ${await response.text()}`
    );
  }
}

/**
 * Check if a user has completed discovery
 */
export async function isDiscoveryComplete(
  page: Page,
  workshopId: string,
  userId: string,
  apiUrl: string = 'http://127.0.0.1:8000'
): Promise<boolean> {
  const response = await page.request.get(
    `${apiUrl}/workshops/${workshopId}/users/${userId}/discovery-complete`
  );

  if (!response.ok()) {
    return false;
  }

  const body = (await response.json()) as { discovery_complete: boolean };
  return body.discovery_complete;
}

/**
 * Get the discovery completion status for a workshop
 */
export async function getDiscoveryCompletionStatus(
  page: Page,
  workshopId: string,
  apiUrl: string = 'http://127.0.0.1:8000'
): Promise<{
  total_participants: number;
  completed_participants: number;
  all_completed: boolean;
}> {
  const response = await page.request.get(
    `${apiUrl}/workshops/${workshopId}/discovery-completion-status`
  );

  if (!response.ok()) {
    throw new Error(
      `Failed to get discovery status: ${response.status()} ${await response.text()}`
    );
  }

  return (await response.json()) as {
    total_participants: number;
    completed_participants: number;
    all_completed: boolean;
  };
}

/**
 * Wait for the discovery phase title to be visible
 */
export async function waitForDiscoveryPhase(page: Page): Promise<void> {
  await expect(page.getByTestId('discovery-phase-title')).toBeVisible({
    timeout: 10000,
  });
}
