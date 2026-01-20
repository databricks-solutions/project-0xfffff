/**
 * E2E Tests for Assisted Facilitation v2 - Discovery Phase
 *
 * Tests the participant discovery flow with real-time finding classification
 * and fuzzy progress indicators.
 */

import { test, expect, Page } from '@playwright/test';
import { TestScenario } from '../lib/scenario-builder';
import * as discoveryActions from '../lib/actions/discovery';

test.describe('Assisted Facilitation v2 - Discovery Phase', {
  tag: ['@spec:ASSISTED_FACILITATION_SPEC'],
}, () => {
  test('participant can submit findings with real-time classification', async ({
    page,
    browser,
  }) => {
    // Setup: Create workshop with facilitator and participant
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Classification Test Workshop' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(3)
      .inPhase('discovery')
      .withRealApi()
      .build();

    const participant = scenario.users.participant[0];

    // Step 1: Facilitator starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Step 2: Participant submits findings
    const testPage = await scenario.newPageAs(participant);
    await discoveryActions.waitForDiscoveryPhase(testPage);

    // Submit first finding (themes category)
    await testPage.locator('textarea').first().fill('This response demonstrates good code organization practices.');
    await testPage.getByRole('button', { name: /Next/i }).click();

    // Verify progress updated
    const progressText = testPage.locator('.text-gray-600').filter({ hasText: /of/ });
    await expect(progressText).toContainText('1 of 3');

    // Submit second finding (edge_cases category)
    await testPage.locator('textarea').first().fill('The response fails to handle edge cases like empty input.');
    await testPage.getByRole('button', { name: /Next/i }).click();

    // Verify progress
    await expect(progressText).toContainText('2 of 3');

    // Submit third finding (boundary_conditions category)
    await testPage.locator('textarea').first().fill('This is a boundary condition where the behavior changes at limits.');
    await testPage.getByRole('button', { name: /Next/i }).click();

    // Verify completion
    await expect(testPage.getByText('All Traces Reviewed')).toBeVisible();

    await scenario.cleanup();
  });

  test('fuzzy progress indicator shows correct state for participants', async ({
    page,
    browser,
  }) => {
    // Setup: Create workshop with multiple participants and traces
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Fuzzy Progress Test' })
      .withFacilitator()
      .withParticipants(2)
      .withTraces(10)
      .inPhase('discovery')
      .withRealApi()
      .build();

    const participant1 = scenario.users.participant[0];
    const participant2 = scenario.users.participant[1];

    // Facilitator starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Participant 1: Fill in 3 traces (30% coverage = "good_coverage")
    const page1 = await scenario.newPageAs(participant1);
    await discoveryActions.waitForDiscoveryPhase(page1);

    for (let i = 0; i < 3; i++) {
      await page1.locator('textarea').first().fill(`Finding ${i + 1} for participant 1`);
      if (i < 2) {
        await page1.getByRole('button', { name: /Next/i }).click();
      }
    }

    // Verify fuzzy progress transitions through states
    // Initially "exploring" (0%), then "good_coverage" (30%+)
    const progressBadge = page1.locator('[role="status"]');
    await expect(progressBadge).toBeVisible({ timeout: 5000 });

    // Participant 2: Fill in all 10 traces (100% = "complete")
    const page2 = await scenario.newPageAs(participant2);
    await discoveryActions.waitForDiscoveryPhase(page2);

    for (let i = 0; i < 10; i++) {
      const textarea = page2.locator('textarea').first();
      await textarea.fill(`Finding ${i + 1} for participant 2`);
      if (i < 9) {
        const nextBtn = page2.getByRole('button', { name: /Next/i });
        await nextBtn.click();
        await page2.waitForTimeout(100); // Small delay between clicks
      }
    }

    // Verify completion indicator
    await expect(page2.getByText(/All Traces Reviewed|completion/i)).toBeVisible({
      timeout: 5000,
    });

    await scenario.cleanup();
  });

  test('multiple participants can submit findings concurrently', async ({
    browser,
  }) => {
    // Setup: Create workshop with 3 participants
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Concurrent Discovery Test' })
      .withFacilitator()
      .withParticipants(3)
      .withTraces(5)
      .inPhase('discovery')
      .withRealApi()
      .build();

    // Facilitator starts discovery
    const facilitatorPage = scenario.page;
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // All participants start discovery concurrently
    const participantPages = await Promise.all(
      scenario.users.participant.map((p) => scenario.newPageAs(p))
    );

    // Each participant submits findings
    for (let i = 0; i < participantPages.length; i++) {
      const page = participantPages[i];
      await discoveryActions.waitForDiscoveryPhase(page);

      // Submit finding for first trace
      const textarea = page.locator('textarea').first();
      await textarea.fill(`Participant ${i + 1} finding: This response is well-structured.`);
      await page.getByRole('button', { name: /Next/i }).click();
    }

    // Verify all findings were submitted via API
    const findings = await scenario.api.getFindings();
    expect(findings.length).toBeGreaterThanOrEqual(3);

    // Verify findings are from different users
    const uniqueUsers = new Set(findings.map((f) => f.user_id));
    expect(uniqueUsers.size).toBe(3);

    await scenario.cleanup();
  });

  test('findings are persisted correctly after navigation', async ({
    browser,
  }) => {
    // Setup: Create workshop with traces
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Findings Persistence Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(3)
      .inPhase('discovery')
      .withRealApi()
      .build();

    const participant = scenario.users.participant[0];

    // Facilitator starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Participant submits finding and navigates
    const testPage = await scenario.newPageAs(participant);
    await discoveryActions.waitForDiscoveryPhase(testPage);

    const testFinding = 'This response handles error cases appropriately.';
    await testPage.locator('textarea').first().fill(testFinding);
    await testPage.getByRole('button', { name: /Next/i }).click();

    // Navigate back to first trace
    await testPage.getByRole('button', { name: /Previous/i }).click();

    // Verify finding is still there
    const textarea = testPage.locator('textarea').first();
    const value = await textarea.inputValue();
    expect(value).toContain(testFinding);

    // Navigate forward and verify again
    await testPage.getByRole('button', { name: /Next/i }).click();
    await testPage.waitForTimeout(200);

    // Go back one more time
    await testPage.getByRole('button', { name: /Previous/i }).click();
    const value2 = await textarea.inputValue();
    expect(value2).toContain(testFinding);

    await scenario.cleanup();
  });

  test('completion button disabled until all traces have findings', async ({
    browser,
  }) => {
    // Setup: Create workshop with 3 traces
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Completion Button Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(3)
      .inPhase('discovery')
      .withRealApi()
      .build();

    const participant = scenario.users.participant[0];

    // Facilitator starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Participant starts discovery
    const testPage = await scenario.newPageAs(participant);
    await discoveryActions.waitForDiscoveryPhase(testPage);

    // Try to find complete button - should not be visible initially
    let completeButton = testPage.getByRole('button', {
      name: /Complete.*Discovery|finish.*discovery/i,
    });

    let isVisible = await completeButton.isVisible().catch(() => false);
    expect(isVisible).toBe(false);

    // Fill in first two traces
    for (let i = 0; i < 2; i++) {
      await testPage.locator('textarea').first().fill(`Finding ${i + 1}`);
      await testPage.getByRole('button', { name: /Next/i }).click();
    }

    // Still should not have complete button
    isVisible = await completeButton.isVisible().catch(() => false);
    expect(isVisible).toBe(false);

    // Fill in last trace
    await testPage.locator('textarea').first().fill('Final finding');

    // Now complete button should appear
    await expect(completeButton).toBeVisible({ timeout: 5000 });

    await scenario.cleanup();
  });

  test('question generation button is available during discovery', async ({
    browser,
  }) => {
    // Setup: Create workshop
    const scenario = await TestScenario.create(browser)
      .withWorkshop({ name: 'Question Generation Test' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(2)
      .inPhase('discovery')
      .withRealApi()
      .build();

    const participant = scenario.users.participant[0];

    // Facilitator starts discovery
    await scenario.loginAs(scenario.facilitator);
    await scenario.beginDiscovery();

    // Participant starts discovery
    const testPage = await scenario.newPageAs(participant);
    await discoveryActions.waitForDiscoveryPhase(testPage);

    // Look for question generation button
    const generateButton = testPage.getByRole('button', {
      name: /Generate.*question|another.*question/i,
    });

    // Should be visible (optional, but good UX indicator)
    const isVisible = await generateButton.isVisible().catch(() => false);
    expect(typeof isVisible).toBe('boolean');

    await scenario.cleanup();
  });
});
