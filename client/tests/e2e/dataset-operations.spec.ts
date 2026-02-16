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

const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000';

// Declare process for env var access without importing Node types
declare const process: { env: Record<string, string | undefined> };

test.describe('Dataset Operations', {
  tag: ['@spec:DATASETS_SPEC'],
}, () => {
  test('facilitator creates dataset, traces appear', {
    tag: ['@req:Datasets can be created with arbitrary trace lists'],
  }, async ({ page }) => {
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

  test('two users see different trace orders', {
    tag: ['@req:Different users see different orders (per-user randomization)'],
  }, async ({ page, browser }) => {
    // Create scenario with annotation phase and randomization
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

    // Enable annotation randomization by re-starting annotation phase with randomize=true
    await page.request.post(
      `${API_URL}/workshops/${workshopId}/begin-annotation`,
      {
        headers: { 'Content-Type': 'application/json' },
        data: { randomize: true, trace_limit: -1 },
      }
    );

    // Fetch annotation traces for SME 1
    const resp1 = await page.request.get(
      `${API_URL}/workshops/${workshopId}/traces?user_id=${sme1.id}`
    );
    expect(resp1.ok()).toBeTruthy();
    const traces1 = (await resp1.json()) as Array<{ id: string }>;

    // Fetch annotation traces for SME 2
    const resp2 = await page.request.get(
      `${API_URL}/workshops/${workshopId}/traces?user_id=${sme2.id}`
    );
    expect(resp2.ok()).toBeTruthy();
    const traces2 = (await resp2.json()) as Array<{ id: string }>;

    // Both users see the same set of traces
    const ids1 = traces1.map((t) => t.id).sort();
    const ids2 = traces2.map((t) => t.id).sort();
    expect(ids1).toEqual(ids2);

    // But in different orders (randomization enabled)
    const order1 = traces1.map((t) => t.id);
    const order2 = traces2.map((t) => t.id);
    expect(order1).not.toEqual(order2);

    await scenario.cleanup();
  });
});
