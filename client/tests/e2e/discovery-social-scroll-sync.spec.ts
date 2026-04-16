/**
 * E2E Test: Discovery Social Thread — Milestone Scroll Sync
 *
 * Verifies that when a milestone becomes active in the MilestoneView (left),
 * the social thread (right) scrolls so the first comment for that milestone
 * aligns near the top of the scroll container — matching the sticky milestone
 * blob position.
 *
 * Uses mocked API for fast, deterministic execution.
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib/scenario-builder';
import { WorkshopPhase } from '../lib/types';
import type { MockDiscoveryComment } from '../lib/mocks/api-mocker';

function buildMilestones(count: number) {
  return Array.from({ length: count }, (_, i) => ({
    number: i + 1,
    title: `Milestone ${i + 1} Title`,
    summary: `This is the summary for milestone ${i + 1}. It describes the key action taken at this step.`,
    inputs: [{ span_name: `input-span-${i + 1}`, field: 'inputs' as const, value: `Input data for step ${i + 1}` }],
    outputs: [{ span_name: `output-span-${i + 1}`, field: 'outputs' as const, value: `Output data for step ${i + 1}` }],
  }));
}

function buildComment(
  workshopId: string,
  traceId: string,
  milestoneRef: string,
  userId: string,
  userName: string,
  body: string,
  index: number,
): MockDiscoveryComment {
  return {
    id: `comment-${milestoneRef}-${index}`,
    workshop_id: workshopId,
    trace_id: traceId,
    milestone_ref: milestoneRef,
    parent_comment_id: null,
    user_id: userId,
    user_name: userName,
    user_email: `${userName.toLowerCase().replace(/\s+/g, '.')}@test.com`,
    user_role: 'participant',
    author_type: 'human',
    body,
    upvotes: 0,
    downvotes: 0,
    score: 0,
    viewer_vote: 0,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };
}

test.describe('Discovery Social Thread: Milestone Scroll Sync', {
  tag: ['@spec:DISCOVERY_SPEC'],
}, () => {

  test('social thread scrolls to align with active milestone', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Trace- and milestone-level comments with threaded replies',
    ],
  }, async ({ page }) => {
    const milestones = buildMilestones(5);

    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Scroll Sync Test' })
      .withFacilitator()
      .withParticipants(3)
      .withTraces(1)
      .inPhase(WorkshopPhase.DISCOVERY)
      .build();

    const trace = scenario.traces[0];
    const workshopId = scenario.workshop.id;

    // Set discovery_mode to 'social' and add milestone summary to the trace
    (scenario.workshop as Record<string, unknown>).discovery_mode = 'social';
    (trace as Record<string, unknown>).summary = {
      executive_summary: 'This agent analyzed a real estate closing workflow and produced five key milestones.',
      milestones,
    };

    // Seed comments across different milestones so the thread is scrollable
    const participants = scenario.users.participant;
    const comments: MockDiscoveryComment[] = [];
    for (let m = 1; m <= 5; m++) {
      for (let c = 0; c < 3; c++) {
        const p = participants[c % participants.length];
        comments.push(buildComment(
          workshopId,
          trace.id,
          `m${m}`,
          p.id,
          p.name,
          `Comment ${c + 1} on milestone ${m}: This part of the trace is important because it shows step ${m}.`,
          m * 10 + c,
        ));
      }
    }

    // Inject comments into the mock store via the scenario's mocker
    // The mocker reads from store.discoveryComments; we access it through the exposed traces ref's parent
    // Since we can't directly access the store, add comments via the mock route by updating the page's route handler
    // Actually, the simplest way: modify the store through the already-installed mock route handler
    // The api-mocker reads from this.store.discoveryComments. We can seed them via page.evaluate + fetch.
    // Better: use route.fulfill override to inject comments.

    // Approach: intercept the comments endpoint before the page loads and return our seeded data
    await page.route('**/discovery-comments/stream**', async (route) => {
      const url = new URL(route.request().url());
      const traceId = url.searchParams.get('trace_id');
      const filtered = traceId ? comments.filter(c => c.trace_id === traceId) : comments;
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: `event: comments_snapshot\ndata: ${JSON.stringify({ comments: filtered })}\n\n`,
      });
    });

    await page.route('**/discovery-comments?**', async (route) => {
      if (route.request().method() === 'GET') {
        const url = new URL(route.request().url());
        const traceId = url.searchParams.get('trace_id');
        const filtered = traceId ? comments.filter(c => c.trace_id === traceId) : comments;
        await route.fulfill({ json: filtered });
      } else {
        await route.fallback();
      }
    });

    await scenario.loginAs(scenario.facilitator);

    // Wait for the milestone view to render (the "Summary" tab should show milestones)
    await expect(page.getByText('Milestone 1 Title')).toBeVisible({ timeout: 15000 });

    // Open the social thread by clicking the chat FAB
    const chatFab = page.locator('button.rounded-full.shadow-lg').first();
    await chatFab.click();

    // Wait for the social thread to appear with comments
    await expect(page.getByText('Discussion Flow')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(500);

    // Verify milestone dividers are rendered in the social thread
    const m1Anchor = page.locator('[data-milestone-anchor="m1"]');
    await expect(m1Anchor).toBeVisible({ timeout: 5000 });

    // Get the scroll container (the social thread's scrollable area)
    const scrollContainer = page.locator('[class*="overflow-y-auto"]').filter({ hasText: 'Discussion Flow' }).locator('..').locator('[class*="overflow-y-auto"]').first();

    // Click on milestone 3 in the milestone view to activate it
    await page.locator('[data-milestone-ref="m3"]').first().click();
    await page.waitForTimeout(600); // wait for smooth scroll to complete

    // Verify the m3 anchor is near the top of the social thread scroll container
    const m3Anchor = page.locator('[data-milestone-anchor="m3"]');
    await expect(m3Anchor).toBeVisible({ timeout: 3000 });

    const m3Box = await m3Anchor.boundingBox();
    expect(m3Box).not.toBeNull();

    // The social thread's scroll container bounding box
    const threadScrollable = page.locator('.flex.flex-col.h-full.overflow-hidden').filter({ hasText: 'Discussion Flow' }).locator('div.overflow-y-auto').first();
    const containerBox = await threadScrollable.boundingBox();

    if (containerBox && m3Box) {
      // The m3 anchor should be near the top of the scroll container (within 60px)
      const distanceFromTop = m3Box.y - containerBox.y;
      expect(distanceFromTop).toBeGreaterThanOrEqual(-10);
      expect(distanceFromTop).toBeLessThan(60);
    }

    // Now click on milestone 1 and verify scroll syncs back
    await page.locator('[data-milestone-ref="m1"]').first().click();
    await page.waitForTimeout(600);

    const m1Box = await m1Anchor.boundingBox();
    expect(m1Box).not.toBeNull();

    if (containerBox && m1Box) {
      const distanceFromTop = m1Box.y - containerBox.y;
      expect(distanceFromTop).toBeGreaterThanOrEqual(-10);
      expect(distanceFromTop).toBeLessThan(60);
    }

    await scenario.cleanup();
  });

  test('social thread scrolls to top when trace-level summary is selected', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Trace- and milestone-level comments with threaded replies',
    ],
  }, async ({ page }) => {
    const milestones = buildMilestones(4);

    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Scroll To Top Test' })
      .withFacilitator()
      .withParticipants(2)
      .withTraces(1)
      .inPhase(WorkshopPhase.DISCOVERY)
      .build();

    const trace = scenario.traces[0];
    const workshopId = scenario.workshop.id;

    (scenario.workshop as Record<string, unknown>).discovery_mode = 'social';
    (trace as Record<string, unknown>).summary = {
      executive_summary: 'Executive summary of the agent workflow.',
      milestones,
    };

    const participants = scenario.users.participant;
    const comments: MockDiscoveryComment[] = [];
    for (let m = 1; m <= 4; m++) {
      for (let c = 0; c < 3; c++) {
        const p = participants[c % participants.length];
        comments.push(buildComment(workshopId, trace.id, `m${m}`, p.id, p.name, `M${m} comment ${c + 1}`, m * 10 + c));
      }
    }

    await page.route('**/discovery-comments/stream**', async (route) => {
      const filtered = comments.filter(c => c.trace_id === trace.id);
      await route.fulfill({
        status: 200,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
        body: `event: comments_snapshot\ndata: ${JSON.stringify({ comments: filtered })}\n\n`,
      });
    });

    await page.route('**/discovery-comments?**', async (route) => {
      if (route.request().method() === 'GET') {
        await route.fulfill({ json: comments.filter(c => c.trace_id === trace.id) });
      } else {
        await route.fallback();
      }
    });

    await scenario.loginAs(scenario.facilitator);
    await expect(page.getByText('Milestone 1 Title')).toBeVisible({ timeout: 15000 });

    const chatFab = page.locator('button.rounded-full.shadow-lg').first();
    await chatFab.click();
    await expect(page.getByText('Discussion Flow')).toBeVisible({ timeout: 5000 });
    await page.waitForTimeout(500);

    // First scroll to milestone 4
    await page.locator('[data-milestone-ref="m4"]').first().click();
    await page.waitForTimeout(600);

    // Then click the executive summary / trace-level section
    await page.locator('[data-milestone-ref="trace"]').click();
    await page.waitForTimeout(600);

    // The social thread should have scrolled back to the top
    const threadScrollable = page.locator('.flex.flex-col.h-full.overflow-hidden').filter({ hasText: 'Discussion Flow' }).locator('div.overflow-y-auto').first();
    const scrollTop = await threadScrollable.evaluate((el) => el.scrollTop);
    expect(scrollTop).toBe(0);

    await scenario.cleanup();
  });
});
