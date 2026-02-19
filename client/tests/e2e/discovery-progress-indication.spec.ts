/**
 * E2E Test: Discovery progress indication
 *
 * Tests the progress UI in TraceViewerDemo:
 * trace counter (X/Y), progress bar count, green completion bar, checkmarks.
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib/scenario-builder';
import { WorkshopPhase } from '../lib/types';

declare const process: { env: Record<string, string | undefined> };

const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000';

/**
 * Submit complete discovery feedback for a trace via API
 * (label + comment + 3 follow-up Q&A pairs)
 */
async function submitCompleteFeedback(
  page: import('@playwright/test').Page,
  workshopId: string,
  traceId: string,
  userId: string,
) {
  await page.request.post(`${API_URL}/workshops/${workshopId}/discovery-feedback`, {
    data: {
      trace_id: traceId,
      user_id: userId,
      feedback_label: 'good',
      comment: 'Good response quality.',
    },
  });

  for (let q = 1; q <= 3; q++) {
    await page.request.post(`${API_URL}/workshops/${workshopId}/submit-followup-answer`, {
      data: {
        trace_id: traceId,
        user_id: userId,
        question: `Follow-up question ${q}?`,
        answer: `Detailed answer ${q}.`,
      },
    });
  }
}

test.describe('Discovery progress indication', () => {

  test('trace counter shows X/Y format', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Clear progress indication (X of Y traces completed)',
      '@e2e-real',
    ],
  }, async ({ browser }) => {
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Progress Counter Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(3)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    const participant = scenario.users.participant[0];
    const participantPage = await scenario.newPageAs(participant);

    // Trace counter shows "1/3" format
    await expect(
      participantPage.getByTestId('trace-number')
    ).toHaveText('1/3', { timeout: 15000 });

    // Progress text shows "0/3" (no completed traces yet)
    const phaseTitle = participantPage.getByTestId('discovery-phase-title');
    const progressText = phaseTitle.locator('span.text-gray-500');
    await expect(progressText).toHaveText('0/3');

    await scenario.cleanup();
  });

  test('progress bar text reflects completed trace count after feedback', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Clear progress indication (X of Y traces completed)',
      '@e2e-real',
    ],
  }, async ({ browser }) => {
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Progress Count Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(3)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    const participant = scenario.users.participant[0];
    const workshopId = scenario.workshop.id;
    const traceId = scenario.traces[0].id;

    // Submit complete feedback for trace 1 via API
    await submitCompleteFeedback(scenario.page, workshopId, traceId, participant.id);

    // Login as participant and check progress
    const participantPage = await scenario.newPageAs(participant);

    const phaseTitle = participantPage.getByTestId('discovery-phase-title');
    const progressText = phaseTitle.locator('span.text-gray-500');

    // Progress text should show "1/3" (1 completed out of 3)
    await expect(progressText).toHaveText('1/3', { timeout: 15000 });

    await scenario.cleanup();
  });

  test('progress bar turns green when all traces completed', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Clear progress indication (X of Y traces completed)',
      '@e2e-real',
    ],
  }, async ({ browser }) => {
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Progress Green Bar Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    const participant = scenario.users.participant[0];
    const workshopId = scenario.workshop.id;

    // Submit complete feedback for ALL traces via API
    for (const trace of scenario.traces) {
      await submitCompleteFeedback(scenario.page, workshopId, trace.id, participant.id);
    }

    // Login as participant
    const participantPage = await scenario.newPageAs(participant);

    const phaseTitle = participantPage.getByTestId('discovery-phase-title');

    // Progress text should show "2/2"
    const progressText = phaseTitle.locator('span.text-gray-500');
    await expect(progressText).toHaveText('2/2', { timeout: 15000 });

    // Progress bar inner should have bg-green-500 (not bg-blue-500)
    const progressBarContainer = phaseTitle.locator('.bg-gray-200');
    const progressBarInner = progressBarContainer.locator('div');
    await expect(progressBarInner).toHaveClass(/bg-green-500/);

    await scenario.cleanup();
  });

  test('green checkmark appears next to completed traces, absent for incomplete', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Clear progress indication (X of Y traces completed)',
      '@e2e-real',
    ],
  }, async ({ browser }) => {
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Progress Checkmark Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    const participant = scenario.users.participant[0];
    const workshopId = scenario.workshop.id;

    // Submit complete feedback for trace 1 only
    await submitCompleteFeedback(
      scenario.page, workshopId, scenario.traces[0].id, participant.id,
    );

    // Login as participant (starts on trace 1)
    const participantPage = await scenario.newPageAs(participant);

    const phaseTitle = participantPage.getByTestId('discovery-phase-title');

    // Wait for progress to load - trace 1 is completed
    const progressText = phaseTitle.locator('span.text-gray-500');
    await expect(progressText).toHaveText('1/2', { timeout: 15000 });

    // Green checkmark should be visible for trace 1 (current trace is completed)
    const checkmark = phaseTitle.locator('svg.text-green-500');
    await expect(checkmark).toBeVisible();

    // Navigate to trace 2 (incomplete)
    await participantPage.getByRole('button', { name: /Next/i }).click();
    await expect(
      participantPage.getByTestId('trace-number')
    ).toHaveText('2/2', { timeout: 10000 });

    // Green checkmark should NOT be visible for trace 2
    await expect(checkmark).not.toBeVisible();

    await scenario.cleanup();
  });
});
