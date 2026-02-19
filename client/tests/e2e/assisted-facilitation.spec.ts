/**
 * E2E Tests for Assisted Facilitation Flow
 *
 * Tests the core participant and facilitator workflows for discovery phase,
 * including finding submission, classification display, and progress tracking.
 *
 * These tests verify UI behavior rather than just API responses.
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib/scenario-builder';
import { UserRole, WorkshopPhase } from '../lib/types';
import * as actions from '../lib/actions';

// This repo doesn't include Node typings in the client TS config; keep `process.env` without adding deps.
declare const process: { env: Record<string, string | undefined> };

const FACILITATOR_EMAIL =
  process.env.E2E_FACILITATOR_EMAIL ?? 'facilitator123@email.com';
const FACILITATOR_PASSWORD =
  process.env.E2E_FACILITATOR_PASSWORD ?? 'facilitator123';
const API_URL = process.env.E2E_API_URL ?? 'http://127.0.0.1:8000';

const VALID_CATEGORIES = actions.DISCOVERY_CATEGORIES;

// Inline fixtures (avoid Node `fs/path` imports; repo client TS config doesn't include Node typings).
// Keep these intentionally small but diverse: one per discovery category.
const syntheticTraces = [
  {
    input:
      'Review this function and suggest improvements:\n```python\ndef process(d):\n    r = []\n    for i in d:\n        if i > 0:\n            r.append(i * 2)\n    return r\n```',
    output:
      'Here are some improvements for readability and clarity:\n\n```python\ndef double_positive_numbers(numbers: list[int]) -> list[int]:\n    """Return a list of positive numbers doubled."""\n    return [num * 2 for num in numbers if num > 0]\n```',
    context: {
      target_categories: ['themes'],
      difficulty: 'easy',
      rationale: 'General maintainability / readability improvements',
    },
  },
  {
    input:
      "This JSON parser breaks on some inputs. Can you fix it?\n```python\nimport json\n\ndef parse_config(config_str):\n    return json.loads(config_str)\n```",
    output:
      "Handle empty input and unicode BOM prefix before json.loads(). Mention malformed JSON as a follow-up.",
    context: {
      target_categories: ['edge_cases'],
      difficulty: 'medium',
      rationale: 'Edge cases: empty string, BOM, malformed JSON',
    },
  },
  {
    input:
      'Is there a bug in this pagination function?\n```python\ndef get_page(items, page_num, page_size=10):\n    start = page_num * page_size\n    end = start + page_size\n    return items[start:end]\n```',
    output:
      'Discuss 0-index vs 1-index, validate bounds, and show the 1-index fix using (page_num - 1).',
    context: {
      target_categories: ['boundary_conditions'],
      difficulty: 'easy',
      rationale: 'Boundary condition: off-by-one indexing',
    },
  },
  {
    input:
      'Why does this SQL query sometimes return wrong results?\n```python\ndef get_user(db, username):\n    query = f"SELECT * FROM users WHERE username = \'{username}\'"\n    return db.execute(query).fetchone()\n```',
    output:
      'Explain SQL injection risk and fix with parameterized query.',
    context: {
      target_categories: ['failure_modes'],
      difficulty: 'medium',
      rationale: 'Failure mode: SQL injection vulnerability',
    },
  },
  {
    input: 'Write a function to validate an email address.',
    output:
      'Ask clarifying questions about requirements (DNS, international, signup vs validation) and provide a simple baseline.',
    context: {
      target_categories: ['missing_info'],
      difficulty: 'medium',
      rationale: 'Missing info: requirements are underspecified',
    },
  },
  {
    input:
      'Should I use a class or functions for this data processing pipeline?\n```python\n# Current approach with functions:\ndef load_data(path): ...\ndef clean_data(df): ...\ndef transform_data(df): ...\ndef save_data(df, path): ...\n```',
    output:
      'Compare trade-offs and say both can be valid depending on scale/config/state.',
    context: {
      target_categories: ['disagreements'],
      difficulty: 'hard',
      rationale: 'Disagreements: multiple valid design approaches',
    },
  },
] as Array<{
  input: string;
  output: string;
  context: {
    target_categories: string[];
    difficulty: string;
    rationale: string;
  };
}>;

test.describe.skip('Assisted Facilitation Flow', {
  tag: ['@spec:ASSISTED_FACILITATION_SPEC'],
}, () => {
  test('participants can submit findings and see discovery phase UI', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Findings are classified in real-time as participants submit them'],
  }, async ({ page, browser }) => {
    const runId = `${Date.now()}`;
    const participantEmail = `e2e-assisted-participant-${runId}@example.com`;
    const participantName = `E2E Assisted Participant ${runId}`;

    // Create scenario with real API
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: `E2E Assisted UI ${runId}` })
      .withFacilitator()
      .withTraces(3)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    // Facilitator starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Create participant via API
    const participantCreateResp = await scenario.page.request.post(`${API_URL}/users/`, {
      headers: { 'Content-Type': 'application/json' },
      data: {
        email: participantEmail,
        name: participantName,
        role: UserRole.PARTICIPANT,
        workshop_id: scenario.workshop.id,
      },
    });
    expect(participantCreateResp.ok(), 'participant create should succeed').toBeTruthy();
    const participant = await participantCreateResp.json() as { id: string };

    // Participant logs in via a new page
    const participantPage = await scenario.newPageAs({
      id: participant.id,
      email: participantEmail,
      name: participantName,
      role: UserRole.PARTICIPANT,
      workshop_id: scenario.workshop.id,
    });

    // Verify participant sees discovery phase UI
    await expect(participantPage.getByTestId('discovery-phase-title')).toBeVisible({ timeout: 15000 });

    // Fill in the baseline question for each trace
    for (let i = 0; i < 3; i++) {
      const q1 = participantPage.locator('#dq-q_1');
      await expect(q1).toBeVisible({ timeout: 5000 });
      await q1.fill(`Insight for trace ${i + 1}: Clear structure; consider edge cases.`);
      // Trigger autosave (saving happens onBlur)
      await q1.blur();

      if (i < 2) {
        await participantPage.getByRole('button', { name: /^Next$/i }).click();
      } else {
        await participantPage.getByRole('button', { name: /^Complete$/i }).click();
      }
    }

    // Complete discovery phase via UI button
    const completeButton = participantPage.getByTestId('complete-discovery-phase-button');
    await expect(completeButton).toBeVisible({ timeout: 10000 });
    await completeButton.click();

    // Verify completion is reflected in UI - poll for completion status
    await expect
      .poll(async () => {
        const statusResp = await scenario.page.request.get(
          `${API_URL}/workshops/${scenario.workshop.id}/discovery-completion-status`,
        );
        if (!statusResp.ok()) return null;
        return statusResp.json();
      }, { timeout: 15000 })
      .toMatchObject({
        total_participants: 1,
        completed_participants: 1,
        all_completed: true,
      });

    await scenario.cleanup();
  });

  test('facilitator can view classified findings in the dashboard UI', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Facilitators see per-trace structured view with category breakdown'],
  }, async ({ browser }) => {
    const runId = `${Date.now()}`;

    // Create scenario
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: `E2E Summaries Test ${runId}` })
      .withFacilitator()
      .withParticipants(3)
      .withTraces(6)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    const participants = scenario.users.participant;

    // Facilitator starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Create diverse findings from multiple participants via v2 API
    const findingsData = [
      'Good naming conventions but could use more error handling for edge cases.',
      'The response addresses the main issue but misses boundary conditions like empty inputs.',
      'Clear explanation but I disagree with the approach - a different pattern would be more maintainable.',
    ];

    const traceId = scenario.traces[0].id;
    for (let i = 0; i < participants.length; i++) {
      const response = await scenario.page.request.post(
        `${API_URL}/workshops/${scenario.workshop.id}/findings-v2`,
        {
          headers: { 'Content-Type': 'application/json' },
          data: {
            trace_id: traceId,
            user_id: participants[i].id,
            text: findingsData[i % findingsData.length],
          },
        }
      );
      expect(response.ok()).toBeTruthy();
    }

    // Navigate to facilitator dashboard
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);

    // Verify the dashboard loads with monitoring view
    await expect(scenario.page.getByText(/Discovery Phase Monitoring/i)).toBeVisible({ timeout: 10000 });

    // Go to Trace Coverage and expand the trace to view classified findings
    await actions.goToTraceCoverage(scenario.page);
    await actions.expandTraceRow(scenario.page, traceId);
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // SPEC REQUIREMENT: Facilitators see per-trace structured view with category breakdown
    // Verify category coverage section is visible
    await expect(scenario.page.getByTestId('category-coverage-section')).toBeVisible();

    // Verify findings are distributed across categories
    let totalFindingsInUI = 0;
    for (const category of VALID_CATEGORIES) {
      const { count } = await actions.getCategoryCount(scenario.page, category);
      totalFindingsInUI += count;
    }
    expect(totalFindingsInUI).toBeGreaterThanOrEqual(3);

    await scenario.cleanup();
  });

  test('findings with user details are displayed in the dashboard', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Facilitators see per-trace structured view with category breakdown'],
  }, async ({ browser }) => {
    const runId = `${Date.now()}`;

    // Create scenario
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: `E2E Findings Details ${runId}` })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(1)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    const participant = scenario.users.participant[0];
    const traceId = scenario.traces[0].id;

    // Facilitator starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Submit finding via v2 API
    await scenario.page.request.post(
      `${API_URL}/workshops/${scenario.workshop.id}/findings-v2`,
      {
        headers: { 'Content-Type': 'application/json' },
        data: {
          trace_id: traceId,
          user_id: participant.id,
          text: 'Test insight for findings with user details.',
        },
      }
    );

    // Navigate to facilitator dashboard
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);

    // Go to Trace Coverage and expand the trace
    await actions.goToTraceCoverage(scenario.page);
    await actions.expandTraceRow(scenario.page, traceId);
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // SPEC REQUIREMENT: Each finding shows user attribution
    // Find a category with findings and verify user attribution is displayed
    for (const category of VALID_CATEGORIES) {
      const { count } = await actions.getCategoryCount(scenario.page, category);
      if (count > 0) {
        const findingsContainer = scenario.page.getByTestId(`category-${category}-findings`);
        await expect(findingsContainer).toBeVisible();

        // Verify user ID badge is present
        const userBadge = findingsContainer.getByTestId('finding-user-id').first();
        await expect(userBadge).toBeVisible();

        // Verify badge contains part of the user ID
        const badgeText = await userBadge.textContent();
        expect(badgeText?.length).toBeGreaterThan(0);

        break;
      }
    }

    await scenario.cleanup();
  });

  test('discovery progress is visible in facilitator dashboard', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Participants see only fuzzy progress (no category bias)'],
  }, async ({ browser }) => {
    const runId = `${Date.now()}`;

    // Create scenario with multiple participants and traces
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: `E2E Discovery Progress ${runId}` })
      .withFacilitator()
      .withParticipants(2)
      .withTraces(5)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    // Facilitator logs in and starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Navigate to facilitator dashboard
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);

    // Verify the Discovery Phase card is visible
    await expect(scenario.page.getByText(/Discovery Phase/i).first()).toBeVisible({ timeout: 10000 });

    // Verify progress metrics are displayed
    await expect(scenario.page.getByText(/Traces Analyzed/i)).toBeVisible();

    // Verify progress percentage is shown
    await expect(scenario.page.getByText(/%.*Complete/i)).toBeVisible();

    // Verify active users count is displayed
    await expect(scenario.page.getByText(/Active Users/i)).toBeVisible();

    await scenario.cleanup();
  });

  test('facilitator can access trace discovery panel for detailed view', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Facilitators see per-trace structured view with category breakdown'],
  }, async ({ browser }) => {
    const runId = `${Date.now()}`;

    // Create scenario
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: `E2E Trace Panel ${runId}` })
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

    // Submit findings via v2 API
    const traceId = scenario.traces[0].id;
    await scenario.page.request.post(
      `${API_URL}/workshops/${scenario.workshop.id}/findings-v2`,
      {
        data: {
          trace_id: traceId,
          user_id: participant.id,
          text: 'Good code structure with clear naming.',
        },
      }
    );

    // Navigate to facilitator dashboard
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);

    // Go to Trace Coverage
    await actions.goToTraceCoverage(scenario.page);

    // Expand the trace row
    await actions.expandTraceRow(scenario.page, traceId);

    // Verify TraceDiscoveryPanel is visible
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // Verify panel contains expected sections
    await expect(scenario.page.getByTestId('category-coverage-section')).toBeVisible();
    await expect(scenario.page.getByTestId('threshold-controls')).toBeVisible();
    await expect(scenario.page.getByTestId('generate-question-btn')).toBeVisible();

    // Verify all 5 categories are shown
    for (const category of VALID_CATEGORIES) {
      await expect(scenario.page.getByTestId(`category-${category}`)).toBeVisible();
    }

    await scenario.cleanup();
  });

  test('facilitator can interact with threshold controls', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Thresholds are configurable per category per trace'],
  }, async ({ browser }) => {
    const runId = `${Date.now()}`;

    // Create scenario
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: `E2E Threshold Controls ${runId}` })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .inPhase(WorkshopPhase.DISCOVERY)
      .withRealApi()
      .build();

    // Facilitator starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    const traceId = scenario.traces[0].id;

    // Navigate to facilitator dashboard
    await actions.goToFacilitatorDashboard(scenario.page, scenario.workshop.id, scenario.workshop.name);

    // Go to Trace Coverage and expand trace
    await actions.goToTraceCoverage(scenario.page);
    await actions.expandTraceRow(scenario.page, traceId);
    await actions.waitForTraceDiscoveryPanel(scenario.page);

    // Verify threshold inputs are visible and interactive
    const themesInput = scenario.page.getByTestId('threshold-input-themes');
    await expect(themesInput).toBeVisible();
    await expect(themesInput).toBeEditable();

    // Change threshold value
    await themesInput.fill('7');

    // Click update button
    const updateBtn = scenario.page.getByTestId('update-thresholds-btn');
    await expect(updateBtn).toBeVisible();
    await updateBtn.click();

    // Wait for update to complete
    await expect(updateBtn).toHaveText('Update Thresholds', { timeout: 5000 });

    // Verify the count badge reflects new threshold
    const { threshold } = await actions.getCategoryCount(scenario.page, 'themes');
    expect(threshold).toBe(7);

    await scenario.cleanup();
  });
});
