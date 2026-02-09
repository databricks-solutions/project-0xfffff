import { test, expect } from '@playwright/test';

// This repo doesn't include Node typings in the client TS config; keep `process.env` without adding deps.
declare const process: { env: Record<string, string | undefined> };

const FACILITATOR_EMAIL =
  process.env.E2E_FACILITATOR_EMAIL ?? 'facilitator123@email.com';
const FACILITATOR_PASSWORD =
  process.env.E2E_FACILITATOR_PASSWORD ?? 'facilitator123';
const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000';

test('rubric creation: facilitator can advance from discovery and create a rubric question', {
  tag: ['@spec:RUBRIC_SPEC'],
}, async ({
  page,
  request,
}) => {
  const runId = `${Date.now()}`;

  // Facilitator login + workshop creation
  await page.goto('/');
  await expect(page.getByText('Workshop Portal')).toBeVisible();
  await page.locator('#email').fill(FACILITATOR_EMAIL);
  await page.locator('#password').fill(FACILITATOR_PASSWORD);

  // Wait for workshop options to load, then click "Create New" to create a new workshop
  await page.waitForTimeout(500);
  const createNewButton = page.getByRole('button', { name: /Create New/i });
  if (await createNewButton.isVisible()) {
    await createNewButton.click();
  }

  await page.locator('button[type="submit"]').click();

  await expect(page.getByText(/Welcome, Facilitator/i)).toBeVisible();

  // Fill required Use Case Description before creating
  await page.locator('#description').fill('E2E test workshop for rubric creation');

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

  // Upload a minimal trace (keeps the test stable vs Intake UI)
  const uploadResp = await request.post(
    `${API_URL}/workshops/${workshopId}/traces`,
    {
      headers: { 'Content-Type': 'application/json' },
      data: [
        {
          input: `User question (${runId}): How do I reset my password?`,
          output: `Assistant answer (${runId}): Reset it from Settings > Security. If locked out, use "Forgot password".`,
          context: { source: 'e2e', runId },
        },
      ],
    },
  );
  expect(uploadResp.ok(), 'trace upload should succeed').toBeTruthy();
  const createdTraces = (await uploadResp.json()) as Array<{ id: string }>;
  expect(createdTraces.length, 'should create at least one trace').toBeGreaterThan(
    0,
  );
  const traceId = createdTraces[0]!.id;

  // Begin discovery with just 1 trace
  const beginResp = await request.post(
    `${API_URL}/workshops/${workshopId}/begin-discovery?trace_limit=1`,
  );
  expect(beginResp.ok(), 'begin discovery should succeed').toBeTruthy();

  // Create a participant + submit a discovery finding (rubric phase requires >= 1 finding)
  const participantEmail = `e2e-rubric-participant-${runId}@example.com`;
  const participantName = `E2E Rubric Participant ${runId}`;

  const participantResp = await request.post(`${API_URL}/users/`, {
    headers: { 'Content-Type': 'application/json' },
    data: {
      email: participantEmail,
      name: participantName,
      role: 'participant',
      workshop_id: workshopId,
    },
  });
  expect(participantResp.ok(), 'participant create should succeed').toBeTruthy();
  const participant = (await participantResp.json()) as { id: string };
  expect(participant.id, 'participant id should be present').toMatch(
    /^[a-f0-9-]{36}$/i,
  );

  const findingResp = await request.post(
    `${API_URL}/workshops/${workshopId}/findings`,
    {
      headers: { 'Content-Type': 'application/json' },
      data: {
        trace_id: traceId,
        user_id: participant.id,
        insight:
          `Quality Assessment: Clear and actionable, but could mention account recovery steps.\n\n` +
          `Improvement Analysis: A better response would outline what to do if the user is locked out.`,
      },
    },
  );
  expect(findingResp.ok(), 'finding submit should succeed').toBeTruthy();

  const advanceRubricResp = await request.post(
    `${API_URL}/workshops/${workshopId}/advance-to-rubric`,
  );
  expect(
    advanceRubricResp.ok(),
    'advance to rubric should succeed (requires at least 1 finding)',
  ).toBeTruthy();

  // Reload app at workshop URL to pick up the new phase
  // Navigate directly to the workshop using a different pattern that bypasses the dashboard
  await page.goto(`/?workshop=${workshopId}`);

  // Wait for the page to load - could be dashboard or workshop view
  await page.waitForTimeout(500);

  // If we're on the facilitator dashboard (Welcome, Facilitator!), click into the specific workshop
  const welcomeHeading = page.getByRole('heading', { name: /Welcome, Facilitator/i });
  if (await welcomeHeading.isVisible({ timeout: 3000 })) {
    // The workshop card should have this workshop's ID somewhere in its data or we find by Rubric Creation phase
    // Look for a card with "Rubric Creation" status since we just advanced to rubric
    const rubricWorkshopCard = page.locator('div.cursor-pointer').filter({ hasText: /Rubric Creation/ }).first();
    await rubricWorkshopCard.click();
    // Wait for navigation to the workshop
    await page.waitForURL(/\?workshop=/);
  }

  // Create rubric question via UI
  await expect(page.getByRole('tab', { name: /Rubric Questions/i })).toBeVisible({ timeout: 15000 });
  await page.getByRole('tab', { name: /Rubric Questions/i }).click();

  // The page can render *both* buttons ("Add Criterion" in header + "Create First Criterion" empty state),
  // so avoid strict-mode click by selecting deterministically.
  const createFirstCriterion = page.getByRole('button', {
    name: /Create First Criterion/i,
  });
  if (await createFirstCriterion.isVisible()) {
    await createFirstCriterion.click();
  } else {
    await page.getByRole('button', { name: /Add Criterion/i }).first().click();
  }

  const title = `Response Helpfulness ${runId}`;
  const description = `How helpful is the response in resolving the user's issue? (${runId})`;

  await page.locator('#new-title').fill(title);
  await page.locator('#new-definition').fill(description);

  await Promise.all([
    page.waitForResponse(
      (resp) =>
        (resp.request().method() === 'POST' || resp.request().method() === 'PUT') &&
        resp.url().includes(`/workshops/${workshopId}/rubric`) &&
        resp.status() >= 200 &&
        resp.status() < 300,
    ),
    page.getByRole('button', { name: /Add Criterion/i }).click(),
  ]);

  // Assert UI shows evaluation summary (rubric was created)
  await expect(page.getByText(/Evaluation Summary/i)).toBeVisible();

  // Question title should be visible as text in the question card
  await expect(page.getByText(title)).toBeVisible();

  // Description (definition) should be visible as text in the question card
  await expect(page.getByText(description)).toBeVisible();

  // Assert rubric persisted via API
  await expect
    .poll(async () => {
      const rubricResp = await request.get(
        `${API_URL}/workshops/${workshopId}/rubric`,
      );
      if (!rubricResp.ok()) return null;
      const rubric = (await rubricResp.json()) as { question: string };
      return rubric.question;
    })
    .toContain(title);
});


