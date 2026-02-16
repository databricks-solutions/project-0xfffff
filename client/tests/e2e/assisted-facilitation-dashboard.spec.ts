/**
 * E2E Tests for Assisted Facilitation v2 - Facilitator Dashboard
 *
 * Tests the facilitator view for monitoring discovery progress and managing
 * category coverage, thresholds, and disagreements.
 *
 * These tests verify UI elements rather than API responses.
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib/scenario-builder';
import { WorkshopPhase } from '../lib/types';
import * as actions from '../lib/actions';
import * as discoveryActions from '../lib/actions/discovery';

const VALID_CATEGORIES = actions.DISCOVERY_CATEGORIES;

test.describe('Assisted Facilitation v2 - Facilitator Dashboard', {
  tag: ['@spec:ASSISTED_FACILITATION_SPEC'],
}, () => {
  test('facilitator can view trace discovery state with category coverage in the UI', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Facilitators see per-trace structured view with category breakdown'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop with findings across multiple categories
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Dashboard Category Coverage Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .withDiscoveryFinding({
        insight: 'This response handles edge cases well.',
        traceIndex: 0,
      })
      .withDiscoveryFinding({
        insight: 'Missing information about error handling.',
        traceIndex: 0,
      })
      .withDiscoveryFinding({
        insight: 'Good use of design patterns.',
        traceIndex: 1,
      })
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    // Facilitator logs in
    await scenario.loginAs(scenario.facilitator);

    // Navigate to the facilitator dashboard
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);

    // Verify the dashboard header is visible
    await expect(scenario.page.getByText('Discovery Phase Monitoring')).toBeVisible({ timeout: 10000 });

    // Verify the trace coverage section is accessible
    await actions.goToTraceCoverage(scenario.page);

    // Verify we see trace rows
    const traceCoverage = scenario.page.getByTestId('trace-coverage');
    await expect(traceCoverage).toBeVisible();

    // Verify we have trace rows for our traces
    const traceRows = traceCoverage.locator('[data-testid^="trace-row-"]');
    const rowCount = await traceRows.count();
    expect(rowCount).toBeGreaterThanOrEqual(1);

    await scenario.cleanup();
  });

  test('facilitator can view and update per-trace thresholds via the UI', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Thresholds are configurable per category per trace'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Dashboard Threshold Update Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(3)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    // Facilitator logs in and starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Navigate to the facilitator dashboard
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);

    // Go to Trace Coverage and expand the first trace
    await actions.goToTraceCoverage(scenario.page);
    const traceId = scenario.traces[0].id;
    await actions.expandTraceRow(scenario.page, traceId);
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // Verify threshold controls are visible
    await expect(scenario.page.getByTestId('threshold-controls')).toBeVisible();

    // Update a threshold
    const newThresholds: Record<string, number> = {
      themes: 5,
      edge_cases: 3,
      boundary_conditions: 2,
      failure_modes: 4,
      missing_info: 2,
    };

    // Update themes threshold via UI
    await actions.updateCategoryThreshold(scenario.page, 'themes', newThresholds.themes);

    // Verify the threshold was updated
    const { threshold } = await actions.getCategoryCount(scenario.page, 'themes');
    expect(threshold).toBe(newThresholds.themes);

    await scenario.cleanup();
  });

  test('facilitator can see generated questions interface', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Facilitators can generate targeted questions that broadcast to all participants'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop with some findings
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Dashboard Question Generation Test' })
      .withFacilitator()
      .withParticipants(2)
      .withTraces(3)
      .withDiscoveryFinding({
        insight: 'Code is well-organized.',
        traceIndex: 0,
      })
      .withDiscoveryFinding({
        insight: 'Handles positive cases.',
        traceIndex: 0,
      })
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    // Facilitator logs in and starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Navigate to the facilitator dashboard
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);

    // Go to Trace Coverage and expand the first trace
    await actions.goToTraceCoverage(scenario.page);
    const traceId = scenario.traces[0].id;
    await actions.expandTraceRow(scenario.page, traceId);
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // Verify the generate question button is visible
    const generateBtn = scenario.page.getByTestId('generate-question-btn');
    await expect(generateBtn).toBeVisible();
    await expect(generateBtn).toBeEnabled();

    // Verify the button has the correct label
    await expect(generateBtn).toHaveText('Generate Question');

    await scenario.cleanup();
  });

  test('facilitator dashboard shows multiple participants progress in the UI', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Facilitators see per-trace structured view with category breakdown'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop with multiple participants
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Dashboard Multi-Participant Test' })
      .withFacilitator()
      .withParticipants(3)
      .withTraces(5)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    const participants = scenario.users.participant;

    // Facilitator starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Each participant submits findings via v2 API (simulate concurrent submissions)
    for (let i = 0; i < participants.length; i++) {
      // Submit 2 findings per participant
      for (let j = 0; j < 2; j++) {
        await scenario.page.request.post(
          `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings-v2`,
          {
            data: {
              trace_id: scenario.traces[j % scenario.traces.length].id,
              user_id: participants[i].id,
              text: `Finding ${j + 1} from participant ${i + 1}: Good code structure.`,
            },
          }
        );
      }
    }

    // Navigate to the facilitator dashboard
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);

    // Verify the User Participation tab shows participant data
    const userParticipationTab = scenario.page.getByRole('tab', { name: /User Participation/i });
    await expect(userParticipationTab).toBeVisible();
    await userParticipationTab.click();

    // Verify participants appear in the user participation list
    // Each participant should have a user card showing their contribution
    await expect(scenario.page.getByText(/finding/i)).toBeVisible({ timeout: 10000 });

    await scenario.cleanup();
  });

  test('facilitator can promote findings to draft rubric via the UI', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Findings can be promoted to draft rubric staging area'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop with findings
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Dashboard Promotion Test' })
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

    // Submit findings via v2 API
    const traceId = scenario.traces[0].id;
    await scenario.page.request.post(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings-v2`,
      {
        data: {
          trace_id: traceId,
          user_id: participant.id,
          text: 'Excellent use of error handling and validation.',
        },
      }
    );

    await scenario.page.request.post(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings-v2`,
      {
        data: {
          trace_id: traceId,
          user_id: participant.id,
          text: 'Code could be more efficient with caching.',
        },
      }
    );

    // Navigate to the facilitator dashboard
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);

    // Go to Trace Coverage and expand the trace
    await actions.goToTraceCoverage(scenario.page);
    await actions.expandTraceRow(scenario.page, traceId);
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // Find a category with findings and promote one
    let promoted = false;
    for (const category of VALID_CATEGORIES) {
      const { count } = await actions.getCategoryCount(scenario.page, category);
      if (count > 0) {
        // Check if finding is not already promoted
        const isAlreadyPromoted = await actions.isFindingPromoted(scenario.page, category, 0);
        if (!isAlreadyPromoted) {
          await actions.promoteFindingInUI(scenario.page, category, 0);
          promoted = true;

          // Verify the finding is now marked as promoted
          const isNowPromoted = await actions.isFindingPromoted(scenario.page, category, 0);
          expect(isNowPromoted).toBe(true);
          break;
        }
      }
    }

    // If we had findings, we should have promoted one
    expect(promoted).toBe(true);

    await scenario.cleanup();
  });

  test('facilitator dashboard shows discovery progress metrics', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Participants see only fuzzy progress (no category bias)'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop with participants in discovery
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Dashboard Progress Metrics Test' })
      .withFacilitator()
      .withParticipants(2)
      .withTraces(10)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    // Facilitator logs in and starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Navigate to the facilitator dashboard
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);

    // Verify the Discovery Phase card shows progress
    const discoveryCard = scenario.page.locator('text=Discovery Phase').first();
    await expect(discoveryCard).toBeVisible({ timeout: 10000 });

    // Verify we can see the progress metrics (traces analyzed, etc.)
    await expect(scenario.page.getByText(/Traces Analyzed/i)).toBeVisible();

    // Verify the progress bar is visible
    const progressBar = scenario.page.locator('[role="progressbar"]').first();
    await expect(progressBar).toBeVisible();

    await scenario.cleanup();
  });

  test('facilitator sees appropriate view (not participant discovery view)', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Participants see only fuzzy progress (no category bias)'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Dashboard Facilitator View Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(3)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    // Facilitator logs in and starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Navigate to the discovery workflow step
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);

    // Facilitator should see the monitoring dashboard, NOT the participant discovery view
    // Look for facilitator-specific UI elements
    const monitoringHeading = scenario.page.getByText(/Discovery Phase Monitoring/i);
    await expect(monitoringHeading).toBeVisible({ timeout: 10000 });

    // Verify facilitator does NOT see the participant discovery title
    const participantDiscoveryTitle = scenario.page.getByTestId('discovery-phase-title');
    const isParticipantViewVisible = await participantDiscoveryTitle.isVisible().catch(() => false);
    expect(isParticipantViewVisible).toBe(false);

    // Verify we see facilitator-specific elements like "Quick Actions" or "Workshop Analysis"
    const facilityControls = scenario.page.getByText(/Quick Actions|Workshop Analysis/i);
    await expect(facilityControls.first()).toBeVisible();

    await scenario.cleanup();
  });

  test('trace coverage UI shows review status badges', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Facilitators see per-trace structured view with category breakdown'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop with some findings
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Dashboard Trace Status Test' })
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

    // Submit findings for one trace via v2 API
    const traceId = scenario.traces[0].id;
    for (const participant of participants) {
      await scenario.page.request.post(
        `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings-v2`,
        {
          data: {
            trace_id: traceId,
            user_id: participant.id,
            text: `Finding from ${participant.name}: Code looks good.`,
          },
        }
      );
    }

    // Navigate to the facilitator dashboard
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);

    // Go to Trace Coverage
    await actions.goToTraceCoverage(scenario.page);

    // Verify trace rows show review count badges
    const traceCoverage = scenario.page.getByTestId('trace-coverage');
    await expect(traceCoverage).toBeVisible();

    // Verify we can see review count badges (e.g., "2 reviews", "2 reviewers")
    await expect(traceCoverage.getByText(/review/i).first()).toBeVisible({ timeout: 10000 });

    // Verify status text appears (Complete, In Progress, or Pending)
    await expect(traceCoverage.locator('.status-text').first()).toBeVisible();

    await scenario.cleanup();
  });
});
