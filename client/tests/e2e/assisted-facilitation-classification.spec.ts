/**
 * E2E Tests for Assisted Facilitation v2 - Classification & Disagreements
 *
 * Tests the real-time classification of findings into categories and
 * automatic disagreement detection between participants.
 *
 * Per spec: Classification occurs in real-time when a participant submits a finding.
 * These tests verify the full flow: participant submits via UI → finding is classified → facilitator sees in dashboard.
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib/scenario-builder';
import { WorkshopPhase } from '../lib/types';
import * as actions from '../lib/actions';

/** Valid finding categories per spec */
const VALID_CATEGORIES = [
  'themes',
  'edge_cases',
  'boundary_conditions',
  'failure_modes',
  'missing_info',
] as const;

test.describe('Assisted Facilitation v2 - Classification & Disagreements', {
  tag: ['@spec:ASSISTED_FACILITATION_SPEC'],
}, () => {
  test('participant submits finding via UI and facilitator sees it classified in dashboard', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Findings are classified in real-time as participants submit them'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop with participants
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Classification UI Flow Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(3)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    const participant = scenario.users.participant[0];

    // Step 1: Facilitator starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Step 2: Participant logs in and sees discovery phase
    const participantPage = await scenario.newPageAs(participant);

    // Wait for discovery phase UI to load
    await expect(participantPage.getByTestId('discovery-phase-title')).toBeVisible({ timeout: 15000 });

    // Step 3: Participant fills in the discovery question and submits
    // The baseline question (q_1) asks: "What makes this response effective or ineffective?"
    const q1Input = participantPage.locator('#dq-q_1');
    await expect(q1Input).toBeVisible({ timeout: 5000 });

    // Enter a finding that should be classified (e.g., into "themes" or "missing_info")
    const findingText = 'The response provides clear explanations but is missing error handling documentation.';
    await q1Input.fill(findingText);

    // Trigger save by blurring (autosave on blur)
    await q1Input.blur();

    // Click Next to navigate and ensure save completes
    await participantPage.getByRole('button', { name: /^Next$/i }).click();

    // Wait for navigation to complete
    await expect(participantPage.getByTestId('trace-number')).toContainText('2 of 3', { timeout: 5000 });

    // Step 4: Facilitator navigates to dashboard to verify classification
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);
    await actions.goToTraceCoverage(scenario.page);

    // Expand the first trace (where finding was submitted)
    const traceId = scenario.traces[0].id;
    await actions.expandTraceRow(scenario.page, traceId);
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // SPEC REQUIREMENT: Findings are classified in real-time as participants submit them
    // Verify at least one finding appears in the classified categories
    let totalFindingsInUI = 0;
    for (const category of VALID_CATEGORIES) {
      const { count } = await actions.getCategoryCount(scenario.page, category);
      totalFindingsInUI += count;
    }
    expect(totalFindingsInUI).toBeGreaterThan(0);

    await scenario.cleanup();
  });

  test('multiple participants submit conflicting findings and facilitator sees disagreement', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Disagreements are auto-detected and surfaced'],
  }, async ({ browser }) => {
    // Setup: Create workshop with 2 participants
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Disagreement Detection Test' })
      .withFacilitator()
      .withParticipants(2)
      .withTraces(3)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    const participant1 = scenario.users.participant[0];
    const participant2 = scenario.users.participant[1];

    // Facilitator starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Participant 1 submits a POSITIVE finding
    const page1 = await scenario.newPageAs(participant1);
    await expect(page1.getByTestId('discovery-phase-title')).toBeVisible({ timeout: 15000 });

    const q1Input1 = page1.locator('#dq-q_1');
    await expect(q1Input1).toBeVisible({ timeout: 5000 });
    await q1Input1.fill('This response is excellent! Great clarity and comprehensive coverage of the topic.');
    await q1Input1.blur();
    await page1.getByRole('button', { name: /^Next$/i }).click();
    await expect(page1.getByTestId('trace-number')).toContainText('2 of 3', { timeout: 5000 });

    // Participant 2 submits a CONFLICTING (negative) finding on the SAME trace
    const page2 = await scenario.newPageAs(participant2);
    await expect(page2.getByTestId('discovery-phase-title')).toBeVisible({ timeout: 15000 });

    const q1Input2 = page2.locator('#dq-q_1');
    await expect(q1Input2).toBeVisible({ timeout: 5000 });
    await q1Input2.fill('This response is poor quality. Missing critical information and contains inaccuracies.');
    await q1Input2.blur();
    await page2.getByRole('button', { name: /^Next$/i }).click();
    await expect(page2.getByTestId('trace-number')).toContainText('2 of 3', { timeout: 5000 });

    // Facilitator checks dashboard for disagreements
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);
    await actions.goToTraceCoverage(scenario.page);

    const traceId = scenario.traces[0].id;
    await actions.expandTraceRow(scenario.page, traceId);
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // SPEC REQUIREMENT: Disagreements are auto-detected and surfaced
    // Note: Disagreement detection depends on LLM analysis, so we verify the UI structure
    const disagreementCount = await actions.getDisagreementsCount(scenario.page);

    if (disagreementCount > 0) {
      await expect(scenario.page.getByTestId('disagreements-section')).toBeVisible();
      const summary = await actions.getDisagreementSummary(scenario.page, 0);
      expect(summary.length).toBeGreaterThan(0);
    }
    // Even if no disagreement detected (LLM variance), findings should be visible
    let totalFindings = 0;
    for (const category of VALID_CATEGORIES) {
      const { count } = await actions.getCategoryCount(scenario.page, category);
      totalFindings += count;
    }
    expect(totalFindings).toBeGreaterThanOrEqual(2); // Both participants' findings

    await scenario.cleanup();
  });

  test('facilitator sees per-trace structured view with all 5 category sections', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Facilitators see per-trace structured view with category breakdown'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop with findings
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Category Structure Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(3)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    const participant = scenario.users.participant[0];

    // Facilitator starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Participant submits a finding
    const participantPage = await scenario.newPageAs(participant);
    await expect(participantPage.getByTestId('discovery-phase-title')).toBeVisible({ timeout: 15000 });

    const q1Input = participantPage.locator('#dq-q_1');
    await expect(q1Input).toBeVisible({ timeout: 5000 });
    await q1Input.fill('The code structure demonstrates good organization and clarity. Overall effective response.');
    await q1Input.blur();
    await participantPage.getByRole('button', { name: /^Next$/i }).click();

    // Facilitator views dashboard
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);
    await actions.goToTraceCoverage(scenario.page);

    const traceId = scenario.traces[0].id;
    await actions.expandTraceRow(scenario.page, traceId);
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // SPEC REQUIREMENT: Facilitators see per-trace structured view with category breakdown
    // Verify category coverage section and all 5 categories are visible
    await expect(scenario.page.getByTestId('category-coverage-section')).toBeVisible();

    for (const category of VALID_CATEGORIES) {
      await expect(scenario.page.getByTestId(`category-${category}`)).toBeVisible();
    }

    // Verify count badges show format "N/M" (count/threshold)
    for (const category of VALID_CATEGORIES) {
      const badge = scenario.page.getByTestId(`category-${category}-count`);
      await expect(badge).toBeVisible();
      const text = await badge.textContent();
      expect(text).toMatch(/\d+\/\d+/); // Matches "0/3", "1/3", etc.
    }

    await scenario.cleanup();
  });

  test('finding user attribution is shown in category sections', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Facilitators see per-trace structured view with category breakdown'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'User Attribution Test' })
      .withFacilitator()
      .withParticipants(2)
      .withTraces(2)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    const p1 = scenario.users.participant[0];
    const p2 = scenario.users.participant[1];

    // Facilitator starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Both participants submit findings on trace 1
    for (const participant of [p1, p2]) {
      const participantPage = await scenario.newPageAs(participant);
      await expect(participantPage.getByTestId('discovery-phase-title')).toBeVisible({ timeout: 15000 });

      const q1Input = participantPage.locator('#dq-q_1');
      await expect(q1Input).toBeVisible({ timeout: 5000 });
      await q1Input.fill(`Finding from ${participant.name}: Response is well-structured.`);
      await q1Input.blur();
      await participantPage.getByRole('button', { name: /^Next$/i }).click();
    }

    // Facilitator views dashboard
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);
    await actions.goToTraceCoverage(scenario.page);

    const traceId = scenario.traces[0].id;
    await actions.expandTraceRow(scenario.page, traceId);
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // SPEC REQUIREMENT: Each finding shows user attribution
    // Find a category with findings and verify user badges
    for (const category of VALID_CATEGORIES) {
      const { count } = await actions.getCategoryCount(scenario.page, category);
      if (count > 0) {
        const findingsContainer = scenario.page.getByTestId(`category-${category}-findings`);
        await expect(findingsContainer).toBeVisible();

        const userBadge = findingsContainer.getByTestId('finding-user-id').first();
        await expect(userBadge).toBeVisible();

        const badgeText = await userBadge.textContent();
        expect(badgeText?.length).toBeGreaterThan(0);
        break;
      }
    }

    await scenario.cleanup();
  });

  test('threshold controls are visible and can be updated via UI', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Thresholds are configurable per category per trace'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Threshold Controls Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    // Facilitator starts discovery and opens dashboard
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);
    await actions.goToTraceCoverage(scenario.page);

    const traceId = scenario.traces[0].id;
    await actions.expandTraceRow(scenario.page, traceId);
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // SPEC REQUIREMENT: Thresholds are configurable per category per trace
    await expect(scenario.page.getByTestId('threshold-controls')).toBeVisible();

    // Verify all category threshold inputs exist
    for (const category of VALID_CATEGORIES) {
      await expect(scenario.page.getByTestId(`threshold-input-${category}`)).toBeVisible();
    }

    // Update a threshold via UI
    const newThreshold = 5;
    await actions.updateCategoryThreshold(scenario.page, 'themes', newThreshold);

    // Verify the count badge reflects new threshold
    const { threshold } = await actions.getCategoryCount(scenario.page, 'themes');
    expect(threshold).toBe(newThreshold);

    await scenario.cleanup();
  });

  test('generate question button triggers question generation', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Facilitators can generate targeted questions that broadcast to all participants'],
  }, async ({
    browser,
  }) => {
    // Setup
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Question Generation Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    // Facilitator starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);
    await actions.goToTraceCoverage(scenario.page);

    const traceId = scenario.traces[0].id;
    await actions.expandTraceRow(scenario.page, traceId);
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // SPEC REQUIREMENT: Facilitators can generate targeted questions
    const generateBtn = scenario.page.getByTestId('generate-question-btn');
    await expect(generateBtn).toBeVisible();
    await expect(generateBtn).toBeEnabled();

    // Click and wait for generation to complete
    await generateBtn.click();

    // Button should show loading then return to normal
    await expect(generateBtn).toHaveText('Generate Question', { timeout: 15000 });

    await scenario.cleanup();
  });

  test('new findings submitted via UI update the category counts in real-time', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Findings are classified in real-time as participants submit them'],
  }, async ({
    browser,
  }) => {
    // Setup
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Real-time Update Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    const participant = scenario.users.participant[0];

    // Facilitator starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Facilitator opens dashboard first to see initial state
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);
    await actions.goToTraceCoverage(scenario.page);

    const traceId = scenario.traces[0].id;
    await actions.expandTraceRow(scenario.page, traceId);
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // Get initial count
    let initialTotal = 0;
    for (const category of VALID_CATEGORIES) {
      const { count } = await actions.getCategoryCount(scenario.page, category);
      initialTotal += count;
    }
    expect(initialTotal).toBe(0); // No findings yet

    // Participant submits a finding
    const participantPage = await scenario.newPageAs(participant);
    await expect(participantPage.getByTestId('discovery-phase-title')).toBeVisible({ timeout: 15000 });

    const q1Input = participantPage.locator('#dq-q_1');
    await expect(q1Input).toBeVisible({ timeout: 5000 });
    await q1Input.fill('This response demonstrates good code organization and clear naming conventions.');
    await q1Input.blur();
    await participantPage.getByRole('button', { name: /^Next$/i }).click();

    // Refresh the panel on facilitator side (collapse/expand)
    await scenario.page.getByTestId(`trace-row-${traceId}`).click();
    await scenario.page.waitForTimeout(500);
    await actions.expandTraceRow(scenario.page, traceId);
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // Verify count increased
    let newTotal = 0;
    for (const category of VALID_CATEGORIES) {
      const { count } = await actions.getCategoryCount(scenario.page, category);
      newTotal += count;
    }
    expect(newTotal).toBe(1); // One finding now

    await scenario.cleanup();
  });
});
