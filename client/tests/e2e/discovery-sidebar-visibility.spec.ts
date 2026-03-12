/**
 * E2E Test: Discovery Workspace — Draft Rubric Sidebar Visibility
 *
 * Verifies that the draft rubric sidebar remains visible (sticky) when
 * the facilitator scrolls through the trace feed in the discovery workspace.
 *
 * Uses mocked API for fast, deterministic execution.
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib/scenario-builder';
import { WorkshopPhase } from '../lib/types';

test.describe('Discovery Workspace: Sidebar Visibility', {
  tag: ['@spec:DISCOVERY_SPEC'],
}, () => {

  test('Draft rubric sidebar remains visible while scrolling traces', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Draft rubric sidebar is always visible while browsing traces',
    ],
  }, async ({ page }) => {
    // Setup: 10 traces to ensure the left panel is scrollable
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Sidebar Visibility Test' })
      .withFacilitator()
      .withParticipants(2)
      .withTraces(10)
      .inPhase(WorkshopPhase.DISCOVERY)
      .build();

    await scenario.loginAs(scenario.facilitator);

    // The facilitator should land on the discovery-monitor view which renders
    // FacilitatorDiscoveryWorkspace with its two-panel layout.

    // Locate the sidebar by its "Draft Rubric" heading text
    const sidebarHeading = page.getByText('Draft Rubric', { exact: false }).first();
    await expect(sidebarHeading).toBeVisible({ timeout: 10000 });

    // Locate the sidebar container (w-80 border-l bg-slate-50)
    // Use CSS attribute selector to match Tailwind utility classes
    const sidebar = page.locator('div.border-l').filter({ hasText: 'Draft Rubric' });
    await expect(sidebar).toBeVisible({ timeout: 5000 });

    // Locate the scrollable trace feed panel — it is the sibling of the sidebar
    // inside the flex container, with overflow-y-auto for scrolling
    const traceFeed = sidebar.locator('xpath=preceding-sibling::div[contains(@class,"overflow-y-auto")]');
    await expect(traceFeed).toBeVisible({ timeout: 5000 });

    // Record viewport dimensions for later comparison
    const viewportSize = page.viewportSize();
    expect(viewportSize).not.toBeNull();
    const viewportWidth = viewportSize!.width;
    const viewportHeight = viewportSize!.height;

    // Verify sidebar is in viewport BEFORE scrolling
    const sidebarBoxBefore = await sidebar.boundingBox();
    expect(sidebarBoxBefore).not.toBeNull();
    // Sidebar should be within the visible viewport
    expect(sidebarBoxBefore!.y).toBeGreaterThanOrEqual(0);
    expect(sidebarBoxBefore!.y).toBeLessThan(viewportHeight);
    // Sidebar should be on the right side of the page
    expect(sidebarBoxBefore!.x + sidebarBoxBefore!.width).toBeLessThanOrEqual(viewportWidth + 1);

    // Scroll the trace feed down by a significant amount
    await traceFeed.evaluate((el) => {
      el.scrollTop = el.scrollHeight;
    });

    // Small wait for any reflow/rendering after scroll
    await page.waitForTimeout(300);

    // Verify sidebar is STILL in viewport AFTER scrolling
    const sidebarBoxAfter = await sidebar.boundingBox();
    expect(sidebarBoxAfter).not.toBeNull();
    // The sidebar should still be at the same vertical position (it does not scroll away)
    expect(sidebarBoxAfter!.y).toBeGreaterThanOrEqual(0);
    expect(sidebarBoxAfter!.y).toBeLessThan(viewportHeight);
    // The sidebar vertical position should not have changed (it is a flex sibling, not inside the scrollable area)
    expect(sidebarBoxAfter!.y).toBe(sidebarBoxBefore!.y);
    expect(sidebarBoxAfter!.height).toBe(sidebarBoxBefore!.height);

    // Additionally verify the sidebar heading is still visible
    await expect(sidebarHeading).toBeVisible();

    await scenario.cleanup();
  });

});
