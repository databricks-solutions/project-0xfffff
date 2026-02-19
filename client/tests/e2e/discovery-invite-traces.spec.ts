import { test, expect } from '@playwright/test';
import { loginAs, loginAsFacilitator } from '../lib/actions/auth';
import { UserRole } from '../lib/types';

// This repo doesn't include Node typings in the client TS config; keep `process.env` without adding deps.
declare const process: { env: Record<string, string | undefined> };

const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000';

test('discovery blocks until multiple participants complete; facilitator-driven phase with trace-based discovery', {
  tag: ['@spec:DISCOVERY_TRACE_ASSIGNMENT_SPEC'],
}, async ({
  page,
  browser,
  request,
}) => {
  const runId = `${Date.now()}`;
  const participantAEmail = `e2e-participant-a-${runId}@example.com`;
  const participantAName = `E2E Participant A ${runId}`;
  const participantBEmail = `e2e-participant-b-${runId}@example.com`;
  const participantBName = `E2E Participant B ${runId}`;

  // Facilitator login + workshop creation
  await loginAsFacilitator(page);

  // Fill required Use Case Description before creating
  await page.locator('#description').fill('E2E test workshop for discovery trace assignment');

  await Promise.all([
    page.waitForResponse(
      (resp) =>
        resp.request().method() === 'POST' &&
        resp.url().includes('/workshops') &&
        resp.status() === 201,
    ),
    page.getByRole('button', { name: /Create Workshop/i }).click(),
  ]);

  await expect(page).toHaveURL(/\?workshop=[a-f0-9-]{36}/i);
  const workshopId = new URL(page.url()).searchParams.get('workshop');
  expect(workshopId, 'workshop id should be present in URL').toMatch(
    /^[a-f0-9-]{36}$/i,
  );

  // Upload minimal traces directly via API (keeps the test stable vs Intake UI)
  const uploadResp = await request.post(`${API_URL}/workshops/${workshopId}/traces`, {
    headers: { 'Content-Type': 'application/json' },
    data: [
      {
        input: `User question (${runId}): How do I reset my password?`,
        output: `Assistant answer (${runId}): You can reset it from Settings > Security. If you are locked out, use the "Forgot password" link.`,
        context: { source: 'e2e', runId },
      },
    ],
  });
  expect(uploadResp.ok(), 'trace upload should succeed').toBeTruthy();

  // Start discovery with just 1 trace to keep UI interactions short
  const beginResp = await request.post(
    `${API_URL}/workshops/${workshopId}/begin-discovery?trace_limit=1`,
  );
  expect(beginResp.ok(), 'begin discovery should succeed').toBeTruthy();

  // Add two participants through the UI
  await page.getByRole('button', { name: /Invite Participants/i }).click();
  await expect(page.getByText(/Add New User/i)).toBeVisible();

  await page.locator('#email').fill(participantAEmail);
  await page.locator('#name').fill(participantAName);
  await page.getByRole('button', { name: /^Add User$/i }).click();
  await expect(page.getByRole('cell', { name: participantAEmail, exact: true })).toBeVisible();

  await page.locator('#email').fill(participantBEmail);
  await page.locator('#name').fill(participantBName);
  await page.getByRole('button', { name: /^Add User$/i }).click();
  await expect(page.getByRole('cell', { name: participantBEmail, exact: true })).toBeVisible();

  // Resolve participant IDs via API (needed for completion status checks)
  let users: Array<{ id: string; email: string }> = [];
  await expect
    .poll(async () => {
      const usersResp = await request.get(
        `${API_URL}/users/?workshop_id=${workshopId}&role=participant`,
      );
      if (!usersResp.ok()) return 0;
      users = (await usersResp.json()) as Array<{ id: string; email: string }>;
      const a = users.some((u) => u.email === participantAEmail);
      const b = users.some((u) => u.email === participantBEmail);
      return a && b ? 2 : 0;
    })
    .toBe(2);

  const participantA = users.find((u) => u.email === participantAEmail);
  const participantB = users.find((u) => u.email === participantBEmail);
  expect(participantA, 'participant A should exist in API').toBeTruthy();
  expect(participantB, 'participant B should exist in API').toBeTruthy();

  const submitAndCompleteDiscovery = async (email: string, userId: string) => {
    const ctx = await browser.newContext();
    const p = await ctx.newPage();

    // Login as participant using the shared helper
    await loginAs(p, {
      id: userId,
      email,
      name: email.split('@')[0],
      role: UserRole.PARTICIPANT,
      workshop_id: workshopId!,
    });

    await expect(p.getByTestId('discovery-phase-title')).toBeVisible({ timeout: 15000 });

    // Get trace IDs for API submission
    const tracesResp = await p.request.get(`${API_URL}/workshops/${workshopId}/all-traces`);
    const traces = (await tracesResp.json()) as Array<{ id: string }>;
    const traceId = traces[0].id;

    // Submit complete feedback via API (label + comment + 3 Q&A pairs)
    await p.request.post(`${API_URL}/workshops/${workshopId}/discovery-feedback`, {
      data: {
        trace_id: traceId,
        user_id: userId,
        feedback_label: 'good',
        comment: 'Clear but slightly verbose. Consider account recovery steps for locked-out users.',
      },
    });

    for (let q = 1; q <= 3; q++) {
      await p.request.post(`${API_URL}/workshops/${workshopId}/submit-followup-answer`, {
        data: {
          trace_id: traceId,
          user_id: userId,
          question: `Follow-up question ${q}?`,
          answer: `Follow-up answer ${q}.`,
        },
      });
    }

    // Reload to pick up completed feedback state
    await p.reload();
    await expect(p.getByTestId('discovery-phase-title')).toBeVisible({ timeout: 15000 });

    // Wait for "Complete Discovery" button (appears when all traces have completed feedback)
    await expect(p.getByTestId('complete-discovery-phase-button')).toBeVisible({ timeout: 15000 });
    await p.getByTestId('complete-discovery-phase-button').click();

    await ctx.close();
  };

  // Only participant A completes discovery → status should be 1/2 and not all completed.
  await submitAndCompleteDiscovery(participantAEmail, participantA!.id);

  await expect
    .poll(async () => {
      const statusResp = await request.get(`${API_URL}/workshops/${workshopId}/discovery-completion-status`);
      if (!statusResp.ok()) return null;
      return statusResp.json();
    })
    .toMatchObject({
      total_participants: 2,
      completed_participants: 1,
      all_completed: false,
    });

  await expect
    .poll(async () => {
      const resp = await request.get(`${API_URL}/workshops/${workshopId}/users/${participantA!.id}/discovery-complete`);
      if (!resp.ok()) return false;
      const body = (await resp.json()) as { discovery_complete: boolean };
      return body.discovery_complete;
    })
    .toBeTruthy();

  await expect
    .poll(async () => {
      const resp = await request.get(`${API_URL}/workshops/${workshopId}/users/${participantB!.id}/discovery-complete`);
      if (!resp.ok()) return null;
      const body = (await resp.json()) as { discovery_complete: boolean };
      return body.discovery_complete;
    })
    .toBeFalsy();

  // Participant B completes discovery → status should become 2/2 and all completed.
  await submitAndCompleteDiscovery(participantBEmail, participantB!.id);

  await expect
    .poll(async () => {
      const statusResp = await request.get(`${API_URL}/workshops/${workshopId}/discovery-completion-status`);
      if (!statusResp.ok()) return null;
      return statusResp.json();
    })
    .toMatchObject({
      total_participants: 2,
      completed_participants: 2,
      all_completed: true,
    });

  await expect
    .poll(async () => {
      const resp = await request.get(`${API_URL}/workshops/${workshopId}/users/${participantB!.id}/discovery-complete`);
      if (!resp.ok()) return false;
      const body = (await resp.json()) as { discovery_complete: boolean };
      return body.discovery_complete;
    })
    .toBeTruthy();
});


