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
      comment: 'Clear but slightly verbose. Consider account recovery steps for locked-out users.',
    },
  });

  for (let q = 1; q <= 3; q++) {
    await page.request.post(`${API_URL}/workshops/${workshopId}/submit-followup-answer`, {
      data: {
        trace_id: traceId,
        user_id: userId,
        question: `Follow-up question ${q}?`,
        answer: `Follow-up answer ${q}.`,
      },
    });
  }
}

test('discovery blocks until multiple participants complete; facilitator-driven phase with trace-based discovery', {
  tag: ['@spec:DISCOVERY_TRACE_ASSIGNMENT_SPEC'],
  timeout: 60_000,
}, async ({ browser }) => {
  const scenario = await TestScenario.create(browser)
    .withWorkshop({ name: 'Discovery Trace Assignment' })
    .withFacilitator()
    .withParticipants(2)
    .withTraces(1)
    .inPhase(WorkshopPhase.DISCOVERY)
    .withRealApi()
    .build();

  const workshopId = scenario.workshop.id;
  const traceId = scenario.traces[0].id;
  const participantA = scenario.users.participant[0];
  const participantB = scenario.users.participant[1];

  // --- Participant A completes discovery ---
  const pageA = await scenario.newPageAs(participantA);
  await expect(pageA.getByTestId('discovery-phase-title')).toBeVisible({ timeout: 20000 });

  // Submit complete feedback via API (label + comment + 3 Q&A pairs)
  await submitCompleteFeedback(pageA, workshopId, traceId, participantA.id);

  // Reload to pick up completed feedback state
  await pageA.reload();
  await pageA.waitForLoadState('networkidle');
  await expect(pageA.getByTestId('discovery-phase-title')).toBeVisible({ timeout: 20000 });

  // Click "Complete Discovery" button (appears when all traces have completed feedback)
  await expect(pageA.getByTestId('complete-discovery-phase-button')).toBeVisible({ timeout: 20000 });
  await pageA.getByTestId('complete-discovery-phase-button').click();

  // Verify status is 1/2 — not all completed yet
  await expect
    .poll(async () => {
      const resp = await scenario.page.request.get(
        `${API_URL}/workshops/${workshopId}/discovery-completion-status`,
      );
      if (!resp.ok()) return null;
      return resp.json();
    })
    .toMatchObject({
      total_participants: 2,
      completed_participants: 1,
      all_completed: false,
    });

  // Participant A is marked complete
  await expect
    .poll(async () => {
      const resp = await scenario.page.request.get(
        `${API_URL}/workshops/${workshopId}/users/${participantA.id}/discovery-complete`,
      );
      if (!resp.ok()) return false;
      const body = (await resp.json()) as { discovery_complete: boolean };
      return body.discovery_complete;
    })
    .toBeTruthy();

  // Participant B is NOT yet complete
  await expect
    .poll(async () => {
      const resp = await scenario.page.request.get(
        `${API_URL}/workshops/${workshopId}/users/${participantB.id}/discovery-complete`,
      );
      if (!resp.ok()) return null;
      const body = (await resp.json()) as { discovery_complete: boolean };
      return body.discovery_complete;
    })
    .toBeFalsy();

  // --- Participant B completes discovery ---
  const pageB = await scenario.newPageAs(participantB);
  await expect(pageB.getByTestId('discovery-phase-title')).toBeVisible({ timeout: 20000 });

  await submitCompleteFeedback(pageB, workshopId, traceId, participantB.id);

  await pageB.reload();
  await pageB.waitForLoadState('networkidle');
  await expect(pageB.getByTestId('discovery-phase-title')).toBeVisible({ timeout: 20000 });

  await expect(pageB.getByTestId('complete-discovery-phase-button')).toBeVisible({ timeout: 20000 });
  await pageB.getByTestId('complete-discovery-phase-button').click();

  // Verify status is now 2/2 — all completed
  await expect
    .poll(async () => {
      const resp = await scenario.page.request.get(
        `${API_URL}/workshops/${workshopId}/discovery-completion-status`,
      );
      if (!resp.ok()) return null;
      return resp.json();
    })
    .toMatchObject({
      total_participants: 2,
      completed_participants: 2,
      all_completed: true,
    });

  // Participant B is now complete
  await expect
    .poll(async () => {
      const resp = await scenario.page.request.get(
        `${API_URL}/workshops/${workshopId}/users/${participantB.id}/discovery-complete`,
      );
      if (!resp.ok()) return false;
      const body = (await resp.json()) as { discovery_complete: boolean };
      return body.discovery_complete;
    })
    .toBeTruthy();

  await scenario.cleanup();
});
