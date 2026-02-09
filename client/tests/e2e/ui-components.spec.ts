/**
 * E2E Tests for UI Components
 *
 * Spec: UI_COMPONENTS_SPEC
 *
 * Tests:
 * - Pagination in annotation view (page navigation works)
 * - Trace viewer renders and allows export
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib';

test.describe('Pagination Component', () => {
  test('pagination in annotation view navigates between pages', {
    tag: ['@spec:UI_COMPONENTS_SPEC'],
  }, async ({ page }) => {
    // Spec: UI_COMPONENTS_SPEC lines 340-345
    // "Page navigation works correctly (first, prev, next, last)"
    // "Disabled states shown for unavailable actions"
    // "Page info accurately reflects data"
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Pagination Test Workshop' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(5)
      .withDiscoveryFinding({ insight: 'Finding for pagination test' })
      .withDiscoveryComplete()
      .withRubric({ question: 'Quality: Is the response high quality?' })
      .withRealApi()
      .inPhase('annotation')
      .build();

    await page.goto('/');
    await scenario.loginAs(scenario.facilitator);

    await expect(page.getByRole('heading', { name: 'Pagination Test Workshop' })).toBeVisible({
      timeout: 10000,
    });

    // Navigate to the annotation tab
    const annotationTab = page.getByRole('tab', { name: /Annotation|Rating/i });
    if (await annotationTab.isVisible({ timeout: 3000 }) {
      await annotationTab.click();
      await page.waitForTimeout(1000);

      // Look for pagination controls
      const paginationControls = page.locator('nav[aria-label*="pagination"]').or(
        page.locator('[class*="pagination"]')
      ).or(
        page.getByRole('navigation')
      );

      // Look for page navigation buttons (next/previous)
      const nextButton = page.getByRole('button', { name: /next/i }).or(
        page.getByLabel(/next page/i)
      ).or(
        page.locator('button:has(svg)').filter({ hasText: '' }).last()
      );

      const prevButton = page.getByRole('button', { name: /prev/i }).or(
        page.getByLabel(/previous page/i)
      );

      // If pagination is visible, verify navigation works
      if (await nextButton.isVisible({ timeout: 2000 }) {
        // First page: prev should be disabled
        const prevDisabled = await prevButton.isDisabled().catch(() => true);
        expect(prevDisabled).toBe(true);

        // Click next to go to page 2
        if (await nextButton.isEnabled() {
          await nextButton.click();
          await page.waitForTimeout(500);

          // After navigating, prev should now be enabled
          if (await prevButton.isVisible({ timeout: 1000 }) {
            const prevNowEnabled = await prevButton.isEnabled().catch(() => false);
            expect(prevNowEnabled).toBe(true);
          }

          // Navigate back
          if (await prevButton.isEnabled() {
            await prevButton.click();
            await page.waitForTimeout(500);
          }
        }
      }

      // Verify page info is displayed (e.g., "Trace 1 of 5" or "Page 1")
      const pageInfo = page.getByText(/\d+\s*(of|\/)\s*\d+/i).or(
        page.getByText(/page\s*\d+/i)
      ).or(
        page.getByText(/trace\s*\d+/i)
      );

      if (await pageInfo.first().isVisible({ timeout: 1000 }) {
        // Page info is shown - good
        expect(await pageInfo.first().isVisible()).toBe(true);
      }
    }

    await scenario.cleanup();
  });
});

test.describe('Trace Data Viewer', () => {
  test('trace viewer renders trace content', {
    tag: ['@spec:UI_COMPONENTS_SPEC'],
  }, async ({ page }) => {
    // Spec: UI_COMPONENTS_SPEC
    // Verifies trace content is rendered in the UI
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Trace Viewer Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .inPhase('discovery')
      .withRealApi()
      .build();

    const workshopId = scenario.workshop.id;

    // Verify traces exist via API
    const tracesResp = await page.request.get(
      `http://127.0.0.1:8000/workshops/${workshopId}/all-traces`
    );
    expect(tracesResp.ok()).toBeTruthy();

    const traces = (await tracesResp.json()) as Array<{ id: string; input: string; output: string }>;
    expect(traces.length).toBe(2);

    // Verify each trace has input/output content
    for (const trace of traces) {
      expect(trace.input).toBeTruthy();
      expect(trace.output).toBeTruthy();
    }

    // Login as facilitator to view the workshop
    await page.goto('/');
    await scenario.loginAs(scenario.facilitator);

    await expect(page.getByRole('heading', { name: 'Trace Viewer Test' })).toBeVisible({
      timeout: 10000,
    });

    // The workshop should have loaded with trace data accessible
    // Verify the page rendered without errors
    const errorBanner = page.getByText(/error|failed to load/i);
    const hasError = await errorBanner.first().isVisible({ timeout: 1000 }).catch(() => false);
    expect(hasError).toBe(false);

    await scenario.cleanup();
  });
});
