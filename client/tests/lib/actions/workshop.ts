/**
 * Workshop actions
 *
 * Provides phase navigation and advancement functionality.
 */

import { expect, type Page } from '@playwright/test';
import type { Workshop } from '../types';
import { WorkshopPhase } from '../types';

/**
 * Navigate to a specific phase view in the UI
 *
 * Uses the sidebar or tab navigation to switch to a phase view.
 */
export async function goToPhase(page: Page, phase: WorkshopPhase): Promise<void> {
  const phaseLabels: Record<WorkshopPhase, string> = {
    [WorkshopPhase.INTAKE]: 'Intake',
    [WorkshopPhase.DISCOVERY]: 'Discovery',
    [WorkshopPhase.RUBRIC]: 'Rubric',
    [WorkshopPhase.ANNOTATION]: 'Annotation',
    [WorkshopPhase.RESULTS]: 'Results',
    [WorkshopPhase.JUDGE_TUNING]: 'Judge Tuning',
    [WorkshopPhase.UNITY_VOLUME]: 'Unity Volume',
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
 * Navigate to the facilitator dashboard (discovery monitor) via the workflow sidebar
 *
 * @param page - The Playwright page
 * @param workshopId - Optional workshop ID to reload to first
 * @param workshopName - Optional workshop name to click on from the facilitator's workshop list
 */
export async function goToFacilitatorDashboard(
  page: Page,
  workshopId?: string,
  workshopName?: string
): Promise<void> {
  // If workshopId is provided, navigate to the workshop
  if (workshopId) {
    await page.goto(`/?workshop=${workshopId}`);
    await page.waitForLoadState('networkidle');
  }

  // Check if we're on the facilitator workshop list (Welcome, Facilitator!)
  const welcomeFacilitator = page.getByText('Welcome, Facilitator!');
  if (await welcomeFacilitator.isVisible({ timeout: 2000 }).catch(() => false)) {
    // We need to click on the specific workshop to enter it
    // Find by workshop name if provided, otherwise try by workshop ID in the card
    if (workshopName) {
      const workshopCard = page.getByRole('heading', { name: new RegExp(workshopName) });
      await expect(workshopCard).toBeVisible({ timeout: 5000 });
      await workshopCard.click();
    } else {
      // Click the first workshop with Discovery status
      const discoveryCard = page.locator('div.cursor-pointer').filter({ hasText: /Discovery/ }).first();
      await discoveryCard.click();
    }
    await page.waitForURL(/\?workshop=/);
    await page.waitForLoadState('networkidle');
  }

  // Wait for the page to stabilize before interacting with the workflow step
  await page.waitForLoadState('networkidle');

  // Now click the discovery workflow step (which shows the facilitator dashboard for facilitators)
  const discoveryStep = page.getByTestId('workflow-step-discovery');
  await expect(discoveryStep).toBeVisible({ timeout: 10000 });
  // Wait a small moment for the React rehydration to complete
  await page.waitForTimeout(500);
  await discoveryStep.click();
}

/**
 * Navigate to the Trace Coverage tab within the facilitator dashboard
 */
export async function goToTraceCoverage(page: Page): Promise<void> {
  // First ensure we're on the facilitator dashboard
  await expect(page.getByTestId('trace-coverage')).toBeVisible({ timeout: 10000 }).catch(async () => {
    // Try clicking the Trace Coverage tab
    const tab = page.getByRole('tab', { name: /Trace Coverage/i });
    if (await tab.isVisible().catch(() => false)) {
      await tab.click();
    }
  });
  await expect(page.getByTestId('trace-coverage')).toBeVisible({ timeout: 5000 });
}

/**
 * Click on a trace row to expand it and show the TraceDiscoveryPanel
 */
export async function expandTraceRow(page: Page, traceId: string): Promise<void> {
  const traceRow = page.getByTestId(`trace-row-${traceId}`);
  await expect(traceRow).toBeVisible({ timeout: 5000 });
  await traceRow.click();
  // Wait for the panel to appear
  await expect(page.getByTestId('trace-discovery-panel')).toBeVisible({ timeout: 5000 });
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
    [WorkshopPhase.INTAKE]: null, // Can't advance to intake
    [WorkshopPhase.DISCOVERY]: 'advance-to-discovery',
    [WorkshopPhase.RUBRIC]: 'advance-to-rubric',
    [WorkshopPhase.ANNOTATION]: 'advance-to-annotation',
    [WorkshopPhase.RESULTS]: 'advance-to-results',
    [WorkshopPhase.JUDGE_TUNING]: 'advance-to-judge-tuning',
    [WorkshopPhase.UNITY_VOLUME]: 'advance-to-unity-volume',
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

/**
 * Configure the discovery questions LLM model for a workshop
 */
export async function configureDiscoveryLLM(
  page: Page,
  workshopId: string,
  modelName: string,
  apiUrl: string = 'http://127.0.0.1:8000'
): Promise<void> {
  const response = await page.request.put(
    `${apiUrl}/workshops/${workshopId}/discovery-questions-model`,
    {
      data: { model_name: modelName },
    }
  );

  if (!response.ok()) {
    throw new Error(
      `Failed to configure discovery LLM: ${response.status()} ${await response.text()}`
    );
  }
}

/**
 * Configure MLflow integration for a workshop
 */
export async function configureMLflow(
  page: Page,
  workshopId: string,
  config: {
    databricks_host: string;
    databricks_token: string;
    experiment_id: string;
  },
  apiUrl: string = 'http://127.0.0.1:8000'
): Promise<void> {
  const response = await page.request.post(
    `${apiUrl}/workshops/${workshopId}/mlflow-config`,
    {
      data: {
        databricks_host: config.databricks_host,
        databricks_token: config.databricks_token,
        experiment_id: config.experiment_id,
        max_traces: 100,
      },
    }
  );

  if (!response.ok()) {
    throw new Error(
      `Failed to configure MLflow: ${response.status()} ${await response.text()}`
    );
  }
}
