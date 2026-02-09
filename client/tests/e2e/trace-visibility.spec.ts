/**
 * E2E tests for trace visibility across rounds and sessions.
 *
 * Verifies that participants see traces in user-specific order,
 * trace sets update after adding new traces, and trace order
 * is deterministic (persistent across reloads).
 *
 * @spec DISCOVERY_TRACE_ASSIGNMENT_SPEC
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib';

// Declare process for env var access
declare const process: { env: Record<string, string | undefined> };

const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000';

test.describe('Trace Visibility', {
  tag: ['@spec:DISCOVERY_TRACE_ASSIGNMENT_SPEC'],
}, () => {
  test('participant sees current traces via API', async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Current Round Traces' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(5)
      .inPhase('discovery')
      .withRealApi()
      .build();

    const workshopId = scenario.workshop.id;
    const participant = scenario.users.participant[0];

    // Verify participant can see traces via the traces endpoint
    const tracesResp = await page.request.get(
      `${API_URL}/workshops/${workshopId}/traces?user_id=${participant.id}`
    );
    expect(tracesResp.ok()).toBeTruthy();

    const visibleTraces = (await tracesResp.json()) as Array<{ id: string }>;
    // Should see traces (number depends on phase configuration)
    expect(visibleTraces.length).toBeGreaterThan(0);

    await scenario.cleanup();
  });

  test('adding new traces updates trace set', async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Trace Set Update' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(3)
      .inPhase('discovery')
      .withRealApi()
      .build();

    const workshopId = scenario.workshop.id;

    // Get initial trace count
    const r1Resp = await page.request.get(
      `${API_URL}/workshops/${workshopId}/all-traces`
    );
    expect(r1Resp.ok()).toBeTruthy();
    const r1Traces = (await r1Resp.json()) as Array<{ id: string }>;
    const initialCount = r1Traces.length;
    expect(initialCount).toBe(3);

    // Upload additional traces
    const newTracesResp = await page.request.post(
      `${API_URL}/workshops/${workshopId}/traces`,
      {
        headers: { 'Content-Type': 'application/json' },
        data: [
          { input: 'New question 1', output: 'New answer 1' },
          { input: 'New question 2', output: 'New answer 2' },
        ],
      }
    );
    expect(newTracesResp.ok()).toBeTruthy();

    // Verify trace count increased
    const r2Resp = await page.request.get(
      `${API_URL}/workshops/${workshopId}/all-traces`
    );
    expect(r2Resp.ok()).toBeTruthy();
    const r2Traces = (await r2Resp.json()) as Array<{ id: string }>;
    expect(r2Traces.length).toBe(initialCount + 2);

    await scenario.cleanup();
  });

  test('trace order deterministic across requests', async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Persistent Order Test' })
      .withFacilitator()
      .withSMEs(1)
      .withTraces(8)
      .withRubric({ question: 'Rate this response' })
      .inPhase('annotation')
      .withRealApi()
      .build();

    const workshopId = scenario.workshop.id;
    const sme = scenario.users.sme[0];

    // Fetch trace order first time
    const resp1 = await page.request.get(
      `${API_URL}/workshops/${workshopId}/traces?user_id=${sme.id}`
    );
    expect(resp1.ok()).toBeTruthy();
    const order1 = ((await resp1.json()) as Array<{ id: string }>).map(
      (t) => t.id
    );

    // Fetch again - should be identical (deterministic)
    const resp2 = await page.request.get(
      `${API_URL}/workshops/${workshopId}/traces?user_id=${sme.id}`
    );
    expect(resp2.ok()).toBeTruthy();
    const order2 = ((await resp2.json()) as Array<{ id: string }>).map(
      (t) => t.id
    );

    // Order should be identical across requests
    expect(order1).toEqual(order2);

    await scenario.cleanup();
  });
});
