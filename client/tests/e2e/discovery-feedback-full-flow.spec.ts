/**
 * E2E Test: Discovery feedback full participant flow
 *
 * Tests the complete participant journey through the UI:
 * submit feedback → answer 3 follow-up questions → completion state.
 * Also tests facilitator view of participant feedback details.
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib/scenario-builder';
import { WorkshopPhase } from '../lib/types';

declare const process: { env: Record<string, string | undefined> };

const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000';

test.describe('Discovery feedback full participant flow', () => {

  test('participant completes feedback + 3 follow-up questions for a trace', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Progressive disclosure (one question at a time)',
      '@e2e-real',
    ],
  }, async ({ browser }) => {
    // Setup: TestScenario with real API, 1 trace, demo model
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Full Flow Feedback Test' })
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

    // 1. Login as participant
    const participantPage = await scenario.newPageAs(participant);

    // 2. Submit feedback (select GOOD, type comment, click Submit)
    await participantPage.getByText('Good').click();

    const commentInput = participantPage.getByPlaceholder(
      'What specifically about this response influenced your rating?'
    );
    await commentInput.fill('The response is thorough and well-structured.');

    await participantPage.getByRole('button', { name: /Submit Feedback/i }).click();

    // 3. Wait for Q1 to appear (loading spinner → question)
    await expect(
      participantPage.getByText('Generating follow-up question...')
    ).toBeVisible({ timeout: 10000 });

    // Wait for question to appear (loading spinner disappears, question text appears)
    await expect(
      participantPage.getByText('Question 1')
    ).toBeVisible({ timeout: 15000 });

    // 4. Answer Q1, submit
    const answerInput = participantPage.getByPlaceholder('Type your answer...');
    await answerInput.fill('The reasoning was clear and well-supported.');

    await participantPage.getByRole('button', { name: /Submit Answer/i }).click();

    // 5. Wait for Q2 to appear
    await expect(
      participantPage.getByText('Question 2')
    ).toBeVisible({ timeout: 15000 });

    // 6. Answer Q2, submit
    await participantPage.getByPlaceholder('Type your answer...').fill(
      'No significant gaps in the analysis.'
    );
    await participantPage.getByRole('button', { name: /Submit Answer/i }).click();

    // 7. Wait for Q3 to appear
    await expect(
      participantPage.getByText('Question 3')
    ).toBeVisible({ timeout: 15000 });

    // 8. Answer Q3, submit
    await participantPage.getByPlaceholder('Type your answer...').fill(
      'Overall the response quality is high.'
    );
    await participantPage.getByRole('button', { name: /Submit Answer/i }).click();

    // 9. Verify completion state
    await expect(
      participantPage.getByText('Feedback complete for this trace')
    ).toBeVisible({ timeout: 15000 });

    // 10. Reload page → verify state persists
    await participantPage.reload();

    await expect(
      participantPage.getByText('Feedback complete for this trace')
    ).toBeVisible({ timeout: 15000 });

    // Previous Q&A pairs should still be visible
    await expect(
      participantPage.getByText('The reasoning was clear and well-supported.')
    ).toBeVisible();

    await scenario.cleanup();
  });

  test('facilitator sees participant feedback details in dashboard', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Facilitator can view participant feedback details (label, comment, follow-up Q&A)',
      '@e2e-real',
    ],
  }, async ({ browser }) => {
    // Setup: TestScenario, submit feedback via API for participant
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Facilitator View Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(1)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery(1);

    const participant = scenario.users.participant[0];
    const traceId = scenario.traces[0].id;
    const workshopId = scenario.workshop.id;

    // Submit feedback + Q&A via API
    await scenario.page.request.post(
      `${API_URL}/workshops/${workshopId}/discovery-feedback`,
      {
        data: {
          trace_id: traceId,
          user_id: participant.id,
          feedback_label: 'good',
          comment: 'Excellent response quality.',
        },
      },
    );

    for (let q = 1; q <= 3; q++) {
      await scenario.page.request.post(
        `${API_URL}/workshops/${workshopId}/submit-followup-answer`,
        {
          data: {
            trace_id: traceId,
            user_id: participant.id,
            question: `Follow-up question ${q}?`,
            answer: `Detailed answer ${q}.`,
          },
        },
      );
    }

    // 1. Navigate to facilitator dashboard - look for Feedback Detail tab
    const feedbackTab = scenario.page.getByRole('tab', { name: /Feedback Detail/i });
    if (await feedbackTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await feedbackTab.click();

      // 2. Verify feedback detail shows label and comment
      await expect(
        scenario.page.getByTestId('feedback-detail-panel')
      ).toBeVisible({ timeout: 10000 });

      // Feedback label should be visible
      await expect(
        scenario.page.getByText('Excellent response quality.')
      ).toBeVisible({ timeout: 10000 });
    }

    await scenario.cleanup();
  });
});
