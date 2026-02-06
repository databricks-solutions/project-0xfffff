/**
 * E2E Tests for Rubric Persistence
 *
 * Spec: RUBRIC_SPEC (Mixed rubric persistence, lines 297-300)
 *
 * Tests that rubric data with mixed question types persists correctly.
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib';

const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000';

test.describe('Rubric Persistence', () => {
  test('mixed rubric with binary and likert questions persists after reload', {
    tag: ['@spec:RUBRIC_SPEC'],
  }, async ({ page, request }) => {
    // Spec: RUBRIC_SPEC lines 297-300
    // "Mixed rubrics support different scales per question"
    // "Per-question judge_type parsed from [JUDGE_TYPE:xxx] format"
    const runId = `${Date.now()}`;

    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: `Mixed Persistence Test ${runId}` })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .withDiscoveryFinding({ insight: 'Test finding for rubric' })
      .withDiscoveryComplete()
      .withRealApi()
      .inPhase('rubric')
      .build();

    const workshopId = scenario.workshop.id;
    const facilitatorId = scenario.facilitator.id;

    // Create a mixed rubric with binary AND likert questions using the question separator
    const mixedRubricQuestion = [
      'Factual Accuracy [JUDGE_TYPE:binary]\nIs the response factually correct?',
      'Helpfulness [JUDGE_TYPE:likert]\nRate how helpful the response is on a scale of 1-5',
    ].join('\n|||QUESTION_SEPARATOR|||\n');

    const rubricResponse = await request.post(`${API_URL}/workshops/${workshopId}/rubric`, {
      data: {
        question: mixedRubricQuestion,
        created_by: facilitatorId,
        judge_type: 'likert', // Default at rubric level
      },
    });

    expect(rubricResponse.ok()).toBeTruthy();

    // Fetch the rubric back to verify persistence
    const getRubricResponse = await request.get(`${API_URL}/workshops/${workshopId}/rubric`);
    expect(getRubricResponse.ok()).toBeTruthy();

    const rubric = await getRubricResponse.json() as {
      question: string;
      parsed_questions?: Array<{
        title: string;
        description: string;
        judge_type?: string;
      }>;
    };

    // Verify the raw question text is preserved
    expect(rubric.question).toContain('Factual Accuracy');
    expect(rubric.question).toContain('Helpfulness');

    // If parsed_questions is returned, verify per-question judge types
    if (rubric.parsed_questions && rubric.parsed_questions.length > 0) {
      expect(rubric.parsed_questions.length).toBe(2);

      // First question should be binary
      const q1 = rubric.parsed_questions[0];
      expect(q1.title).toContain('Factual Accuracy');
      expect(q1.judge_type).toBe('binary');

      // Second question should be likert
      const q2 = rubric.parsed_questions[1];
      expect(q2.title).toContain('Helpfulness');
      expect(q2.judge_type).toBe('likert');
    }

    // Reload the page and verify rubric still shows correctly
    await page.goto('/');
    await scenario.loginAs(scenario.facilitator);

    await expect(page.getByRole('heading', { name: new RegExp(`Mixed Persistence Test ${runId.slice(0, 8)}`) })).toBeVisible({
      timeout: 10000,
    });

    // Fetch rubric again after reload to verify persistence
    const reloadRubricResponse = await request.get(`${API_URL}/workshops/${workshopId}/rubric`);
    expect(reloadRubricResponse.ok()).toBeTruthy();

    const reloadedRubric = await reloadRubricResponse.json() as {
      question: string;
    };

    // Verify data is still intact after reload
    expect(reloadedRubric.question).toContain('Factual Accuracy');
    expect(reloadedRubric.question).toContain('Helpfulness');
    expect(reloadedRubric.question).toContain('|||QUESTION_SEPARATOR|||');

    await scenario.cleanup();
  });
});
