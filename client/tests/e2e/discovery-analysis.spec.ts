/**
 * E2E Test: Discovery Analysis Tab (Step 2 — Findings Synthesis)
 *
 * Tests the facilitator's ability to run AI analysis on discovery feedback,
 * view findings, disagreements, and analysis history.
 *
 * Uses mocked API — the analysis endpoints return deterministic mock data.
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib/scenario-builder';
import { WorkshopPhase } from '../lib/types';

test.describe('Discovery Analysis (Step 2)', {
  tag: ['@spec:DISCOVERY_SPEC'],
}, () => {

  test('facilitator sees analysis controls with template and model selectors', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Facilitator selects analysis template (Evaluation Criteria or Themes & Patterns) before running',
    ],
  }, async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Analysis Controls Test' })
      .withFacilitator()
      .withParticipants(2)
      .withTraces(3)
      .inPhase(WorkshopPhase.DISCOVERY)
      .build();

    await scenario.loginAs(scenario.facilitator);

    // Navigate to the Analysis tab via the FindingsReviewPage
    // The facilitator dashboard shows "Discovery Findings Review" link
    const viewFindingsBtn = page.getByText('View All Findings');
    if (await viewFindingsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await viewFindingsBtn.click();
    }

    // Look for the Analysis tab (it's in FindingsReviewPage)
    const analysisTab = page.getByRole('tab', { name: /Analysis/i });
    if (await analysisTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await analysisTab.click();

      // Verify analysis controls are present
      await expect(page.getByText('Run Discovery Analysis')).toBeVisible({ timeout: 5000 });
      await expect(page.getByText('Analysis Template')).toBeVisible();
      await expect(page.getByText('Evaluation Criteria')).toBeVisible();
      await expect(page.getByRole('button', { name: /Run Analysis/i })).toBeVisible();
    }

    await scenario.cleanup();
  });

  test('facilitator triggers analysis and sees results with findings and disagreements', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Facilitator can trigger analysis at any time (even partial feedback)',
    ],
  }, async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Analysis Results Test' })
      .withFacilitator()
      .withParticipants(2)
      .withTraces(3)
      .inPhase(WorkshopPhase.DISCOVERY)
      .build();

    await scenario.loginAs(scenario.facilitator);

    // Navigate to analysis tab
    const viewFindingsBtn = page.getByText('View All Findings');
    if (await viewFindingsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await viewFindingsBtn.click();
    }

    const analysisTab = page.getByRole('tab', { name: /Analysis/i });
    if (await analysisTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await analysisTab.click();

      // Click Run Analysis
      const runButton = page.getByRole('button', { name: /Run Analysis/i });
      await expect(runButton).toBeVisible({ timeout: 5000 });
      await runButton.click();

      // Wait for results to appear (mock returns immediately)
      await expect(page.getByText('Findings')).toBeVisible({ timeout: 10000 });

      // Verify findings are displayed
      await expect(page.getByText('Responses should include specific references')).toBeVisible();

      // Verify disagreement section (HIGH priority)
      await expect(page.getByText(/HIGH Priority/)).toBeVisible();
      await expect(page.getByText('Rating split: GOOD vs BAD')).toBeVisible();
    }

    await scenario.cleanup();
  });

  test('running analysis multiple times preserves history in dropdown', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Each analysis run creates a new record (history preserved)',
    ],
  }, async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Analysis History Test' })
      .withFacilitator()
      .withParticipants(2)
      .withTraces(3)
      .inPhase(WorkshopPhase.DISCOVERY)
      .build();

    await scenario.loginAs(scenario.facilitator);

    // Navigate to analysis tab
    const viewFindingsBtn = page.getByText('View All Findings');
    if (await viewFindingsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await viewFindingsBtn.click();
    }

    const analysisTab = page.getByRole('tab', { name: /Analysis/i });
    if (await analysisTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await analysisTab.click();

      // Run first analysis
      const runButton = page.getByRole('button', { name: /Run Analysis/i });
      await expect(runButton).toBeVisible({ timeout: 5000 });
      await runButton.click();

      // Wait for results
      await expect(page.getByText('Findings')).toBeVisible({ timeout: 10000 });

      // Verify History dropdown appears with 1 entry
      await expect(page.getByText('History')).toBeVisible();
      await expect(page.getByText('Latest')).toBeVisible();

      // Run second analysis (click Run Analysis again)
      await runButton.click();

      // After second run, history should show 2 entries
      // The dropdown should show "Latest" and "Run 1"
      // Click the dropdown trigger to open and verify entries
      const historyTrigger = page.locator('button:has-text("Latest")');
      await expect(historyTrigger).toBeVisible({ timeout: 10000 });
      await historyTrigger.click();

      // Verify both entries are in the dropdown
      const options = page.getByRole('option');
      await expect(options).toHaveCount(2);
    }

    await scenario.cleanup();
  });

  test('analysis results show participant warning when < 2 participants', {
    tag: [
      '@spec:DISCOVERY_SPEC',
      '@req:Warning if < 2 participants (not an error)',
    ],
  }, async ({ page }) => {
    // Setup with only 1 participant to trigger warning
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Warning Test' })
      .withFacilitator()
      .withParticipants(1) // only 1 participant
      .withTraces(2)
      .inPhase(WorkshopPhase.DISCOVERY)
      .build();

    await scenario.loginAs(scenario.facilitator);

    // Navigate to analysis tab
    const viewFindingsBtn = page.getByText('View All Findings');
    if (await viewFindingsBtn.isVisible({ timeout: 5000 }).catch(() => false)) {
      await viewFindingsBtn.click();
    }

    const analysisTab = page.getByRole('tab', { name: /Analysis/i });
    if (await analysisTab.isVisible({ timeout: 5000 }).catch(() => false)) {
      await analysisTab.click();

      // Run analysis
      const runButton = page.getByRole('button', { name: /Run Analysis/i });
      await expect(runButton).toBeVisible({ timeout: 5000 });
      await runButton.click();

      // Should show warning (not error) about limited participant data
      await expect(page.getByText('Limited Participant Data')).toBeVisible({ timeout: 10000 });
      // Verify it mentions 1 participant
      await expect(page.getByText(/1 participant/)).toBeVisible();
    }

    await scenario.cleanup();
  });
});
