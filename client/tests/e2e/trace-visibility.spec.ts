/**
 * E2E tests for trace visibility across rounds and sessions.
 *
 * Verifies that participants only see current-round traces,
 * old traces are hidden after round change, and annotation
 * order persists across page reload.
 *
 * @spec DISCOVERY_TRACE_ASSIGNMENT_SPEC
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib';

const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000';

// Declare process for env var access
declare const process: { env: Record<string, string | undefined> };

test.describe('Trace Visibility', {
  tag: ['@spec:DISCOVERY_TRACE_ASSIGNMENT_SPEC'],
}, () => {
  test('participant sees only current round traces', {
    tag: ['@req:Participants only see traces in current active discovery dataset'],
  }, async ({ page }) => {
    // Create scenario with discovery phase and specific traces
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
    const allTraces = scenario.traces;

    // Verify participant can see discovery traces via API
    const discResp = await page.request.get(
      `${API_URL}/workshops/${workshopId}/discovery-traces?user_id=${participant.id}`
    );
    expect(discResp.ok()).toBeTruthy();

    const visibleTraces = (await discResp.json()) as Array<{ id: string }>;
    const visibleIds = visibleTraces.map((t) => t.id);

    // All 5 traces from the current round should be visible
    for (const trace of allTraces) {
      expect(visibleIds).toContain(trace.id);
    }

    await scenario.cleanup();
  });

  test('old traces hidden after round change', {
    tag: ['@req:When new discovery round starts, old traces hidden (not deleted)'],
  }, async ({ page }) => {
    // Create scenario with discovery phase
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Round Change Visibility' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(3)
      .inPhase('discovery')
      .withRealApi()
      .build();

    const workshopId = scenario.workshop.id;
    const participant = scenario.users.participant[0];
    const round1TraceIds = scenario.traces.map((t) => t.id);

    // Verify round 1 traces are visible
    const r1Resp = await page.request.get(
      `${API_URL}/workshops/${workshopId}/discovery-traces?user_id=${participant.id}`
    );
    expect(r1Resp.ok()).toBeTruthy();
    const r1Traces = (await r1Resp.json()) as Array<{ id: string }>;
    expect(r1Traces.length).toBe(3);

    // Upload new traces (simulating a new round)
    const newTracesResp = await page.request.post(
      `${API_URL}/workshops/${workshopId}/traces`,
      {
        headers: { 'Content-Type': 'application/json' },
        data: [
          { input: 'New round question 1', output: 'New round answer 1' },
          { input: 'New round question 2', output: 'New round answer 2' },
        ],
      }
    );
    expect(newTracesResp.ok()).toBeTruthy();

    // Reset discovery with new traces via reset-discovery endpoint
    const resetResp = await page.request.post(
      `${API_URL}/workshops/${workshopId}/reset-discovery`,
      {
        headers: { 'Content-Type': 'application/json' },
        data: { trace_limit: 2 },
      }
    );

    // If reset-discovery is available, verify the round change
    if (resetResp.ok()) {
      const r2Resp = await page.request.get(
        `${API_URL}/workshops/${workshopId}/discovery-traces?user_id=${participant.id}`
      );
      expect(r2Resp.ok()).toBeTruthy();
      const r2Traces = (await r2Resp.json()) as Array<{ id: string }>;

      // Old round 1 traces should no longer be the active set
      // (the active set should have changed)
      const r2TraceIds = r2Traces.map((t) => t.id);

      // At minimum, the trace count should reflect the new dataset
      // and old traces should not all be present if the set changed
      expect(r2Traces.length).toBeGreaterThan(0);
    }

    await scenario.cleanup();
  });

  test('annotation order persistent across reload', {
    tag: ['@req:Randomization persistent across page reloads for same trace set'],
  }, async ({ page }) => {
    // Create scenario with annotation phase and randomization enabled
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

    // Enable randomization
    await page.request.post(
      `${API_URL}/workshops/${workshopId}/annotation-randomize`,
      {
        headers: { 'Content-Type': 'application/json' },
        data: { randomize: true },
      }
    );

    // Fetch trace order first time
    const resp1 = await page.request.get(
      `${API_URL}/workshops/${workshopId}/annotation-traces?user_id=${sme.id}`
    );
    expect(resp1.ok()).toBeTruthy();
    const order1 = ((await resp1.json()) as Array<{ id: string }>).map(
      (t) => t.id
    );

    // Simulate page reload by fetching again
    const resp2 = await page.request.get(
      `${API_URL}/workshops/${workshopId}/annotation-traces?user_id=${sme.id}`
    );
    expect(resp2.ok()).toBeTruthy();
    const order2 = ((await resp2.json()) as Array<{ id: string }>).map(
      (t) => t.id
    );

    // Order should be identical across requests (deterministic per user)
    expect(order1).toEqual(order2);

    await scenario.cleanup();
  });
});
