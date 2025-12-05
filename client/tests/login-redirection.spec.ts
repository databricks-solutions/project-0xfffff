import { test, expect } from '@playwright/test';

test('login redirection works immediately without reload', async ({ page }) => {
  // Valid UUID for WorkshopContext validation
  const VALID_UUID = '12345678-1234-1234-1234-123456789012';

  const TEST_USER = {
    id: 'test-user-123',
    email: 'test@example.com',
    name: 'Test User',
    role: 'participant',
    workshop_id: VALID_UUID,
    status: 'active',
    created_at: new Date().toISOString()
  };

  const TEST_WORKSHOP = {
    id: VALID_UUID,
    name: 'Test Workshop',
    status: 'active',
    completed_phases: [],
    discovery_started: true,
    annotation_started: false
  };

  const isApiCall = (route: any) => {
    const type = route.request().resourceType();
    return type === 'fetch' || type === 'xhr';
  };

  // MOCK ENDPOINTS
  await page.route('**/users/auth/login', async route => {
    if (!isApiCall(route)) return route.fallback();
    await route.fulfill({ json: { user: TEST_USER } });
  });

  await page.route((url) => url.toString().includes(`/users/${TEST_USER.id}`), async route => {
    if (!isApiCall(route)) return route.fallback();
    await route.fulfill({ json: TEST_USER });
  });

  await page.route((url) => url.toString().includes('/permissions'), async route => {
    if (!isApiCall(route)) return route.fallback();
    await route.fulfill({ json: { can_view_discovery: true, can_annotate: true }});
  });

  await page.route((url) => url.toString().includes(`/workshops/${TEST_WORKSHOP.id}`), async route => {
    if (!isApiCall(route)) return route.fallback();
    await route.fulfill({ json: TEST_WORKSHOP });
  });

  await page.route((url) => url.toString().includes(`/rubric`), async route => {
    if (!isApiCall(route)) return route.fallback();
    await route.fulfill({ json: { criteria: [] } });
  });

  // TEST
  await page.goto('http://localhost:3000/');

  // Login
  await expect(page.getByText('Workshop Portal')).toBeVisible();
  await page.fill('input[type="email"]', TEST_USER.email);
  await page.click('button[type="submit"]');

  // Verify redirection happens immediately (no reload needed)
  await expect(page.getByText('Test Workshop')).toBeVisible({ timeout: 5000 });
});

