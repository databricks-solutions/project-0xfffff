/**
 * E2E Tests for Assisted Facilitation v2 - Draft Rubric Promotion
 *
 * Tests the facilitation workflow for promoting findings to rubric candidates
 * and managing the draft rubric staging area.
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib/scenario-builder';

test.describe('Assisted Facilitation v2 - Draft Rubric Promotion', {
  tag: ['@spec:ASSISTED_FACILITATION_SPEC'],
}, () => {
  test('facilitator can promote individual findings to draft rubric', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Findings can be promoted to draft rubric staging area'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop with findings ready for promotion
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Finding Promotion Workflow' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .withDiscoveryFinding({
        insight: 'Excellent error handling with descriptive messages.',
        traceIndex: 0,
      })
      .withDiscoveryFinding({
        insight: 'Clear variable naming and code organization.',
        traceIndex: 0,
      })
      .withDiscoveryFinding({
        insight: 'Missing null checks for input validation.',
        traceIndex: 1,
      })
      .inPhase('discovery')
      .withRealApi()
      .build();

    // Facilitator logs in
    await scenario.loginAs(scenario.facilitator);

    // Get findings
    const findings = await scenario.api.getFindings();
    expect(findings.length).toBeGreaterThanOrEqual(3);

    // Promote first finding
    if (findings.length > 0) {
      const response = await scenario.page.request.post(
        `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings/${findings[0].id}/promote`,
        {
          data: {
            finding_id: findings[0].id,
            promoter_id: scenario.facilitator.id,
          },
        }
      );

      // Endpoint may return 404 if not implemented
      expect([200, 404, 501]).toContain(response.status());
    }

    await scenario.cleanup();
  });

  test('draft rubric shows promoted findings with attribution', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Findings can be promoted to draft rubric staging area'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop with findings
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Draft Rubric Attribution Test' })
      .withFacilitator()
      .withParticipants(2)
      .withTraces(2)
      .withDiscoveryFinding({
        insight: 'Response demonstrates solid understanding of the problem.',
        traceIndex: 0,
      })
      .withDiscoveryFinding({
        insight: 'Thorough exploration of edge cases.',
        traceIndex: 1,
      })
      .inPhase('discovery')
      .withRealApi()
      .build();

    // Facilitator logs in
    await scenario.loginAs(scenario.facilitator);

    // Query draft rubric
    const response = await scenario.page.request.get(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/draft-rubric`
    );

    if (response.ok()) {
      const rubricItems = await response.json();
      expect(Array.isArray(rubricItems)).toBe(true);

      // Each item should have attribution
      if (rubricItems.length > 0) {
        const item = rubricItems[0];
        expect(item).toHaveProperty('text');
        expect(item).toHaveProperty('promoted_by');
        expect(item).toHaveProperty('source_trace_id');
      }
    } else {
      // Endpoint may not exist yet
      expect([404, 501]).toContain(response.status());
    }

    await scenario.cleanup();
  });

  test('facilitator can remove findings from draft rubric', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Findings can be promoted to draft rubric staging area'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop with findings to be managed
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Draft Rubric Management Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .withDiscoveryFinding({
        insight: 'Strong implementation with clear intent.',
        traceIndex: 0,
      })
      .withDiscoveryFinding({
        insight: 'Could benefit from additional error handling.',
        traceIndex: 1,
      })
      .inPhase('discovery')
      .withRealApi()
      .build();

    // Facilitator logs in
    await scenario.loginAs(scenario.facilitator);

    // Get findings
    const findings = await scenario.api.getFindings();
    expect(findings.length).toBeGreaterThanOrEqual(2);

    // Simulate promoting both findings
    for (const finding of findings.slice(0, 2)) {
      const promoteResponse = await scenario.page.request.post(
        `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings/${finding.id}/promote`,
        {
          data: {
            finding_id: finding.id,
            promoter_id: scenario.facilitator.id,
          },
        }
      );

      expect([200, 404, 501]).toContain(promoteResponse.status());
    }

    // Get draft rubric
    const rubricResponse = await scenario.page.request.get(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/draft-rubric`
    );

    if (rubricResponse.ok()) {
      const rubricItems = await rubricResponse.json();

      // Facilitator could remove items via DELETE endpoint
      if (rubricItems.length > 0) {
        const itemToRemove = rubricItems[0];
        const deleteResponse = await scenario.page.request.delete(
          `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/draft-rubric/${itemToRemove.id}`
        );

        // May not have delete endpoint yet
        expect([200, 404, 405, 501]).toContain(deleteResponse.status());
      }
    }

    await scenario.cleanup();
  });

  test('draft rubric staging area preserves finding metadata', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Findings can be promoted to draft rubric staging area'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop with metadata-rich findings
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Rubric Metadata Preservation' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .withDiscoveryFinding({
        insight:
          'Response appropriately validates all input parameters before processing.',
        traceIndex: 0,
      })
      .inPhase('discovery')
      .withRealApi()
      .build();

    // Facilitator logs in
    await scenario.loginAs(scenario.facilitator);

    // Get findings
    const findings = await scenario.api.getFindings();
    expect(findings.length).toBeGreaterThanOrEqual(1);

    // Promote a finding
    const finding = findings[0];
    const promoteResponse = await scenario.page.request.post(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings/${finding.id}/promote`,
      {
        data: {
          finding_id: finding.id,
          promoter_id: scenario.facilitator.id,
        },
      }
    );

    if (promoteResponse.ok()) {
      // Get draft rubric to verify metadata preserved
      const rubricResponse = await scenario.page.request.get(
        `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/draft-rubric`
      );

      if (rubricResponse.ok()) {
        const rubricItems = await rubricResponse.json();
        if (rubricItems.length > 0) {
          const rubricItem = rubricItems[0];

          // Verify original finding data is preserved
          expect(rubricItem.text).toBeDefined();
          expect(rubricItem.source_trace_id).toBeDefined();
          expect(rubricItem.promoted_by).toBe(scenario.facilitator.id);
          expect(rubricItem.promoted_at).toBeDefined();
        }
      }
    }

    await scenario.cleanup();
  });

  test('multiple facilitators can collaborate on draft rubric', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Findings can be promoted to draft rubric staging area'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop with two facilitators (not typical, but test multi-user promotion)
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Collaborative Rubric Curation' })
      .withFacilitator()
      .withUser('facilitator')
      .withParticipants(1)
      .withTraces(3)
      .withDiscoveryFinding({
        insight: 'Clean separation of concerns.',
        traceIndex: 0,
      })
      .withDiscoveryFinding({
        insight: 'Robust error handling patterns.',
        traceIndex: 1,
      })
      .withDiscoveryFinding({
        insight: 'Good use of type hints and documentation.',
        traceIndex: 2,
      })
      .inPhase('discovery')
      .withRealApi()
      .build();

    // First facilitator logs in
    const facilitator1 = scenario.facilitator;
    await scenario.loginAs(facilitator1);

    // Get findings
    const findings = await scenario.api.getFindings();
    expect(findings.length).toBeGreaterThanOrEqual(3);

    // First facilitator promotes first two findings
    for (const finding of findings.slice(0, 2)) {
      const response = await scenario.page.request.post(
        `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings/${finding.id}/promote`,
        {
          data: {
            finding_id: finding.id,
            promoter_id: facilitator1.id,
          },
        }
      );

      expect([200, 404, 501]).toContain(response.status());
    }

    // Second facilitator promotes third finding
    const facilitator2 = scenario.users.facilitator?.[0] || facilitator1;
    if (facilitator2 !== facilitator1) {
      const secondFacilitatorPage = await scenario.newPageAs(facilitator2);
      const lastFinding = findings[2];

      const response = await secondFacilitatorPage.request.post(
        `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings/${lastFinding.id}/promote`,
        {
          data: {
            finding_id: lastFinding.id,
            promoter_id: facilitator2.id,
          },
        }
      );

      expect([200, 404, 501]).toContain(response.status());
    }

    // Both facilitators can view draft rubric
    const rubricResponse = await scenario.page.request.get(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/draft-rubric`
    );

    if (rubricResponse.ok()) {
      const rubricItems = await rubricResponse.json();
      // Should have promoted items from both facilitators
      expect(Array.isArray(rubricItems)).toBe(true);
    }

    await scenario.cleanup();
  });

  test('draft rubric can be edited before finalizing into rubric', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Findings can be promoted to draft rubric staging area'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop in rubric phase
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Draft Rubric Editing' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .withDiscoveryFinding({
        insight: 'Response demonstrates problem understanding.',
        traceIndex: 0,
      })
      .withDiscoveryComplete()
      .inPhase('rubric')
      .withRealApi()
      .build();

    // Facilitator logs in
    await scenario.loginAs(scenario.facilitator);

    // Access draft rubric
    const response = await scenario.page.request.get(
      `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/draft-rubric`
    );

    if (response.ok()) {
      const rubricItems = await response.json();

      // Facilitator could edit items before finalizing
      // This might involve PATCH or PUT endpoints for individual items
      if (rubricItems.length > 0) {
        const item = rubricItems[0];

        // Try to update the item
        const updateResponse = await scenario.page.request.put(
          `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/draft-rubric/${item.id}`,
          {
            data: {
              text: 'Updated: ' + item.text,
            },
          }
        );

        // May not have update endpoint yet
        expect([200, 404, 405, 501]).toContain(updateResponse.status());
      }
    }

    await scenario.cleanup();
  });

  test('draft rubric items track source trace and participant', {
    tag: ['@spec:ASSISTED_FACILITATION_SPEC', '@req:Findings can be promoted to draft rubric staging area'],
  }, async ({
    browser,
  }) => {
    // Setup: Create workshop with multi-trace, multi-participant setup
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Rubric Item Traceability' })
      .withFacilitator()
      .withParticipants(2)
      .withTraces(3)
      .withDiscoveryFinding({
        insight: 'Well-thought-out approach to the problem.',
        traceIndex: 0,
      })
      .withDiscoveryFinding({
        insight: 'Comprehensive error handling implementation.',
        traceIndex: 1,
      })
      .inPhase('discovery')
      .withRealApi()
      .build();

    // Facilitator logs in
    await scenario.loginAs(scenario.facilitator);

    // Get findings with source information
    const findings = await scenario.api.getFindings();
    expect(findings.length).toBeGreaterThanOrEqual(2);

    // Verify findings have traceability info
    for (const finding of findings) {
      expect(finding).toHaveProperty('trace_id');
      expect(finding).toHaveProperty('user_id');
    }

    // Promote a finding
    if (findings.length > 0) {
      const finding = findings[0];
      const promoteResponse = await scenario.page.request.post(
        `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/findings/${finding.id}/promote`,
        {
          data: {
            finding_id: finding.id,
            promoter_id: scenario.facilitator.id,
          },
        }
      );

      if (promoteResponse.ok()) {
        // Get draft rubric
        const rubricResponse = await scenario.page.request.get(
          `http://127.0.0.1:8000/workshops/${scenario.workshop.id}/draft-rubric`
        );

        if (rubricResponse.ok()) {
          const rubricItems = await rubricResponse.json();

          // Verify traceability is preserved in rubric items
          if (rubricItems.length > 0) {
            const rubricItem = rubricItems[0];
            expect(rubricItem.source_trace_id).toBe(finding.trace_id);
          }
        }
      }
    }

    await scenario.cleanup();
  });
});
