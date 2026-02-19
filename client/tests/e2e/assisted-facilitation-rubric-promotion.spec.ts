/**
 * E2E Tests for Assisted Facilitation v2 - Draft Rubric Promotion
 *
 * Tests the facilitation workflow for promoting findings to rubric candidates
 * and managing the draft rubric staging area.
 *
 * These tests verify UI interactions and state changes rather than just API responses.
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib/scenario-builder';
import { WorkshopPhase } from '../lib/types';
import * as actions from '../lib/actions';

const VALID_CATEGORIES = actions.DISCOVERY_CATEGORIES;

test.describe.skip('Assisted Facilitation v2 - Draft Rubric Promotion', {
  tag: ['@spec:ASSISTED_FACILITATION_SPEC'],
}, () => {
  test('facilitator can promote individual findings via the UI promote button', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Findings can be promoted to draft rubric staging area'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop with findings ready for promotion
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'UI Finding Promotion Workflow' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    const participant = scenario.users.participant[0];

    // Facilitator logs in and starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Submit findings via v2 API
    const traceId = scenario.traces[0].id;
    await scenario.page.request.post(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings-v2`,
      {
        data: {
          trace_id: traceId,
          user_id: participant.id,
          text: 'Excellent error handling with descriptive messages.',
        },
      }
    );

    await scenario.page.request.post(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings-v2`,
      {
        data: {
          trace_id: traceId,
          user_id: participant.id,
          text: 'Clear variable naming and code organization.',
        },
      }
    );

    // Navigate to the facilitator dashboard
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);

    // Go to Trace Coverage and expand the trace
    await actions.goToTraceCoverage(scenario.page);
    await actions.expandTraceRow(scenario.page, traceId);
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // Find a category with findings and promote one via UI button
    let promoted = false;
    for (const category of VALID_CATEGORIES) {
      const { count } = await actions.getCategoryCount(scenario.page, category);
      if (count > 0) {
        // Check if finding is not already promoted
        const isAlreadyPromoted = await actions.isFindingPromoted(scenario.page, category, 0);
        if (!isAlreadyPromoted) {
          // Click the Promote button
          await actions.promoteFindingInUI(scenario.page, category, 0);
          promoted = true;

          // SPEC REQUIREMENT: After promotion, the button should show "Promoted"
          const isNowPromoted = await actions.isFindingPromoted(scenario.page, category, 0);
          expect(isNowPromoted).toBe(true);
          break;
        }
      }
    }

    expect(promoted).toBe(true);

    await scenario.cleanup();
  });

  test('promote button changes to "Promoted" state after clicking', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Findings can be promoted to draft rubric staging area'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop with findings
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Promote Button State Test' })
      .withFacilitator()
      .withParticipants(2)
      .withTraces(2)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    const participants = scenario.users.participant;

    // Facilitator logs in and starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Submit findings from multiple participants
    const traceId = scenario.traces[0].id;
    for (const participant of participants) {
      await scenario.page.request.post(
        `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings-v2`,
        {
          data: {
            trace_id: traceId,
            user_id: participant.id,
            text: `Response demonstrates solid understanding of the problem from ${participant.name}.`,
          },
        }
      );
    }

    // Navigate to facilitator dashboard
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);
    await actions.goToTraceCoverage(scenario.page);
    await actions.expandTraceRow(scenario.page, traceId);
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // Find a category with findings
    for (const category of VALID_CATEGORIES) {
      const { count } = await actions.getCategoryCount(scenario.page, category);
      if (count > 0) {
        // Get the findings container
        const findingsContainer = scenario.page.getByTestId(`category-${category}-findings`);
        await expect(findingsContainer).toBeVisible();

        // Get the promote button
        const promoteBtn = findingsContainer.getByTestId('promote-finding-btn').first();
        await expect(promoteBtn).toBeVisible();

        // Verify button starts with "Promote" text
        await expect(promoteBtn).toHaveText('Promote');

        // Click the button
        await promoteBtn.click();

        // Verify button now shows "Promoted" text
        await expect(promoteBtn).toHaveText('Promoted', { timeout: 5000 });

        // Verify button is now disabled
        await expect(promoteBtn).toBeDisabled();

        break;
      }
    }

    await scenario.cleanup();
  });

  test('findings show user attribution badges in the category sections', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Findings can be promoted to draft rubric staging area'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop with multi-trace, multi-participant setup
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Finding Attribution Test' })
      .withFacilitator()
      .withParticipants(2)
      .withTraces(3)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    const participants = scenario.users.participant;

    // Facilitator starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Submit findings from different participants
    const traceId = scenario.traces[0].id;
    for (let i = 0; i < participants.length; i++) {
      await scenario.page.request.post(
        `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings-v2`,
        {
          data: {
            trace_id: traceId,
            user_id: participants[i].id,
            text: `Finding ${i + 1}: Well-thought-out approach to the problem.`,
          },
        }
      );
    }

    // Navigate to facilitator dashboard
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);
    await actions.goToTraceCoverage(scenario.page);
    await actions.expandTraceRow(scenario.page, traceId);
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // SPEC REQUIREMENT: Findings show user attribution
    // Find a category with findings and verify user ID badges are displayed
    for (const category of VALID_CATEGORIES) {
      const { count } = await actions.getCategoryCount(scenario.page, category);
      if (count > 0) {
        const findingsContainer = scenario.page.getByTestId(`category-${category}-findings`);
        await expect(findingsContainer).toBeVisible();

        // Verify user ID badges are present
        const userBadges = findingsContainer.getByTestId('finding-user-id');
        const badgeCount = await userBadges.count();
        expect(badgeCount).toBeGreaterThan(0);

        // Verify at least one badge contains a user ID substring
        const firstBadgeText = await userBadges.first().textContent();
        expect(firstBadgeText?.length).toBeGreaterThan(0);

        break;
      }
    }

    await scenario.cleanup();
  });

  test('multiple findings can be promoted from different categories', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Findings can be promoted to draft rubric staging area'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop with two facilitators (not typical, but test multi-user promotion)
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Multi-Finding Promotion Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(3)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    const participant = scenario.users.participant[0];

    // Facilitator logs in and starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Submit findings with different category targets
    const traceId = scenario.traces[0].id;

    // Themes-focused finding
    await scenario.page.request.post(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings-v2`,
      {
        data: {
          trace_id: traceId,
          user_id: participant.id,
          text: 'Clean separation of concerns and good architecture.',
        },
      }
    );

    // Missing info finding
    await scenario.page.request.post(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings-v2`,
      {
        data: {
          trace_id: traceId,
          user_id: participant.id,
          text: 'Missing documentation about the API contract.',
        },
      }
    );

    // Edge case finding
    await scenario.page.request.post(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings-v2`,
      {
        data: {
          trace_id: traceId,
          user_id: participant.id,
          text: 'Edge case handling for unicode characters is incomplete.',
        },
      }
    );

    // Navigate to facilitator dashboard
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);
    await actions.goToTraceCoverage(scenario.page);
    await actions.expandTraceRow(scenario.page, traceId);
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // Promote findings from different categories
    let promotedCount = 0;
    for (const category of VALID_CATEGORIES) {
      const { count } = await actions.getCategoryCount(scenario.page, category);
      if (count > 0) {
        const isAlreadyPromoted = await actions.isFindingPromoted(scenario.page, category, 0);
        if (!isAlreadyPromoted) {
          await actions.promoteFindingInUI(scenario.page, category, 0);
          promotedCount++;
        }
      }
    }

    // Should have promoted at least 2 findings
    expect(promotedCount).toBeGreaterThanOrEqual(2);

    await scenario.cleanup();
  });

  test('category sections show correct finding counts in badges', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Findings can be promoted to draft rubric staging area'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop in rubric phase
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Finding Count Badge Test' })
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

    const traceId = scenario.traces[0].id;

    // Submit 3 findings
    for (let i = 0; i < 3; i++) {
      await scenario.page.request.post(
        `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings-v2`,
        {
          data: {
            trace_id: traceId,
            user_id: participant.id,
            text: `Finding ${i + 1}: Response demonstrates problem understanding.`,
          },
        }
      );
    }

    // Navigate to facilitator dashboard
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);
    await actions.goToTraceCoverage(scenario.page);
    await actions.expandTraceRow(scenario.page, traceId);
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // Verify total findings across categories matches what we submitted
    let totalCount = 0;
    for (const category of VALID_CATEGORIES) {
      const { count, threshold } = await actions.getCategoryCount(scenario.page, category);
      totalCount += count;

      // Verify threshold is a positive number
      expect(threshold).toBeGreaterThan(0);
    }

    // All 3 findings should be distributed across categories
    expect(totalCount).toBe(3);

    await scenario.cleanup();
  });

  test('promoted findings remain marked after page navigation', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Findings can be promoted to draft rubric staging area'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Promotion Persistence Test' })
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

    // Submit a finding
    const traceId = scenario.traces[0].id;
    await scenario.page.request.post(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings-v2`,
      {
        data: {
          trace_id: traceId,
          user_id: participant.id,
          text: 'Important finding about code quality that should be promoted.',
        },
      }
    );

    // Navigate to facilitator dashboard
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);
    await actions.goToTraceCoverage(scenario.page);
    await actions.expandTraceRow(scenario.page, traceId);
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // Find and promote a finding
    let promotedCategory: (typeof VALID_CATEGORIES)[number] | null = null;
    for (const category of VALID_CATEGORIES) {
      const { count } = await actions.getCategoryCount(scenario.page, category);
      if (count > 0) {
        await actions.promoteFindingInUI(scenario.page, category, 0);
        promotedCategory = category;
        break;
      }
    }

    expect(promotedCategory).not.toBeNull();

    // Collapse the trace panel
    await scenario.page.getByTestId(`trace-row-${traceId}`).click();
    await scenario.page.waitForTimeout(500);

    // Re-expand the trace
    await actions.expandTraceRow(scenario.page, traceId);
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // Verify the finding is still marked as promoted
    const isStillPromoted = await actions.isFindingPromoted(scenario.page, promotedCategory!, 0);
    expect(isStillPromoted).toBe(true);

    await scenario.cleanup();
  });

  test('category progress bars update after new findings are submitted', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Findings can be promoted to draft rubric staging area'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Progress Bar Update Test' })
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

    // Navigate to facilitator dashboard first to get initial state
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);
    await actions.goToTraceCoverage(scenario.page);

    const traceId = scenario.traces[0].id;
    await actions.expandTraceRow(scenario.page, traceId);
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // Get initial total count
    let initialTotal = 0;
    for (const category of VALID_CATEGORIES) {
      const { count } = await actions.getCategoryCount(scenario.page, category);
      initialTotal += count;
    }

    // Submit a new finding
    await scenario.page.request.post(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings-v2`,
      {
        data: {
          trace_id: traceId,
          user_id: participant.id,
          text: 'New finding: API response time is excellent.',
        },
      }
    );

    // Collapse and re-expand to refresh the panel
    await scenario.page.getByTestId(`trace-row-${traceId}`).click();
    await scenario.page.waitForTimeout(500);
    await actions.expandTraceRow(scenario.page, traceId);
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // Get new total count
    let newTotal = 0;
    for (const category of VALID_CATEGORIES) {
      const { count } = await actions.getCategoryCount(scenario.page, category);
      newTotal += count;
    }

    // Total should have increased by 1
    expect(newTotal).toBe(initialTotal + 1);

    await scenario.cleanup();
  });
});
