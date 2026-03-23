/**
 * E2E Test: Discovery feedback persists across page reload
 *
 * Verifies that when a participant submits feedback (GOOD/BAD + comment + follow-up Q&A),
 * the data is persisted to the database and restored when the page is reloaded.
 * This tests the full round-trip: API save → page load → API fetch → UI restore → reload → still there.
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib/scenario-builder';
import { WorkshopPhase } from '../lib/types';

declare const process: { env: Record<string, string | undefined> };

const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000';

test('discovery feedback persists across page reload', {
  tag: ['@spec:DISCOVERY_SPEC', '@req:Feedback saved incrementally (no data loss on failure)', '@e2e-real'],
}, async ({
  browser,
}) => {
  // --- Setup via TestScenario builder ---
  const scenario = await TestScenario.create(browser)
    .withWorkshop({ name: 'Feedback Persistence Test' })
    .withFacilitator()
    .withParticipants(1)
    .withTraces(1)
    .inPhase(WorkshopPhase.DISCOVERY)
    .withRealApi()
    .build();

  // Start discovery
  await scenario.loginAs(scenario.facilitator);
  await scenario.beginDiscovery(1);

  const participant = scenario.users.participant[0];
  const traceId = scenario.traces[0].id;
  const workshopId = scenario.workshop.id;

  // --- Submit feedback + 3 Q&A pairs via API (simulates a prior session) ---
  const feedbackResp = await scenario.page.request.post(
    `${API_URL}/workshops/${workshopId}/discovery-feedback`,
    {
      data: {
        trace_id: traceId,
        user_id: participant.id,
        feedback_label: 'good',
        comment: 'The response is clear and helpful.',
      },
    },
  );
  expect(feedbackResp.ok(), 'feedback submission should succeed').toBeTruthy();

  for (let q = 1; q <= 3; q++) {
    const answerResp = await scenario.page.request.post(
      `${API_URL}/workshops/${workshopId}/submit-followup-answer`,
      {
        data: {
          trace_id: traceId,
          user_id: participant.id,
          question: `Persistence test question ${q}?`,
          answer: `Persistence test answer ${q}.`,
        },
      },
    );
    expect(answerResp.ok(), `Q&A ${q} submission should succeed`).toBeTruthy();
  }

  // --- Participant opens page — feedback should be restored from DB ---
  const participantPage = await scenario.newPageAs(participant);

  // Should see "complete" state since all 3 Q&As are done
  await expect(
    participantPage.getByText('Feedback complete for this trace'),
  ).toBeVisible({ timeout: 15000 });

  // Previous Q&A pairs should be visible
  await expect(participantPage.getByText('Persistence test question 1?')).toBeVisible();
  await expect(participantPage.getByText('Persistence test answer 1.')).toBeVisible();
  await expect(participantPage.getByText('Persistence test question 2?')).toBeVisible();
  await expect(participantPage.getByText('Persistence test answer 2.')).toBeVisible();
  await expect(participantPage.getByText('Persistence test question 3?')).toBeVisible();
  await expect(participantPage.getByText('Persistence test answer 3.')).toBeVisible();

  // --- Reload and verify persistence survives ---
  await participantPage.reload();

  await expect(
    participantPage.getByText('Feedback complete for this trace'),
  ).toBeVisible({ timeout: 15000 });

  // Q&A still visible after reload
  await expect(participantPage.getByText('Persistence test question 1?')).toBeVisible();
  await expect(participantPage.getByText('Persistence test answer 1.')).toBeVisible();

  await scenario.cleanup();
});
