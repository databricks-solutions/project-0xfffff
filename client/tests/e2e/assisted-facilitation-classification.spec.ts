/**
 * E2E Tests for Assisted Facilitation v2 - Classification & Disagreements
 *
 * Tests the real-time classification of findings into categories and
 * automatic disagreement detection between participants.
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib/scenario-builder';

/** Valid finding categories per spec */
const VALID_CATEGORIES = [
  'themes',
  'edge_cases',
  'boundary_conditions',
  'failure_modes',
  'missing_info',
] as const;

type FindingCategory = (typeof VALID_CATEGORIES)[number];

/** Type for classified finding (v2 spec requirement) */
interface ClassifiedFinding {
  id: string;
  trace_id: string;
  user_id: string;
  text: string;
  category: FindingCategory;
  question_id: string;
  promoted: boolean;
  created_at?: string;
}

/** Type for disagreement detection result */
interface Disagreement {
  id: string;
  trace_id: string;
  user_ids: string[];
  finding_ids: string[];
  summary: string;
  created_at?: string;
}

/** Type for trace discovery state (facilitator view) */
interface TraceDiscoveryState {
  trace_id: string;
  categories: Record<FindingCategory, ClassifiedFinding[]>;
  disagreements: Disagreement[];
  questions: Array<{ id: string; prompt: string }>;
  thresholds: Record<FindingCategory, number>;
}

test.describe('Assisted Facilitation v2 - Classification & Disagreements', {
  tag: ['@spec:ASSISTED_FACILITATION_SPEC'],
}, () => {
  test('findings are classified into correct categories', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Findings are classified in real-time as participants submit them'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop with participants
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Classification Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(5)
      .inPhase('discovery')
      .withRealApi()
      .build();

    const participant = scenario.users.participant[0];

    // Facilitator starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Participant submits various findings that should be classified
    const testPage = await scenario.newPageAs(participant);

    // Wait for discovery phase to load
    await expect(testPage.getByTestId('discovery-phase-title')).toBeVisible({ timeout: 15000 });

    // Define test findings with expected categories
    const testFindings = [
      {
        text: 'This solution provides excellent clarity and maintainability.',
        expectedCategory: 'themes' as FindingCategory,
      },
      {
        text: 'Missing validation for null input parameters.',
        expectedCategory: 'missing_info' as FindingCategory,
      },
      {
        text: 'The code crashes when receiving empty arrays.',
        expectedCategory: 'failure_modes' as FindingCategory,
      },
      {
        text: 'Works well at typical sizes but needs optimization for boundary values.',
        expectedCategory: 'boundary_conditions' as FindingCategory,
      },
      {
        text: 'Doesnt handle the unusual case of mixed-type input arrays.',
        expectedCategory: 'edge_cases' as FindingCategory,
      },
    ];

    // Submit findings via v2 API endpoint (which supports classification)
    const submittedFindings: ClassifiedFinding[] = [];
    for (const testFinding of testFindings) {
      const response = await testPage.request.post(
        `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings-v2`,
        {
          data: {
            trace_id: scenario.traces[submittedFindings.length % scenario.traces.length].id,
            user_id: participant.id,
            text: testFinding.text,
          },
        }
      );
      expect(response.ok(), `Failed to submit finding: ${await response.text()}`).toBe(true);
      const finding = await response.json() as ClassifiedFinding;
      submittedFindings.push(finding);
    }

    // SPEC REQUIREMENT: Findings must have a category field
    for (const finding of submittedFindings) {
      expect(finding).toHaveProperty('category');
      expect(VALID_CATEGORIES).toContain(finding.category);
    }

    // SPEC REQUIREMENT: Classification should be accurate (at least for clear cases)
    // Verify at least the "missing_info" finding is classified correctly
    const missingInfoFinding = submittedFindings.find(f =>
      f.text.toLowerCase().includes('missing validation')
    );
    expect(missingInfoFinding).toBeDefined();
    expect(missingInfoFinding!.category).toBe('missing_info');

    // Verify the "failure_modes" finding is classified correctly
    const failureFinding = submittedFindings.find(f =>
      f.text.toLowerCase().includes('crashes')
    );
    expect(failureFinding).toBeDefined();
    expect(failureFinding!.category).toBe('failure_modes');

    // SPEC REQUIREMENT: Findings must be persisted with classification
    // Query the trace discovery state to verify findings are stored with categories
    const traceId = scenario.traces[0].id;
    const stateResponse = await testPage.request.get(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/traces/${traceId}/discovery-state`
    );
    expect(stateResponse.ok()).toBe(true);
    const state = await stateResponse.json() as TraceDiscoveryState;

    // Verify the state has categories with findings
    expect(state).toHaveProperty('categories');
    const totalClassifiedFindings = Object.values(state.categories)
      .reduce((sum, findings) => sum + findings.length, 0);
    expect(totalClassifiedFindings).toBeGreaterThan(0);

    await scenario.cleanup();
  });

  test('disagreements are detected between participants with conflicting views', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Disagreements are auto-detected and surfaced'],
  }, async ({ browser }) => {
      // Setup: Create workshop with 2 participants on same traces
      const scenario = await TestScenario.create(browser)
        .withWorkshop({ name: 'Disagreement Detection Test' })
        .withFacilitator()
        .withParticipants(2)
        .withTraces(3)
        .inPhase('discovery')
        .withRealApi()
        .build();

      const participant1 = scenario.users.participant[0];
      const participant2 = scenario.users.participant[1];
      const traceId = scenario.traces[0].id;

      // Facilitator starts discovery
      await scenario.loginAs(scenario.facilitator);
      await scenario.beginDiscovery();

      // Submit conflicting findings on the SAME trace via v2 API
      // Participant 1: Positive view
      const response1 = await scenario.page.request.post(
        `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings-v2`,
        {
          data: {
            trace_id: traceId,
            user_id: participant1.id,
            text: 'Excellent code quality with great error handling. The response is comprehensive and accurate.',
          },
        }
      );
      expect(response1.ok()).toBe(true);

      // Participant 2: Negative view on SAME trace
      const response2 = await scenario.page.request.post(
        `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings-v2`,
        {
          data: {
            trace_id: traceId,
            user_id: participant2.id,
            text: 'Poor quality response with significant errors. Missing critical information and inaccurate.',
          },
        }
      );
      expect(response2.ok()).toBe(true);

      // SPEC REQUIREMENT: Disagreements are auto-detected and surfaced
      // Query the trace discovery state to check for disagreements
      const stateResponse = await scenario.page.request.get(
        `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/traces/${traceId}/discovery-state`
      );
      expect(stateResponse.ok()).toBe(true);
      const state = await stateResponse.json() as TraceDiscoveryState;

      // Verify disagreements array exists and has detected conflicts
      expect(state).toHaveProperty('disagreements');
      expect(Array.isArray(state.disagreements)).toBe(true);

      // SPEC REQUIREMENT: At least one disagreement should be detected
      // when participants have clearly conflicting views on the same trace
      expect(state.disagreements.length).toBeGreaterThan(0);

      // Verify disagreement structure per spec
      const disagreement = state.disagreements[0];
      expect(disagreement).toHaveProperty('id');
      expect(disagreement).toHaveProperty('trace_id');
      expect(disagreement).toHaveProperty('user_ids');
      expect(disagreement).toHaveProperty('finding_ids');
      expect(disagreement).toHaveProperty('summary');

      // Verify the disagreement involves both participants
      expect(disagreement.user_ids).toContain(participant1.id);
      expect(disagreement.user_ids).toContain(participant2.id);

      // Verify the summary describes the conflict
      expect(disagreement.summary.length).toBeGreaterThan(0);

      await scenario.cleanup();
    }
  );

  test('category coverage is tracked across participants', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Facilitators see per-trace structured view with category breakdown'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop where participants cover different categories
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Category Coverage Test' })
      .withFacilitator()
      .withParticipants(2)
      .withTraces(3)
      .inPhase('discovery')
      .withRealApi()
      .build();

    const p1 = scenario.users.participant[0];
    const p2 = scenario.users.participant[1];
    const traceId = scenario.traces[0].id;

    // Facilitator starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Submit findings via v2 API with clear category-targeted text
    // Participant 1: Themes-focused findings
    await scenario.page.request.post(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings-v2`,
      {
        data: {
          trace_id: traceId,
          user_id: p1.id,
          text: 'The overall code structure demonstrates good organization and clarity.',
        },
      }
    );

    // Participant 2: Edge case-focused findings
    await scenario.page.request.post(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings-v2`,
      {
        data: {
          trace_id: traceId,
          user_id: p2.id,
          text: 'Unusual edge case: what happens with unicode input or empty strings?',
        },
      }
    );

    // Participant 2: Missing info finding
    await scenario.page.request.post(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings-v2`,
      {
        data: {
          trace_id: traceId,
          user_id: p2.id,
          text: 'Missing documentation about error handling behavior.',
        },
      }
    );

    // SPEC REQUIREMENT: Facilitators see per-trace structured view with category breakdown
    const stateResponse = await scenario.page.request.get(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/traces/${traceId}/discovery-state`
    );
    expect(stateResponse.ok()).toBe(true);
    const state = await stateResponse.json() as TraceDiscoveryState;

    // Verify structured category view exists
    expect(state).toHaveProperty('categories');
    expect(state.categories).toHaveProperty('themes');
    expect(state.categories).toHaveProperty('edge_cases');
    expect(state.categories).toHaveProperty('boundary_conditions');
    expect(state.categories).toHaveProperty('failure_modes');
    expect(state.categories).toHaveProperty('missing_info');

    // Verify each category is an array
    for (const category of VALID_CATEGORIES) {
      expect(Array.isArray(state.categories[category])).toBe(true);
    }

    // SPEC REQUIREMENT: Findings are grouped by category
    // At least one category should have findings
    const totalFindings = Object.values(state.categories)
      .reduce((sum, findings) => sum + findings.length, 0);
    expect(totalFindings).toBeGreaterThanOrEqual(3);

    // Verify findings in categories have user attribution
    const allFindings = Object.values(state.categories).flat();
    const uniqueUsers = new Set(allFindings.map(f => f.user_id));
    expect(uniqueUsers.size).toBe(2);

    // SPEC REQUIREMENT: Each finding shows user attribution
    for (const finding of allFindings) {
      expect(finding).toHaveProperty('user_id');
      expect(finding).toHaveProperty('text');
      expect(finding).toHaveProperty('category');
    }

    await scenario.cleanup();
  });

  test('findings are accessible with classification metadata', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Findings are classified in real-time as participants submit them'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Classification Metadata Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .inPhase('discovery')
      .withRealApi()
      .build();

    const participant = scenario.users.participant[0];
    const traceId = scenario.traces[0].id;

    // Facilitator starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Submit finding via v2 API (which should provide classification)
    const response = await scenario.page.request.post(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings-v2`,
      {
        data: {
          trace_id: traceId,
          user_id: participant.id,
          text: 'Missing error handling for timeout scenarios.',
        },
      }
    );
    expect(response.ok()).toBe(true);
    const finding = await response.json() as ClassifiedFinding;

    // SPEC REQUIREMENT: Findings must have classification metadata
    // Required fields per ClassifiedFinding spec
    expect(finding).toHaveProperty('trace_id');
    expect(finding).toHaveProperty('user_id');
    expect(finding).toHaveProperty('text');
    expect(finding).toHaveProperty('category');
    expect(finding).toHaveProperty('question_id');
    expect(finding).toHaveProperty('promoted');

    // Verify category is valid
    expect(VALID_CATEGORIES).toContain(finding.category);

    // Verify question_id follows spec format (q_1 for first question)
    expect(finding.question_id).toMatch(/^q_\d+$/);

    // Verify promoted defaults to false
    expect(finding.promoted).toBe(false);

    // SPEC REQUIREMENT: The finding should be classified as missing_info
    // based on the text "Missing error handling..."
    expect(finding.category).toBe('missing_info');

    await scenario.cleanup();
  });

  test('category thresholds guide participant discovery', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Thresholds are configurable per category per trace'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop with custom thresholds
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Threshold Guidance Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .inPhase('discovery')
      .withRealApi()
      .build();

    const traceId = scenario.traces[0].id;

    // Facilitator starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // SPEC REQUIREMENT: Thresholds are configurable per category per trace
    const customThresholds: Record<FindingCategory, number> = {
      themes: 3,
      edge_cases: 2,
      boundary_conditions: 2,
      failure_modes: 2,
      missing_info: 1,
    };

    const response = await scenario.page.request.put(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/traces/${traceId}/thresholds`,
      { data: { thresholds: customThresholds } }
    );

    // Endpoint MUST exist and work per spec
    expect(response.ok(), `Threshold update failed: ${await response.text()}`).toBe(true);

    // Verify thresholds were saved by querying discovery state
    const stateResponse = await scenario.page.request.get(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/traces/${traceId}/discovery-state`
    );
    expect(stateResponse.ok()).toBe(true);
    const state = await stateResponse.json() as TraceDiscoveryState;

    // SPEC REQUIREMENT: State must include thresholds
    expect(state).toHaveProperty('thresholds');
    expect(typeof state.thresholds).toBe('object');

    // Verify thresholds match what we set
    for (const [category, threshold] of Object.entries(customThresholds)) {
      expect(state.thresholds[category as FindingCategory]).toBe(threshold);
    }

    // SPEC REQUIREMENT: Progress bars show count / threshold
    // Verify the structure supports this by checking categories have arrays
    // and thresholds have numbers
    for (const category of VALID_CATEGORIES) {
      expect(Array.isArray(state.categories[category])).toBe(true);
      expect(typeof state.thresholds[category]).toBe('number');
    }

    await scenario.cleanup();
  });

  test('api endpoint provides findings with required classification', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Findings are classified in real-time as participants submit them'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'API Findings Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .inPhase('discovery')
      .withRealApi()
      .build();

    const participant = scenario.users.participant[0];
    const traceId = scenario.traces[0].id;

    // Facilitator starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Submit finding via v2 API
    const submitResponse = await scenario.page.request.post(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings-v2`,
      {
        data: {
          trace_id: traceId,
          user_id: participant.id,
          text: 'This handles edge cases appropriately.',
        },
      }
    );
    expect(submitResponse.ok()).toBe(true);

    // SPEC REQUIREMENT: Query discovery state to get classified findings
    const stateResponse = await scenario.page.request.get(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/traces/${traceId}/discovery-state`
    );
    expect(stateResponse.ok()).toBe(true);
    const state = await stateResponse.json() as TraceDiscoveryState;

    // Find the submitted finding in the categorized structure
    const allFindings = Object.values(state.categories).flat();
    expect(allFindings.length).toBeGreaterThan(0);

    const finding = allFindings.find(f => f.text.includes('edge cases'));
    expect(finding).toBeDefined();

    // SPEC REQUIREMENT: All findings must have classification
    expect(finding!).toHaveProperty('id');
    expect(finding!).toHaveProperty('trace_id');
    expect(finding!).toHaveProperty('user_id');
    expect(finding!).toHaveProperty('text');
    expect(finding!).toHaveProperty('category');

    // Verify category is valid
    expect(VALID_CATEGORIES).toContain(finding!.category);

    // This finding should be classified as edge_cases based on content
    expect(finding!.category).toBe('edge_cases');

    await scenario.cleanup();
  });
});
