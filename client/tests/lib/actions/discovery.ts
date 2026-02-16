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
 * If not visible after initial wait, try reloading once (useful when workshop state changed externally)
 */
export async function waitForDiscoveryPhase(page: Page): Promise<void> {
  const discoveryTitle = page.getByTestId('discovery-phase-title');

  // First try - check if discovery phase is already visible
  const isVisible = await discoveryTitle.isVisible().catch(() => false);
  if (isVisible) {
    return;
  }

  // Wait a bit for React Query to fetch fresh data
  await page.waitForTimeout(1000);

  // Try waiting for the title with a reasonable timeout
  try {
    await expect(discoveryTitle).toBeVisible({ timeout: 15000 });
  } catch {
    // If still not visible, reload the page to force fresh data fetch
    await page.reload();
    await expect(discoveryTitle).toBeVisible({ timeout: 15000 });
  }
}

// ========================================
// Facilitator Discovery Panel Actions
// ========================================

/** Valid discovery categories per spec */
export const DISCOVERY_CATEGORIES = [
  'themes',
  'edge_cases',
  'boundary_conditions',
  'failure_modes',
  'missing_info',
] as const;

export type DiscoveryCategory = (typeof DISCOVERY_CATEGORIES)[number];

/**
 * Wait for the TraceDiscoveryPanel to be visible
 */
export async function waitForTraceDiscoveryPanel(page: Page): Promise<void> {
  await expect(page.getByTestId('trace-discovery-panel')).toBeVisible({ timeout: 10000 });
}

/**
 * Get the finding count for a specific category from the UI
 * Returns an object with current count and threshold
 */
export async function getCategoryCount(
  page: Page,
  category: DiscoveryCategory
): Promise<{ count: number; threshold: number }> {
  const badge = page.getByTestId(`category-${category}-count`);
  await expect(badge).toBeVisible({ timeout: 5000 });
  const text = await badge.textContent();
  // Parse "2/3" format
  const match = text?.match(/(\d+)\/(\d+)/);
  if (!match) {
    throw new Error(`Could not parse category count: ${text}`);
  }
  return {
    count: parseInt(match[1], 10),
    threshold: parseInt(match[2], 10),
  };
}

/**
 * Get all finding texts for a specific category from the UI
 */
export async function getCategoryFindings(
  page: Page,
  category: DiscoveryCategory
): Promise<string[]> {
  const findingsContainer = page.getByTestId(`category-${category}-findings`);
  // Container may not exist if no findings
  if (!(await findingsContainer.isVisible().catch(() => false))) {
    return [];
  }
  // Get all finding text spans within the container
  const findings = await findingsContainer.locator('span.line-clamp-1').allTextContents();
  return findings;
}

/**
 * Click the promote button for a finding in a specific category
 * Returns the findingId if we can extract it
 */
export async function promoteFindingInUI(
  page: Page,
  category: DiscoveryCategory,
  findingIndex: number = 0
): Promise<void> {
  const findingsContainer = page.getByTestId(`category-${category}-findings`);
  await expect(findingsContainer).toBeVisible({ timeout: 5000 });

  const promoteButtons = findingsContainer.getByTestId('promote-finding-btn');
  const button = promoteButtons.nth(findingIndex);
  await expect(button).toBeVisible({ timeout: 5000 });
  await expect(button).toHaveText('Promote');
  await button.click();

  // Wait for the button to change to "Promoted"
  await expect(button).toHaveText('Promoted', { timeout: 5000 });
}

/**
 * Check if a finding at a specific index in a category is promoted
 */
export async function isFindingPromoted(
  page: Page,
  category: DiscoveryCategory,
  findingIndex: number = 0
): Promise<boolean> {
  const findingsContainer = page.getByTestId(`category-${category}-findings`);
  if (!(await findingsContainer.isVisible().catch(() => false))) {
    return false;
  }

  const promoteButtons = findingsContainer.getByTestId('promote-finding-btn');
  const button = promoteButtons.nth(findingIndex);
  if (!(await button.isVisible().catch(() => false))) {
    return false;
  }

  const text = await button.textContent();
  return text === 'Promoted';
}

/**
 * Update a category threshold via the UI
 */
export async function updateCategoryThreshold(
  page: Page,
  category: DiscoveryCategory,
  newThreshold: number
): Promise<void> {
  const input = page.getByTestId(`threshold-input-${category}`);
  await expect(input).toBeVisible({ timeout: 5000 });
  await input.fill(String(newThreshold));

  // Click the update button
  const updateButton = page.getByTestId('update-thresholds-btn');
  await updateButton.click();

  // Wait for the update to complete (button text changes back from "Updating...")
  await expect(updateButton).toHaveText('Update Thresholds', { timeout: 5000 });
}

/**
 * Click the generate question button
 */
export async function clickGenerateQuestion(page: Page): Promise<void> {
  const button = page.getByTestId('generate-question-btn');
  await expect(button).toBeVisible({ timeout: 5000 });
  await button.click();
  // Wait for the generation to complete
  await expect(button).toHaveText('Generate Question', { timeout: 10000 });
}

/**
 * Check if the disagreements section is visible and get disagreement count
 */
export async function getDisagreementsCount(page: Page): Promise<number> {
  const section = page.getByTestId('disagreements-section');
  if (!(await section.isVisible().catch(() => false))) {
    return 0;
  }
  const items = await section.getByTestId('disagreement-item').count();
  return items;
}

/**
 * Get the summary text of a disagreement
 */
export async function getDisagreementSummary(
  page: Page,
  index: number = 0
): Promise<string> {
  const section = page.getByTestId('disagreements-section');
  await expect(section).toBeVisible({ timeout: 5000 });

  const item = section.getByTestId('disagreement-item').nth(index);
  await expect(item).toBeVisible({ timeout: 5000 });

  // Get the summary text (first p element)
  const summary = await item.locator('p').first().textContent();
  return summary || '';
}
