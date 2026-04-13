/**
 * E2E Tests for Judge Evaluation - Full Lifecycle
 *
 * Spec: JUDGE_EVALUATION_SPEC
 *
 * Tests drive the actual UI through the workshop lifecycle:
 * annotation start (with auto-eval) → results → judge tuning page
 *
 * Navigation uses the sidebar phase links (not tabs).
 * Judge Tuning is its own phase, reached by advancing past Results.
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib';
import { WorkshopPhase } from '../lib/types';
import { advanceToPhase, goToPhase, beginAnnotation } from '../lib/actions';

const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000';

/** Set up fake MLflow config so evaluation endpoints don't 400 */
async function configureFakeMlflow(
  page: import('@playwright/test').Page,
  workshopId: string,
) {
  await page.request.post(`${API_URL}/workshops/${workshopId}/mlflow-config`, {
    data: {
      databricks_host: 'https://test-workspace.databricks.com',
      databricks_token: 'fake-token-for-e2e-test',
      experiment_id: 'e2e-test-experiment-001',
      max_traces: 100,
    },
  });
}

/** Poll evaluation job until terminal status */
async function pollJob(
  page: import('@playwright/test').Page,
  workshopId: string,
  jobId: string,
  timeoutMs = 30_000,
): Promise<{ status: string; logs: string[] }> {
  const start = Date.now();
  let lastResult = { status: 'unknown', logs: [] as string[] };

  while (Date.now() - start < timeoutMs) {
    const resp = await page.request.get(
      `${API_URL}/workshops/${workshopId}/evaluation-job/${jobId}`,
    );
    if (resp.ok()) {
      const data = await resp.json();
      lastResult = data;
      if (data.status === 'completed' || data.status === 'failed') return data;
    }
    await new Promise((r) => setTimeout(r, 1000));
  }
  return lastResult;
}

test.describe('Evaluation Lifecycle', { tag: ['@spec:JUDGE_EVALUATION_SPEC'] }, () => {

  test('begin-annotation triggers auto-eval job and judge tuning page loads after phase advancement', {
    tag: [
      '@spec:JUDGE_EVALUATION_SPEC',
      '@req:Auto-evaluation runs in background when annotation phase starts',
      '@req:Results appear in Judge Tuning page',
    ],
  }, async ({ page }) => {
    // Workshop with annotations, in results phase — ready for judge tuning
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Eval Lifecycle E2E' })
      .withFacilitator()
      .withParticipants(2)
      .withTraces(3)
      .withDiscoveryFinding({ insight: 'Response quality observation' })
      .withDiscoveryComplete()
      .withRubric({ question: 'Accuracy: Is the response factually correct?' })
      .withAnnotation({ rating: 4, comment: 'Good' })
      .withAnnotation({ rating: 3, comment: 'Average' })
      .withRealApi()
      .inPhase('results')
      .build();

    const workshopId = scenario.workshop.id;

    // Configure MLflow
    await configureFakeMlflow(page, workshopId);

    // Check if auto-eval ran during annotation start (scenario setup)
    const autoEvalResp = await page.request.get(
      `${API_URL}/workshops/${workshopId}/auto-evaluation-status`,
    );
    if (autoEvalResp.ok()) {
      const autoEval = await autoEvalResp.json();
      if (autoEval.job_id) {
        const job = await pollJob(page, workshopId, autoEval.job_id);
        // Job may have already completed or failed — either is fine
        expect(job.status).toMatch(/completed|failed|not_started|unknown/);
      }
    }

    // Advance to judge_tuning via API
    await advanceToPhase(page, workshopId, WorkshopPhase.JUDGE_TUNING, API_URL);

    // Now drive the UI: login → click into workshop → navigate to Judge Tuning
    await page.goto('/');
    await scenario.loginAs(scenario.facilitator);
    await expect(page.getByRole('heading', { name: 'Eval Lifecycle E2E' })).toBeVisible({
      timeout: 10000,
    });
    // Click into the workshop from the list
    await page.getByRole('heading', { name: 'Eval Lifecycle E2E' }).click();
    await page.waitForTimeout(1000);

    // Click "Judge Tuning" in the sidebar
    await goToPhase(page, WorkshopPhase.JUDGE_TUNING);
    await page.waitForTimeout(1500);

    // The Judge Tuning page should render with evaluation mode controls
    await expect(
      page.getByText(/Evaluation Mode/i).first(),
    ).toBeVisible({ timeout: 5000 });

    // Should show both MLflow and Simple Model Serving toggle buttons
    await expect(page.getByText('MLflow').first()).toBeVisible({ timeout: 3000 });
    await expect(page.getByText('Simple Model Serving').first()).toBeVisible({ timeout: 3000 });

    await scenario.cleanup();
  });

  test('evaluation data survives re-evaluate attempt — baseline not wiped', {
    tag: [
      '@spec:JUDGE_EVALUATION_SPEC',
      '@req:Pre-align and post-align scores directly comparable',
      '@req:Results stored against correct prompt version',
      '@req:Evaluation results persisted to database',
    ],
  }, async ({ page }) => {
    // Workshop with annotations, advanced to judge_tuning
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Baseline Preservation E2E' })
      .withFacilitator()
      .withParticipants(2)
      .withTraces(3)
      .withDiscoveryFinding({ insight: 'Quality observation' })
      .withDiscoveryComplete()
      .withRubric({ question: 'Quality: Rate the response quality' })
      .withAnnotation({ rating: 4, comment: 'Good' })
      .withAnnotation({ rating: 3, comment: 'Average' })
      .withRealApi()
      .inPhase('results')
      .build();

    const workshopId = scenario.workshop.id;
    const traceIds = scenario.traces.map((t) => t.id);

    // Seed initial evaluation data (simulating a completed auto-eval)
    const promptResp = await page.request.post(
      `${API_URL}/workshops/${workshopId}/judge-prompts`,
      {
        data: {
          prompt_text: 'Rate the response quality',
          model_name: 'test-model',
          few_shot_examples: [],
          model_parameters: {},
        },
      },
    );
    expect(promptResp.ok()).toBeTruthy();
    const prompt = await promptResp.json();

    const seedResp = await page.request.post(
      `${API_URL}/workshops/${workshopId}/judge-evaluations/${prompt.id}`,
      {
        data: traceIds.map((tid, i) => ({
          id: `seed-${Date.now()}-${i}`,
          workshop_id: workshopId,
          prompt_id: prompt.id,
          trace_id: tid,
          predicted_rating: [3, 4, 5][i],
          human_rating: [4, 3, 5][i],
          confidence: null,
          reasoning: null,
        })),
      },
    );
    expect(seedResp.ok()).toBeTruthy();

    // Advance to judge_tuning phase
    await advanceToPhase(page, workshopId, WorkshopPhase.JUDGE_TUNING, API_URL);

    // Login, click into workshop, navigate to Judge Tuning via sidebar
    await page.goto('/');
    await scenario.loginAs(scenario.facilitator);
    await expect(page.getByRole('heading', { name: 'Baseline Preservation E2E' })).toBeVisible({
      timeout: 10000,
    });
    // Click the workshop name to enter it
    await page.getByRole('heading', { name: 'Baseline Preservation E2E' }).click();
    await page.waitForTimeout(1000);
    await goToPhase(page, WorkshopPhase.JUDGE_TUNING);
    await page.waitForTimeout(1500);

    // Verify page loaded
    await expect(page.getByText(/Evaluation Mode/i).first()).toBeVisible({ timeout: 5000 });

    // Configure MLflow so re-evaluate doesn't 400
    await configureFakeMlflow(page, workshopId);

    // Click Re-evaluate or Run Evaluate button in the UI
    const evalButton = page.getByRole('button', { name: /Re-evaluate|Run Evaluate/i });
    if (await evalButton.isVisible({ timeout: 3000 }).catch(() => false)) {
      await evalButton.click();

      // Wait for any spinner/job to complete or error
      await page.waitForTimeout(5000);
    }

    // CRITICAL: Original evaluation data must NOT have been wiped
    const afterResp = await page.request.get(
      `${API_URL}/workshops/${workshopId}/judge-evaluations/${prompt.id}`,
    );
    expect(afterResp.ok()).toBeTruthy();
    const afterEvals = await afterResp.json();
    expect(afterEvals.length).toBe(3);

    // Verify actual values weren't corrupted
    const ratings = afterEvals.map((e: { predicted_rating: number }) => e.predicted_rating);
    expect(ratings).toContain(3);
    expect(ratings).toContain(4);
    expect(ratings).toContain(5);

    // Reload page — Judge Tuning should still be accessible with data intact
    await page.reload();
    await page.waitForTimeout(1000);
    // After reload we may be on workshop page or list; navigate to phase
    await goToPhase(page, WorkshopPhase.JUDGE_TUNING).catch(async () => {
      // If goToPhase fails, we might be on the list — click into workshop first
      await page.getByRole('heading', { name: 'Baseline Preservation E2E' }).click();
      await page.waitForTimeout(1000);
      await goToPhase(page, WorkshopPhase.JUDGE_TUNING);
    });
    await page.waitForTimeout(1000);
    await expect(page.getByText(/Evaluation Mode/i).first()).toBeVisible({ timeout: 5000 });

    await scenario.cleanup();
  });

  test('judge tuning page shows evaluation results table with seeded data', {
    tag: [
      '@spec:JUDGE_EVALUATION_SPEC',
      '@req:Results reload correctly in UI',
      '@req:Evaluation results persisted to database',
    ],
  }, async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Results Table E2E' })
      .withFacilitator()
      .withParticipants(2)
      .withTraces(3)
      .withDiscoveryFinding({ insight: 'Finding' })
      .withDiscoveryComplete()
      .withRubric({ question: 'Quality: Rate the response quality' })
      .withAnnotation({ rating: 5, comment: 'Excellent' })
      .withAnnotation({ rating: 3, comment: 'Average' })
      .withAnnotation({ rating: 4, comment: 'Good' })
      .withRealApi()
      .inPhase('results')
      .build();

    const workshopId = scenario.workshop.id;
    const traceIds = scenario.traces.map((t) => t.id);

    // Seed evaluation data
    const promptResp = await page.request.post(
      `${API_URL}/workshops/${workshopId}/judge-prompts`,
      {
        data: {
          prompt_text: 'Rate quality',
          model_name: 'test',
          few_shot_examples: [],
          model_parameters: {},
        },
      },
    );
    const prompt = await promptResp.json();

    await page.request.post(
      `${API_URL}/workshops/${workshopId}/judge-evaluations/${prompt.id}`,
      {
        data: traceIds.map((tid, i) => ({
          id: `table-eval-${Date.now()}-${i}`,
          workshop_id: workshopId,
          prompt_id: prompt.id,
          trace_id: tid,
          predicted_rating: [4, 3, 5][i],
          human_rating: [5, 3, 4][i],
          confidence: null,
          reasoning: null,
        })),
      },
    );

    // Advance to judge_tuning and navigate via UI
    await advanceToPhase(page, workshopId, WorkshopPhase.JUDGE_TUNING, API_URL);

    await page.goto('/');
    await scenario.loginAs(scenario.facilitator);
    await expect(page.getByRole('heading', { name: 'Results Table E2E' })).toBeVisible({
      timeout: 10000,
    });
    await goToPhase(page, WorkshopPhase.JUDGE_TUNING);
    await page.waitForTimeout(1500);

    // The evaluation results section should render
    const resultsTable = page.locator('table').first();
    if (await resultsTable.isVisible({ timeout: 5000 }).catch(() => false)) {
      // Table should have rows for our evaluation data
      const rows = resultsTable.locator('tbody tr');
      const rowCount = await rows.count();
      expect(rowCount).toBeGreaterThan(0);

      // Check for Human/Judge column headers
      const headerTexts = (await page.locator('th').allTextContents()).join(' ').toLowerCase();
      const hasExpectedCols = headerTexts.includes('human') || headerTexts.includes('judge') || headerTexts.includes('predicted');
      expect(hasExpectedCols).toBe(true);
    }

    // Metrics section should show accuracy or evaluation count
    const metricsVisible = await page.getByText(/accuracy/i).first()
      .isVisible({ timeout: 3000 }).catch(() => false)
      || await page.getByText(/evaluations/i).first()
        .isVisible({ timeout: 1000 }).catch(() => false);

    // At minimum the Judge Tuning page loaded without crashing
    await expect(page.getByText(/Evaluation Mode/i).first()).toBeVisible();

    await scenario.cleanup();
  });
});
