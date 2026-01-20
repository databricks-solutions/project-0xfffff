import { test, expect } from '@playwright/test';

const FACILITATOR_EMAIL = process.env.E2E_FACILITATOR_EMAIL ?? 'facilitator123@email.com';
const FACILITATOR_PASSWORD = process.env.E2E_FACILITATOR_PASSWORD ?? 'facilitator123';
const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000';

test('facilitator can log in and create a workshop', {
  tag: ['@spec:AUTHENTICATION_SPEC', '@spec:DISCOVERY_TRACE_ASSIGNMENT_SPEC'],
}, async ({ page, request }) => {
  await page.goto('/');

  // Login (real backend auth via YAML facilitator in config/auth.yaml)
  await expect(page.getByText('Workshop Portal')).toBeVisible();
  await page.locator('#email').fill(FACILITATOR_EMAIL);
  await page.locator('#password').fill(FACILITATOR_PASSWORD);
  await page.locator('button[type="submit"]').click();

  // Facilitator should land on workshop creation when no workshop is selected
  await expect(page.getByText(/Welcome, Facilitator!/i)).toBeVisible();

  // Create workshop (real POST /workshops through Vite proxy)
  await Promise.all([
    page.waitForResponse((resp) => resp.request().method() === 'POST' && resp.url().includes('/workshops') && resp.status() === 201),
    page.getByRole('button', { name: /Start Workshop Now/i }).click(),
  ]);

  await expect(page).toHaveURL(/\?workshop=[a-f0-9-]{36}/i);
  const workshopId = new URL(page.url()).searchParams.get('workshop');
  expect(workshopId, 'workshop id should be present in URL').toMatch(/^[a-f0-9-]{36}$/i);

  // Sanity-check the backend state via API (bypasses browser CORS)
  const workshopResp = await request.get(`${API_URL}/workshops/${workshopId}`);
  expect(workshopResp.ok(), 'created workshop should be retrievable from API').toBeTruthy();
});

