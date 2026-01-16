/**
 * Example tests demonstrating the new e2e test infrastructure
 *
 * These tests show how to use the TestScenario fluent builder
 * to create readable, maintainable e2e tests.
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib';

test.describe('TestScenario Infrastructure Examples', () => {
  test('facilitator login with mocked API', async ({ page }) => {
    // Create a scenario with workshop and facilitator
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Test Workshop' })
      .withFacilitator()
      .build();

    // Navigate and login
    await page.goto('/');
    await scenario.loginAs(scenario.facilitator);

    // Verify we're logged in - should see the workshop name in the UI
    await expect(page.getByRole('heading', { name: 'Test Workshop' })).toBeVisible();

    // Cleanup
    await scenario.cleanup();
  });

  test('workshop with multiple participants', async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Multi-User Workshop' })
      .withFacilitator({ email: 'facilitator@test.com' })
      .withParticipants(3)
      .withSMEs(2)
      .withTraces(5)
      .inPhase('discovery')
      .build();

    // Verify all users were created
    expect(scenario.users.facilitator).toHaveLength(1);
    expect(scenario.users.participant).toHaveLength(3);
    expect(scenario.users.sme).toHaveLength(2);

    // Verify traces were created
    expect(scenario.traces).toHaveLength(5);

    // Verify workshop is in discovery phase
    expect(scenario.workshop.current_phase).toBe('discovery');

    await scenario.cleanup();
  });

  test('workshop setup for rubric phase', async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Rubric Phase Workshop' })
      .withFacilitator()
      .withParticipants(1)
      .withTraces(3)
      .withDiscoveryFinding({ insight: 'Good response overall' })
      .withDiscoveryComplete()
      .inPhase('rubric')
      .build();

    // Verify workshop is ready for rubric creation
    expect(scenario.workshop.current_phase).toBe('rubric');
    expect(scenario.findings).toHaveLength(1);

    await page.goto('/');
    await scenario.loginAs(scenario.facilitator);

    // Verify the workshop name is visible (confirms successful login and mock data)
    await expect(page.getByRole('heading', { name: 'Rubric Phase Workshop' })).toBeVisible();

    await scenario.cleanup();
  });

  test('named users for multi-browser tests', async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop()
      .withFacilitator({ name: 'Workshop Leader' })
      .withUser('participant', { email: 'alice@test.com', name: 'Alice' })
      .withUser('participant', { email: 'bob@test.com', name: 'Bob' })
      .withUser('sme', { email: 'expert@test.com', name: 'Dr. Expert' })
      .withTraces(2)
      .inPhase('discovery')
      .build();

    // Access users by name
    const alice = scenario.users.participant.find((u) => u.name === 'Alice');
    const bob = scenario.users.participant.find((u) => u.name === 'Bob');
    const expert = scenario.users.sme.find((u) => u.name === 'Dr. Expert');

    expect(alice).toBeDefined();
    expect(bob).toBeDefined();
    expect(expert).toBeDefined();

    await scenario.cleanup();
  });

  test('mixed mock and real API calls', async ({ page }) => {
    // This test uses real API for users but mocks workshops
    const scenario = await TestScenario.create(page)
      .withWorkshop()
      .withFacilitator()
      .withReal('/users/auth/login') // Real login endpoint
      // .withReal('WorkshopsService') // Would make all workshop calls real
      .build();

    // The login will hit the real API, workshop data is mocked
    expect(scenario.workshop).toBeDefined();

    await scenario.cleanup();
  });

  test('full real API mode', async ({ page }) => {
    // This test uses no mocking - full e2e
    const scenario = await TestScenario.create(page)
      .withWorkshop()
      .withFacilitator()
      .withRealApi() // No mocking at all
      .build();

    // All API calls go to the real backend
    expect(scenario.workshop).toBeDefined();

    await page.goto('/');
    await scenario.loginAs(scenario.facilitator);

    await scenario.cleanup();
  });

  test('annotation phase setup', async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop()
      .withFacilitator()
      .withParticipants(2)
      .withTraces(5)
      .withRubric({ question: 'How helpful is this response?' })
      .inPhase('annotation')
      .build();

    // Verify setup
    expect(scenario.workshop.current_phase).toBe('annotation');
    expect(scenario.rubric).toBeDefined();
    expect(scenario.rubric?.question).toBe('How helpful is this response?');

    await scenario.cleanup();
  });

  test('pre-created annotations', async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop()
      .withFacilitator()
      .withParticipants(1)
      .withTraces(3)
      .withRubric()
      .withAnnotation({ rating: 5, comment: 'Excellent!' })
      .withAnnotation({ rating: 3, comment: 'Average' })
      .inPhase('results')
      .build();

    expect(scenario.annotations).toHaveLength(2);
    expect(scenario.annotations[0].rating).toBe(5);
    expect(scenario.annotations[1].rating).toBe(3);

    await scenario.cleanup();
  });
});

test.describe('Real Workflow Tests with New Infrastructure', () => {
  test('facilitator creates workshop and invites participants', async ({ page }) => {
    // This demonstrates the complete flow in a concise way
    // Note: This test uses mocked API by default
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Calibration Workshop' })
      .withFacilitator()
      .withTraces(3)
      .build();

    await page.goto('/');
    await scenario.loginAs(scenario.facilitator);

    // The test can now focus on the actual behavior being tested
    // instead of setup boilerplate
    await expect(page.getByRole('heading', { name: 'Calibration Workshop' })).toBeVisible();

    await scenario.cleanup();
  });

  test('discovery phase completion tracking - data setup only', async ({ page }) => {
    // This test demonstrates creating mock data without browser interactions
    const scenario = await TestScenario.create(page)
      .withWorkshop()
      .withFacilitator()
      .withParticipants(2)
      .withTraces(1)
      .inPhase('discovery')
      .build();

    // Verify mock data was created correctly
    expect(scenario.workshop.current_phase).toBe('discovery');
    expect(scenario.users.participant).toHaveLength(2);
    expect(scenario.traces).toHaveLength(1);

    await scenario.cleanup();
  });
});
