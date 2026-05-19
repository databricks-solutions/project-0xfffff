/**
 * E2E Test: Discovery Step 3 - Draft Rubric CRUD Operations
 *
 * Tests the facilitator's ability to create, read, update, and delete
 * draft rubric items via the Draft Rubric panel in the facilitator
 * dashboard during the Discovery phase.
 *
 * All tests use real API (no mocks) to verify full round-trip behavior.
 */

import { test, expect, type Page } from '@playwright/test';
import { TestScenario } from '../lib/scenario-builder';
import { WorkshopPhase } from '../lib/types';
import {
  createDraftRubricItemViaApi,
  addDraftRubricItemViaUI,
  editDraftRubricItem,
  deleteDraftRubricItem,
} from '../lib/actions';

declare const process: { env: Record<string, string | undefined> };
const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000';

type BuiltScenario = Awaited<ReturnType<InstanceType<typeof TestScenario>['build']>>;

/**
 * Helper: open a fresh facilitator page where the Draft Rubric sidebar is visible.
 *
 * After beginDiscovery() changes server state via API, the original page has
 * stale data. Opening a new page via newPageAs re-logs in and loads the current
 * workshop state. The draft rubric sidebar is always visible in the two-panel
 * layout — no tab click is needed.
 */
async function openFacilitatorPage(scenario: BuiltScenario): Promise<Page> {
  const page = await scenario.newPageAs(scenario.facilitator);
  return page;
}

test.describe('Discovery Step 3: Draft Rubric CRUD', () => {

  test('facilitator can manually add a draft rubric item', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Facilitator can manually add draft rubric items',
      '@e2e-real',
    ],
  }, async ({ browser }) => {
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Draft Rubric Manual Add Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery(2);

    // Open fresh page as facilitator (draft rubric sidebar is always visible)
    const page = await openFacilitatorPage(scenario);

    // Verify the empty state is shown
    await expect(
      page.getByText('0 items')
    ).toBeVisible({ timeout: 10000 });

    // Add an item via the UI using the action
    await addDraftRubricItemViaUI(page, 'Response should always include a greeting');

    // Verify item appears with text
    await expect(
      page.getByText('Response should always include a greeting')
    ).toBeVisible({ timeout: 10000 });

    // Verify count updated
    await expect(
      page.getByText('1 items')
    ).toBeVisible({ timeout: 5000 });

    await scenario.cleanup();
  });

  test('items with different source types display correct badges and trace IDs', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Facilitator can promote distilled criteria to draft rubric',
      '@req:Facilitator can promote raw participant feedback to draft rubric',
      '@req:Source traceability maintained (which traces support each item)',
      '@e2e-real',
    ],
  }, async ({ browser }) => {
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Draft Rubric Source Types Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery(2);

    const facilitatorId = scenario.facilitator.id;
    const traceId0 = scenario.traces[0].id;
    const traceId1 = scenario.traces[1].id;

    // Create items via API with different source types
    await createDraftRubricItemViaApi(scenario.page, scenario.workshop.id, {
      text: 'Responses must cite specific evidence from the conversation',
      source_type: 'finding',
      source_trace_ids: [traceId0, traceId1],
      promoted_by: facilitatorId,
    }, API_URL);

    await createDraftRubricItemViaApi(scenario.page, scenario.workshop.id, {
      text: 'Tone should be professional but approachable',
      source_type: 'feedback',
      source_trace_ids: [traceId0],
      promoted_by: facilitatorId,
    }, API_URL);

    // Open fresh page as facilitator (draft rubric sidebar is always visible)
    const page = await openFacilitatorPage(scenario);

    // Verify items count
    await expect(page.getByText('2 items')).toBeVisible({ timeout: 10000 });

    // Verify finding item text
    await expect(
      page.getByText('Responses must cite specific evidence from the conversation')
    ).toBeVisible({ timeout: 10000 });

    // Verify feedback item text
    await expect(
      page.getByText('Tone should be professional but approachable')
    ).toBeVisible({ timeout: 5000 });

    // Verify trace ID badges appear (first 8 chars of trace IDs)
    const traceIdPrefix0 = traceId0.slice(0, 8);
    const traceIdPrefix1 = traceId1.slice(0, 8);
    await expect(page.getByText(traceIdPrefix0).first()).toBeVisible({ timeout: 5000 });
    await expect(page.getByText(traceIdPrefix1)).toBeVisible({ timeout: 5000 });

    await scenario.cleanup();
  });

  test('facilitator can edit a draft rubric item inline', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Draft rubric items editable and removable',
      '@e2e-real',
    ],
  }, async ({ browser }) => {
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Draft Rubric Edit Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery(2);

    // Pre-create an item via API
    await createDraftRubricItemViaApi(scenario.page, scenario.workshop.id, {
      text: 'Original rubric item text for editing',
      source_type: 'manual',
      promoted_by: scenario.facilitator.id,
    }, API_URL);

    // Open fresh page as facilitator (draft rubric sidebar is always visible)
    const page = await openFacilitatorPage(scenario);

    // Verify item appears
    await expect(
      page.getByText('Original rubric item text for editing')
    ).toBeVisible({ timeout: 10000 });

    // Edit the item using the action
    await editDraftRubricItem(page, 'Updated rubric item text after editing');

    // Verify the updated text appears
    await expect(
      page.getByText('Updated rubric item text after editing')
    ).toBeVisible({ timeout: 10000 });

    // Verify the old text is no longer visible
    await expect(
      page.getByText('Original rubric item text for editing')
    ).not.toBeVisible({ timeout: 3000 });

    await scenario.cleanup();
  });

  test('facilitator can delete a draft rubric item', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Draft rubric items editable and removable',
      '@e2e-real',
    ],
  }, async ({ browser }) => {
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Draft Rubric Delete Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery(2);

    // Pre-create an item via API
    await createDraftRubricItemViaApi(scenario.page, scenario.workshop.id, {
      text: 'This item will be deleted',
      source_type: 'manual',
      promoted_by: scenario.facilitator.id,
    }, API_URL);

    // Open fresh page as facilitator (draft rubric sidebar is always visible)
    const page = await openFacilitatorPage(scenario);

    // Verify item appears with count 1
    await expect(page.getByText('1 items')).toBeVisible({ timeout: 10000 });
    await expect(page.getByText('This item will be deleted')).toBeVisible({ timeout: 5000 });

    // Delete the item using the action
    await deleteDraftRubricItem(page);

    // Verify item is removed - count should go to 0
    await expect(page.getByText('0 items')).toBeVisible({ timeout: 10000 });

    // Verify the item text is no longer visible
    await expect(page.getByText('This item will be deleted')).not.toBeVisible({ timeout: 5000 });

    // Verify empty state message appears
    await expect(page.getByText('No items yet')).toBeVisible({ timeout: 5000 });

    await scenario.cleanup();
  });

  test('disagreement insight displays correct badge', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Facilitator can promote disagreement insights to draft rubric',
      '@e2e-real',
    ],
  }, async ({ browser }) => {
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Draft Rubric Disagreement Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery(2);

    const facilitatorId = scenario.facilitator.id;
    const traceId0 = scenario.traces[0].id;

    // Create a disagreement-sourced item via API
    await createDraftRubricItemViaApi(scenario.page, scenario.workshop.id, {
      text: 'Rating split on security guidance: one said adequate, other wanted 2FA',
      source_type: 'disagreement',
      source_trace_ids: [traceId0],
      promoted_by: facilitatorId,
    }, API_URL);

    // Also create a feedback-sourced item to ensure both display correctly
    await createDraftRubricItemViaApi(scenario.page, scenario.workshop.id, {
      text: 'Participant noted response was too verbose',
      source_type: 'feedback',
      promoted_by: facilitatorId,
    }, API_URL);

    // Open fresh page as facilitator (draft rubric sidebar is always visible)
    const page = await openFacilitatorPage(scenario);

    // Verify both items appear
    await expect(page.getByText('2 items')).toBeVisible({ timeout: 10000 });

    // Verify disagreement item text
    await expect(
      page.getByText('Rating split on security guidance: one said adequate, other wanted 2FA')
    ).toBeVisible({ timeout: 10000 });

    // Verify feedback item text also displays correctly
    await expect(
      page.getByText('Participant noted response was too verbose')
    ).toBeVisible({ timeout: 5000 });

    // Verify trace ID badge for the disagreement item (first 8 chars)
    const traceIdPrefix = traceId0.slice(0, 8);
    await expect(page.getByText(traceIdPrefix)).toBeVisible({ timeout: 5000 });

    await scenario.cleanup();
  });


});
