/**
 * E2E Test: Discovery Step 3 - Draft Rubric Grouping
 *
 * Tests grouping of draft rubric items and their availability across phases.
 * Covers: suggest groups (LLM), apply groups, manual grouping, group-to-question
 * mapping, and persistence after phase advance.
 */

import { test, expect, type Page } from '@playwright/test';
import { TestScenario } from '../lib/scenario-builder';
import { WorkshopPhase } from '../lib/types';

declare const process: { env: Record<string, string | undefined> };
const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000';

type DraftItem = { id: string; text: string; group_id?: string | null; group_name?: string | null; [k: string]: unknown };

/**
 * Typed helper wrapping draft-rubric-item API calls for a given workshop.
 * Centralises URL construction so tests stay focused on assertions.
 */
function draftRubricApi(page: Page, workshopId: string) {
  const base = `${API_URL}/workshops/${workshopId}/draft-rubric-items`;

  return {
    async createItem(text: string, userId: string, traceIds: string[]): Promise<DraftItem> {
      const resp = await page.request.post(base, {
        data: { text, source_type: 'manual', source_trace_ids: traceIds.slice(0, 1), promoted_by: userId },
      });
      expect(resp.ok()).toBe(true);
      return resp.json();
    },

    async createItems(texts: string[], userId: string, traceIds: string[]): Promise<DraftItem[]> {
      const items: DraftItem[] = [];
      for (const text of texts) {
        items.push(await this.createItem(text, userId, traceIds));
      }
      return items;
    },

    async getItems(): Promise<DraftItem[]> {
      const resp = await page.request.get(base);
      expect(resp.ok()).toBe(true);
      return resp.json();
    },

    async updateItem(itemId: string, updates: Record<string, unknown>): Promise<DraftItem> {
      const resp = await page.request.put(`${base}/${itemId}`, { data: updates });
      expect(resp.ok()).toBe(true);
      return resp.json();
    },

    async applyGroups(groups: Array<{ name: string; item_ids: string[] }>): Promise<void> {
      const resp = await page.request.post(`${base}/apply-groups`, { data: { groups } });
      expect(resp.ok()).toBe(true);
    },
  };
}

test.describe('Discovery Step 3: Draft Rubric Grouping', () => {

  test('"Suggest Groups" returns LLM proposal without persisting', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:"Suggest Groups" returns LLM proposal without persisting',
      '@e2e-real',
    ],
  }, async ({ browser }) => {
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Suggest Groups Proposal Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery(2);

    const api = draftRubricApi(scenario.page, scenario.workshop.id);
    const traceIds = scenario.traces.map((t) => t.id);

    // Pre-create 3 items so "Suggest Groups" button appears (requires >= 2)
    const items = await api.createItems(
      [
        'Response should cite sources with verifiable references',
        'Tone should be professional and empathetic',
        'Accuracy of factual claims must be high',
      ],
      scenario.facilitator.id,
      traceIds,
    );
    expect(items.length).toBe(3);

    // Open fresh page to pick up items created via API (sidebar is always visible)
    const page = await scenario.newPageAs(scenario.facilitator);

    // Wait for items to load in the sidebar
    await expect(
      page.getByText('3 items')
    ).toBeVisible({ timeout: 10000 });

    // Click "Suggest Groups" and wait for the proposal card
    // In demo mode the LLM returns almost instantly so the "Suggesting..." loading
    // state may flash too briefly to assert on.
    await page.getByRole('button', { name: /Suggest Groups/i }).click();

    await expect(
      page.getByText('Suggested Grouping')
    ).toBeVisible({ timeout: 45000 });

    // The proposal card should be visible with Apply Groups and Dismiss buttons
    const proposalCard = page.locator('.border-blue-200.bg-blue-50');
    await expect(proposalCard).toBeVisible();
    await expect(proposalCard.getByRole('button', { name: /Apply Groups/i })).toBeVisible();
    await expect(proposalCard.getByRole('button', { name: /Dismiss/i })).toBeVisible();

    // Verify items are NOT yet grouped (proposal is display-only, not persisted)
    const currentItems = await api.getItems();
    for (const item of currentItems) {
      expect(item.group_id).toBeFalsy();
      expect(item.group_name).toBeFalsy();
    }

    // Dismiss the proposal
    await proposalCard.getByRole('button', { name: /Dismiss/i }).click();
    await expect(page.getByText('Suggested Grouping')).not.toBeVisible({ timeout: 5000 });

    await scenario.cleanup();
  });

  test('Facilitator can apply group proposal and see persisted assignments', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Facilitator can review, adjust, and apply group proposal',
      '@e2e-real',
    ],
  }, async ({ browser }) => {
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Apply Groups Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery(2);

    const api = draftRubricApi(scenario.page, scenario.workshop.id);
    const traceIds = scenario.traces.map((t) => t.id);

    // Pre-create 3 items and apply groups
    const items = await api.createItems(
      [
        'Responses must include transaction IDs',
        'Error messages should be user-friendly',
        'Security protocols must be followed',
      ],
      scenario.facilitator.id,
      traceIds,
    );

    await api.applyGroups([
      { name: 'Response Quality', item_ids: [items[0].id, items[1].id] },
      { name: 'Safety', item_ids: [items[2].id] },
    ]);

    // Verify via API that group assignments persisted
    const updatedItems = await api.getItems();
    const qualityItems = updatedItems.filter((i) => i.group_name === 'Response Quality');
    const safetyItems = updatedItems.filter((i) => i.group_name === 'Safety');
    expect(qualityItems.length).toBe(2);
    expect(safetyItems.length).toBe(1);

    // Open fresh page to pick up groups applied via API (sidebar is always visible)
    const page = await scenario.newPageAs(scenario.facilitator);

    await expect(page.getByText('Response Quality (2)')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Safety (1)')).toBeVisible({ timeout: 10000 });

    // Verify the item texts are visible under their groups
    await expect(page.getByText('Responses must include transaction IDs')).toBeVisible();
    await expect(page.getByText('Security protocols must be followed')).toBeVisible();

    await scenario.cleanup();
  });

  test('Manual grouping: create groups, name them, move items between groups', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Manual grouping: create groups, name them, move items between groups',
      '@e2e-real',
    ],
  }, async ({ browser }) => {
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Manual Grouping Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery(2);

    const api = draftRubricApi(scenario.page, scenario.workshop.id);
    const traceIds = scenario.traces.map((t) => t.id);

    // Pre-create 2 items
    const items = await api.createItems(
      [
        'Response completeness and detail level',
        'Appropriate use of technical jargon',
      ],
      scenario.facilitator.id,
      traceIds,
    );

    const groupId = 'manual-group-1';

    // Assign both items to a named group via PUT (create group + name it)
    for (const item of items) {
      const updated = await api.updateItem(item.id, { group_id: groupId, group_name: 'Communication Clarity' });
      expect(updated.group_id).toBe(groupId);
      expect(updated.group_name).toBe('Communication Clarity');
    }

    // Open fresh page to pick up groups assigned via API (sidebar is always visible)
    const page = await scenario.newPageAs(scenario.facilitator);

    await expect(page.getByText('Communication Clarity (2)')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Response completeness and detail level')).toBeVisible();
    await expect(page.getByText('Appropriate use of technical jargon')).toBeVisible();

    // Move one item to a different group (demonstrates moving between groups)
    const movedItem = await api.updateItem(items[1].id, { group_id: 'manual-group-2', group_name: 'Terminology' });
    expect(movedItem.group_name).toBe('Terminology');

    // Verify the regrouping via API
    const allItems = await api.getItems();
    const clarityGroup = allItems.filter((i) => i.group_name === 'Communication Clarity');
    const termGroup = allItems.filter((i) => i.group_name === 'Terminology');
    expect(clarityGroup.length).toBe(1);
    expect(clarityGroup[0].text).toBe('Response completeness and detail level');
    expect(termGroup.length).toBe(1);
    expect(termGroup[0].text).toBe('Appropriate use of technical jargon');

    await scenario.cleanup();
  });

  test('Group name becomes section header (group name = question title)', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Each group maps to one rubric question (group name = question title)',
      '@e2e-real',
    ],
  }, async ({ browser }) => {
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Group Name Mapping Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery(2);

    const api = draftRubricApi(scenario.page, scenario.workshop.id);
    const traceIds = scenario.traces.map((t) => t.id);

    // Pre-create 3 items and apply groups with meaningful names
    const items = await api.createItems(
      [
        'Facts should be verifiable against known data',
        'Numbers and statistics must be accurate',
        'Response should be warm and encouraging',
      ],
      scenario.facilitator.id,
      traceIds,
    );

    await api.applyGroups([
      { name: 'Accuracy', item_ids: [items[0].id, items[1].id] },
      { name: 'Helpfulness', item_ids: [items[2].id] },
    ]);

    // Open fresh page to pick up groups applied via API (sidebar is always visible)
    const page = await scenario.newPageAs(scenario.facilitator);

    // Verify group headers match the group names (these become rubric question titles)
    await expect(page.getByText('Accuracy (2)')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('Helpfulness (1)')).toBeVisible({ timeout: 10000 });

    // Verify items are organized under their respective groups
    await expect(page.getByText('Facts should be verifiable against known data')).toBeVisible();
    await expect(page.getByText('Numbers and statistics must be accurate')).toBeVisible();
    await expect(page.getByText('Response should be warm and encouraging')).toBeVisible();

    // Cross-check: API group_name values match what is displayed as section headers
    const allItems = await api.getItems();
    const accuracyGroup = allItems.filter((i) => i.group_name === 'Accuracy');
    const helpfulnessGroup = allItems.filter((i) => i.group_name === 'Helpfulness');
    expect(accuracyGroup.length).toBe(2);
    expect(helpfulnessGroup.length).toBe(1);

    await scenario.cleanup();
  });

  test('Draft rubric items persist and are available after advancing to rubric phase', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Draft rubric items available during Rubric Creation phase',
      '@e2e-real',
    ],
  }, async ({ browser }) => {
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Phase Advance Persistence Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery(2);

    const api = draftRubricApi(scenario.page, scenario.workshop.id);
    const traceIds = scenario.traces.map((t) => t.id);

    // Pre-create 2 items
    const items = await api.createItems(
      [
        'Response should address all parts of the question',
        'Follow-up suggestions should be actionable',
      ],
      scenario.facilitator.id,
      traceIds,
    );

    // Verify items exist before phase advance
    const beforeItems = await api.getItems();
    expect(beforeItems.length).toBe(2);
    expect(beforeItems[0].text).toBe('Response should address all parts of the question');
    expect(beforeItems[1].text).toBe('Follow-up suggestions should be actionable');

    // Advance to rubric phase
    await scenario.advanceToPhase(WorkshopPhase.RUBRIC);

    // Verify items still exist after phase advance (available in Rubric Creation)
    const afterItems = await api.getItems();
    expect(afterItems.length).toBe(2);
    expect(afterItems[0].text).toBe('Response should address all parts of the question');
    expect(afterItems[1].text).toBe('Follow-up suggestions should be actionable');

    // Verify item IDs are consistent (same items, not re-created)
    expect(afterItems[0].id).toBe(items[0].id);
    expect(afterItems[1].id).toBe(items[1].id);

    await scenario.cleanup();
  });

});
