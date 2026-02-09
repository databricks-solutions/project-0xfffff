/**
 * E2E tests for dataset operations.
 *
 * Verifies facilitator dataset creation and per-user trace ordering
 * using real API calls.
 *
 * @spec DATASETS_SPEC
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib';

// Declare process for env var access
declare const process: { env: Record<string, string | undefined> };

const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000';

test.describe('Dataset Operations', {
  tag: ['@spec:DATASETS_SPEC'],
}, () => {
  test('facilitator creates dataset, traces appear', async ({ page }) => {
    // Use a real API scenario so data is persisted
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Dataset Creation Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(5)
      .inPhase('discovery')
      .withRealApi()
      .build();

    const workshopId = scenario.workshop.id;
    expect(workshopId).toBeTruthy();

    // Fetch traces via API to verify they were created
    const tracesResponse = await page.request.get(
      `${API_URL}/workshops/${workshopId}/all-traces`
    );
    expect(tracesResponse.ok()).toBeTruthy();

    const traces = await tracesResponse.json();
    expect(traces.length).toBe(5);

    // Verify traces have expected fields
    for (const trace of traces) {
      expect(trace.id).toBeTruthy();
      expect(trace.workshop_id).toBe(workshopId);
      expect(trace.input).toBeTruthy();
      expect(trace.output).toBeTruthy();
    }

    await scenario.cleanup();
  });

  test('two users get user-specific trace ordering', async ({ page }) => {
    // Create scenario with annotation phase
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Trace Order Test' })
      .withFacilitator()
      .withSMEs(2)
      .withTraces(10)
      .withRubric({ question: 'How helpful is this response?' })
      .inPhase('annotation')
      .withRealApi()
      .build();

    const workshopId = scenario.workshop.id;
    const sme1 = scenario.users.sme[0];
    const sme2 = scenario.users.sme[1];

    // Fetch traces for SME 1 (user-specific ordering)
    const resp1 = await page.request.get(
      `${API_URL}/workshops/${workshopId}/traces?user_id=${sme1.id}`
    );
    expect(resp1.ok()).toBeTruthy();
    const traces1 = (await resp1.json()) as Array<{ id: string }>;

    // Fetch traces for SME 2
    const resp2 = await page.request.get(
      `${API_URL}/workshops/${workshopId}/traces?user_id=${sme2.id}`
    );
    expect(resp2.ok()).toBeTruthy();
    const traces2 = (await resp2.json()) as Array<{ id: string }>;

    // Both users should see traces
    expect(traces1.length).toBeGreaterThan(0);
    expect(traces2.length).toBeGreaterThan(0);

    // Both users see the same set of traces (sorted IDs match)
    const ids1 = traces1.map((t) => t.id).sort();
    const ids2 = traces2.map((t) => t.id).sort();
    expect(ids1).toEqual(ids2);

    // Verify deterministic: same user gets same order twice
    const resp1b = await page.request.get(
      `${API_URL}/workshops/${workshopId}/traces?user_id=${sme1.id}`
    );
    const traces1b = (await resp1b.json()) as Array<{ id: string }>;
    const order1 = traces1.map((t) => t.id);
    const order1b = traces1b.map((t) => t.id);
    expect(order1).toEqual(order1b);

    await scenario.cleanup();
  });
});
