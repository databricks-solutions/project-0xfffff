/**
 * E2E Tests for Judge Evaluation — Full Pipeline
 *
 * Spec: JUDGE_EVALUATION_SPEC
 *
 * Uses the /evaluate-judge endpoint with model_name="demo" which runs
 * the full evaluation pipeline (read annotations → simulate judge ratings
 * → compute metrics → store evaluations) without needing MLflow or
 * Databricks model serving.
 *
 * Tests drive the actual UI through phase transitions and verify
 * evaluation results render correctly in the Judge Tuning page.
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib';
import { WorkshopPhase } from '../lib/types';
import { advanceToPhase, goToPhase } from '../lib/actions';

const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000';

test.describe('Judge Evaluation Pipeline', { tag: ['@spec:JUDGE_EVALUATION_SPEC'] }, () => {

  test('full evaluation cycle: annotations → demo evaluate → results table renders', {
    tag: [
      '@spec:JUDGE_EVALUATION_SPEC',
      '@req:Evaluation results persisted to database',
      '@req:Results reload correctly in UI',
      '@req:Results appear in Judge Tuning page',
    ],
  }, async ({ page }) => {
    // Build workshop with multiple annotations across traces
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Full Eval Pipeline E2E' })
      .withFacilitator()
      .withParticipants(2)
      .withTraces(3)
      .withDiscoveryFinding({ insight: 'Quality observation' })
      .withDiscoveryComplete()
      .withRubric({ question: 'Quality: Rate the response quality' })
      .withAnnotation({ rating: 5, comment: 'Excellent' })
      .withAnnotation({ rating: 3, comment: 'Average' })
      .withAnnotation({ rating: 4, comment: 'Good' })
      .withRealApi()
      .inPhase('results')
      .build();

    const workshopId = scenario.workshop.id;

    // Create a judge prompt with model_name="demo" (triggers simulation, no external services)
    const promptResp = await page.request.post(
      `${API_URL}/workshops/${workshopId}/judge-prompts`,
      {
        data: {
          prompt_text: 'Rate the overall quality of the response on a scale of 1-5.',
          model_name: 'demo',
          few_shot_examples: [],
          model_parameters: {},
        },
      },
    );
    expect(promptResp.ok()).toBeTruthy();
    const prompt = await promptResp.json();

    // Run evaluation using the demo model — this is the REAL evaluation pipeline:
    // reads all annotations, simulates judge ratings with realistic correlation,
    // computes accuracy/kappa/confusion matrix, stores results in DB
    const evalResp = await page.request.post(
      `${API_URL}/workshops/${workshopId}/evaluate-judge`,
      {
        data: {
          prompt_id: prompt.id,
          trace_ids: null, // evaluate all traces
        },
      },
    );
    expect(evalResp.ok(), `Evaluate failed: ${await evalResp.text()}`).toBeTruthy();
    const metrics = await evalResp.json();

    // The evaluation should have produced real metrics
    expect(metrics.total_evaluations).toBeGreaterThan(0);
    expect(metrics.accuracy).toBeGreaterThanOrEqual(0);
    expect(metrics.accuracy).toBeLessThanOrEqual(1);
    expect(metrics.confusion_matrix).toBeTruthy();

    // Verify evaluations were actually stored in the database
    const storedResp = await page.request.get(
      `${API_URL}/workshops/${workshopId}/judge-evaluations/${prompt.id}`,
    );
    expect(storedResp.ok()).toBeTruthy();
    const storedEvals = await storedResp.json();
    expect(storedEvals.length).toBe(metrics.total_evaluations);

    // Each stored evaluation should have both human and predicted ratings
    for (const eval_ of storedEvals) {
      expect(eval_.predicted_rating).not.toBeNull();
      expect(eval_.human_rating).not.toBeNull();
    }

    // Now navigate to the Judge Tuning page through the UI and verify results render
    await advanceToPhase(page, workshopId, WorkshopPhase.JUDGE_TUNING, API_URL);

    await page.goto('/');
    await scenario.loginAs(scenario.facilitator);
    await expect(page.getByRole('heading', { name: 'Full Eval Pipeline E2E' })).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole('heading', { name: 'Full Eval Pipeline E2E' }).click();
    await page.waitForTimeout(1000);
    await goToPhase(page, WorkshopPhase.JUDGE_TUNING);
    await page.waitForTimeout(2000);

    // The evaluation results table should render with actual data
    const resultsTable = page.locator('table').first();
    await expect(resultsTable).toBeVisible({ timeout: 5000 });

    // Table should have rows matching our evaluation count
    const rows = resultsTable.locator('tbody tr');
    const rowCount = await rows.count();
    expect(rowCount).toBeGreaterThan(0);

    // Verify column headers include Human and Judge/Predicted
    const headerTexts = (await page.locator('th').allTextContents()).join(' ').toLowerCase();
    expect(headerTexts).toMatch(/human/);
    expect(headerTexts).toMatch(/judge|predicted/);

    await scenario.cleanup();
  });

  test('re-evaluate preserves original evaluation results in database', {
    tag: [
      '@spec:JUDGE_EVALUATION_SPEC',
      '@req:Pre-align and post-align scores directly comparable',
      '@req:Results stored against correct prompt version',
    ],
  }, async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Re-eval Baseline E2E' })
      .withFacilitator()
      .withParticipants(2)
      .withTraces(3)
      .withDiscoveryFinding({ insight: 'Observation' })
      .withDiscoveryComplete()
      .withRubric({ question: 'Accuracy: Is the response accurate?' })
      .withAnnotation({ rating: 4, comment: 'Good' })
      .withAnnotation({ rating: 2, comment: 'Poor' })
      .withAnnotation({ rating: 5, comment: 'Excellent' })
      .withRealApi()
      .inPhase('results')
      .build();

    const workshopId = scenario.workshop.id;

    // Step 1: Run initial evaluation with demo model
    const promptResp = await page.request.post(
      `${API_URL}/workshops/${workshopId}/judge-prompts`,
      {
        data: {
          prompt_text: 'Rate accuracy 1-5',
          model_name: 'demo',
          few_shot_examples: [],
          model_parameters: {},
        },
      },
    );
    const prompt = await promptResp.json();

    const evalResp = await page.request.post(
      `${API_URL}/workshops/${workshopId}/evaluate-judge`,
      { data: { prompt_id: prompt.id } },
    );
    expect(evalResp.ok()).toBeTruthy();

    // Record v1 evaluation results
    const v1Resp = await page.request.get(
      `${API_URL}/workshops/${workshopId}/judge-evaluations/${prompt.id}`,
    );
    const v1Evals = await v1Resp.json();
    expect(v1Evals.length).toBeGreaterThan(0);
    const v1Ratings = v1Evals.map((e: { predicted_rating: number }) => e.predicted_rating);

    // Step 2: Navigate to Judge Tuning and click Re-evaluate through the UI
    await advanceToPhase(page, workshopId, WorkshopPhase.JUDGE_TUNING, API_URL);

    await page.goto('/');
    await scenario.loginAs(scenario.facilitator);
    await expect(page.getByRole('heading', { name: 'Re-eval Baseline E2E' })).toBeVisible({
      timeout: 10000,
    });
    await page.getByRole('heading', { name: 'Re-eval Baseline E2E' }).click();
    await page.waitForTimeout(1000);
    await goToPhase(page, WorkshopPhase.JUDGE_TUNING);
    await page.waitForTimeout(1500);

    // Try clicking Re-evaluate or Run Evaluate in the UI
    const evalButton = page.getByRole('button', { name: /Re-evaluate|Run Evaluate/i });
    if (await evalButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await evalButton.click();
      // Wait for evaluation to complete or fail
      await page.waitForTimeout(5000);
    }

    // Step 3: CRITICAL — v1 evaluations must still exist with original ratings
    const v1After = await page.request.get(
      `${API_URL}/workshops/${workshopId}/judge-evaluations/${prompt.id}`,
    );
    const v1AfterEvals = await v1After.json();
    expect(v1AfterEvals.length).toBe(v1Evals.length);

    // Verify the actual rating values weren't corrupted
    const v1AfterRatings = v1AfterEvals.map(
      (e: { predicted_rating: number }) => e.predicted_rating,
    );
    for (const rating of v1Ratings) {
      expect(v1AfterRatings).toContain(rating);
    }

    await scenario.cleanup();
  });

  test('second demo evaluation replaces first on same prompt (initial eval behavior)', {
    tag: [
      '@spec:JUDGE_EVALUATION_SPEC',
      '@req:Evaluation results persisted to database',
    ],
  }, async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Eval Replace E2E' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .withDiscoveryFinding({ insight: 'Finding' })
      .withDiscoveryComplete()
      .withRubric({ question: 'Quality: Rate quality' })
      .withAnnotation({ rating: 4, comment: 'Good' })
      .withAnnotation({ rating: 3, comment: 'OK' })
      .withRealApi()
      .inPhase('results')
      .build();

    const workshopId = scenario.workshop.id;

    // Create prompt
    const promptResp = await page.request.post(
      `${API_URL}/workshops/${workshopId}/judge-prompts`,
      {
        data: {
          prompt_text: 'Rate quality',
          model_name: 'demo',
          few_shot_examples: [],
          model_parameters: {},
        },
      },
    );
    const prompt = await promptResp.json();

    // Run evaluation twice on same prompt
    await page.request.post(
      `${API_URL}/workshops/${workshopId}/evaluate-judge`,
      { data: { prompt_id: prompt.id } },
    );
    const run1Resp = await page.request.get(
      `${API_URL}/workshops/${workshopId}/judge-evaluations/${prompt.id}`,
    );
    const run1Count = (await run1Resp.json()).length;

    await page.request.post(
      `${API_URL}/workshops/${workshopId}/evaluate-judge`,
      { data: { prompt_id: prompt.id } },
    );
    const run2Resp = await page.request.get(
      `${API_URL}/workshops/${workshopId}/judge-evaluations/${prompt.id}`,
    );
    const run2Count = (await run2Resp.json()).length;

    // Same count — second run replaced first, didn't accumulate
    expect(run2Count).toBe(run1Count);

    await scenario.cleanup();
  });
});
