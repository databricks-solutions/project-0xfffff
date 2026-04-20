/**
 * E2E Test: Discovery Social Thread — Scope by Active Milestone
 *
 * Verifies that selecting a milestone in the MilestoneView (left) scopes the
 * social thread (right) to only that milestone's comments, and that the
 * composer scope indicator reflects the current selection.
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
  milestoneRef: string | null,
  userId: string,
  userName: string,
  body: string,
  index: number,
): MockDiscoveryComment {
  return {
    id: `comment-${milestoneRef ?? 'trace'}-${index}`,
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

test.describe('Discovery Social Thread: Scope By Milestone', {
  tag: ['@spec:DISCOVERY_SPEC'],
}, () => {

  test('selecting a milestone scopes the thread to that milestone\'s comments', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Trace- and milestone-level comments with threaded replies',
    ],
  }, async ({ page }) => {
    const milestones = buildMilestones(5);

    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Scope Test' })
      .withFacilitator()
      .withParticipants(3)
      .withTraces(1)
      .inPhase(WorkshopPhase.DISCOVERY)
      .build();

    const trace = scenario.traces[0];
    const workshopId = scenario.workshop.id;

    (scenario.workshop as Record<string, unknown>).discovery_mode = 'social';
    (trace as Record<string, unknown>).summary = {
      executive_summary: 'This agent analyzed a real estate closing workflow and produced five key milestones.',
      milestones,
    };

    const participants = scenario.users.participant;
    const comments: MockDiscoveryComment[] = [];
    // One distinctive comment per milestone so we can assert on exact bodies
    for (let m = 1; m <= 5; m++) {
      const p = participants[(m - 1) % participants.length];
      comments.push(buildComment(
        workshopId,
        trace.id,
        `m${m}`,
        p.id,
        p.name,
        `MARKER-M${m} unique discussion for milestone ${m}`,
        m,
      ));
    }
    // A trace-level comment (no milestone_ref)
    comments.push(buildComment(
      workshopId,
      trace.id,
      null,
      participants[0].id,
      participants[0].name,
      `MARKER-TRACE unique trace-level discussion`,
      999,
    ));

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

    await expect(page.getByRole('heading', { name: 'Milestone 1 Title' })).toBeVisible({ timeout: 15000 });

    // Open the thread via the FAB (panel starts closed)
    const chatFab = page.locator('button.rounded-full.shadow-lg.w-12.h-12');
    await expect(chatFab).toBeVisible({ timeout: 5000 });
    await chatFab.click();

    const threadPanel = page.locator('div.flex.flex-col.h-full').filter({
      has: page.locator('textarea[placeholder*="summarize"]'),
    });
    await expect(threadPanel).toBeVisible({ timeout: 5000 });

    // Click milestone 3 on the left
    await page.locator('[data-milestone-ref="m3"][id]').first().click();

    // Thread should show ONLY M3's comment
    await expect(threadPanel.getByText('MARKER-M3 unique discussion for milestone 3')).toBeVisible({ timeout: 3000 });
    await expect(threadPanel.getByText('MARKER-M1 unique discussion for milestone 1')).toHaveCount(0);
    await expect(threadPanel.getByText('MARKER-M2 unique discussion for milestone 2')).toHaveCount(0);
    await expect(threadPanel.getByText('MARKER-M4 unique discussion for milestone 4')).toHaveCount(0);
    await expect(threadPanel.getByText('MARKER-TRACE unique trace-level discussion')).toHaveCount(0);

    // Composer scope indicator should reflect M3
    await expect(threadPanel.getByText(/Commenting on Milestone 3/)).toBeVisible();

    // Click milestone 1
    await page.locator('[data-milestone-ref="m1"][id]').first().click();
    await expect(threadPanel.getByText('MARKER-M1 unique discussion for milestone 1')).toBeVisible({ timeout: 3000 });
    await expect(threadPanel.getByText('MARKER-M3 unique discussion for milestone 3')).toHaveCount(0);
    await expect(threadPanel.getByText(/Commenting on Milestone 1/)).toBeVisible();

    await scenario.cleanup();
  });

  test('selecting the agent synthesis scopes the thread to trace-level comments', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Trace- and milestone-level comments with threaded replies',
    ],
  }, async ({ page }) => {
    const milestones = buildMilestones(4);

    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Trace Scope Test' })
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
      const p = participants[(m - 1) % participants.length];
      comments.push(buildComment(workshopId, trace.id, `m${m}`, p.id, p.name, `MARKER-M${m} discussion`, m));
    }
    comments.push(buildComment(workshopId, trace.id, null, participants[0].id, participants[0].name, `MARKER-TRACE-ONLY seen only at trace scope`, 999));

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
    await expect(page.getByRole('heading', { name: 'Milestone 1 Title' })).toBeVisible({ timeout: 15000 });

    const chatFab = page.locator('button.rounded-full.shadow-lg.w-12.h-12');
    await expect(chatFab).toBeVisible({ timeout: 5000 });
    await chatFab.click();

    const threadPanel = page.locator('div.flex.flex-col.h-full').filter({
      has: page.locator('textarea[placeholder*="summarize"]'),
    });
    await expect(threadPanel).toBeVisible({ timeout: 5000 });

    // Start by selecting a milestone
    await page.locator('[data-milestone-ref="m2"][id]').first().click();
    await expect(threadPanel.getByText('MARKER-M2 discussion')).toBeVisible({ timeout: 3000 });

    // Now click the trace-level (executive summary / agent synthesis) card
    await page.locator('[data-milestone-ref="trace"]').click();

    // Only the trace-level comment should be visible, no milestone comments
    await expect(threadPanel.getByText('MARKER-TRACE-ONLY seen only at trace scope')).toBeVisible({ timeout: 3000 });
    await expect(threadPanel.getByText('MARKER-M1 discussion')).toHaveCount(0);
    await expect(threadPanel.getByText('MARKER-M2 discussion')).toHaveCount(0);
    await expect(threadPanel.getByText('MARKER-M3 discussion')).toHaveCount(0);
    await expect(threadPanel.getByText('MARKER-M4 discussion')).toHaveCount(0);

    // Composer should show trace-level scope
    await expect(threadPanel.getByText(/Commenting at trace level/)).toBeVisible();

    await scenario.cleanup();
  });
});
