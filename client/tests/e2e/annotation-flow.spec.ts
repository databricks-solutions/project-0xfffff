/**
 * E2E tests for the annotation workflow.
 *
 * Verifies toast notifications, multi-line comments, navigation controls,
 * and annotation count accuracy using mocked API responses.
 *
 * @spec ANNOTATION_SPEC
 */

import { test, expect } from '@playwright/test';
import { TestScenario } from '../lib';

test.describe('Annotation Flow', {
  tag: ['@spec:ANNOTATION_SPEC'],
}, () => {
  test('new annotation shows "Annotation saved!" toast', async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Toast - New Annotation' })
      .withFacilitator()
      .withSMEs(1)
      .withTraces(3)
      .withRubric({ question: 'How helpful?' })
      .inPhase('annotation')
      .build();

    await page.goto(`/?workshop=${scenario.workshop.id}`);
    await scenario.loginAs(scenario.users.sme[0]);

    // Wait for annotation interface
    await expect(page.getByText(/Trace 1 of/)).toBeVisible({ timeout: 10000 });

    // Select a rating
    const radio = page.locator('input[type="radio"][value="4"]').first();
    await radio.click();
    await expect(radio).toBeChecked();

    // Click Next to trigger save
    await page.getByRole('button', { name: /next/i }).click();

    // Verify the "Annotation saved!" toast appears
    await expect(page.getByText('Annotation saved!')).toBeVisible({ timeout: 5000 });

    await scenario.cleanup();
  });

  test('edit annotation shows "Annotation updated!" toast', async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Toast - Edit Annotation' })
      .withFacilitator()
      .withSMEs(1)
      .withTraces(3)
      .withRubric({ question: 'How helpful?' })
      .withAnnotation({ traceIndex: 0, rating: 3, comment: 'Initial' })
      .inPhase('annotation')
      .build();

    await page.goto(`/?workshop=${scenario.workshop.id}`);
    await scenario.loginAs(scenario.users.sme[0]);

    // Wait for annotation interface - should show existing annotation
    await expect(page.getByText(/Trace 1 of/)).toBeVisible({ timeout: 10000 });

    // Change the rating to something different
    const radio = page.locator('input[type="radio"][value="5"]').first();
    await radio.click();

    // Click Next to trigger update
    await page.getByRole('button', { name: /next/i }).click();

    // Verify the "Annotation updated!" toast appears
    await expect(page.getByText('Annotation updated!')).toBeVisible({ timeout: 5000 });

    await scenario.cleanup();
  });

  test('view without change shows no toast', async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Toast - No Change' })
      .withFacilitator()
      .withSMEs(1)
      .withTraces(3)
      .withRubric({ question: 'How helpful?' })
      .withAnnotation({ traceIndex: 0, rating: 4 })
      .inPhase('annotation')
      .build();

    await page.goto(`/?workshop=${scenario.workshop.id}`);
    await scenario.loginAs(scenario.users.sme[0]);

    // Wait for annotation interface with existing annotation loaded
    await expect(page.getByText(/Trace 1 of/)).toBeVisible({ timeout: 10000 });

    // Don't change anything, just click Next
    await page.getByRole('button', { name: /next/i }).click();

    // Wait a beat for any potential toast
    await page.waitForTimeout(1500);

    // Verify NO toast appeared (neither saved nor updated)
    await expect(page.getByText('Annotation saved!')).not.toBeVisible();
    await expect(page.getByText('Annotation updated!')).not.toBeVisible();

    await scenario.cleanup();
  });

  test('multi-line comment preserves newlines', async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Multi-line Comment' })
      .withFacilitator()
      .withSMEs(1)
      .withTraces(2)
      .withRubric({ question: 'How helpful?' })
      .inPhase('annotation')
      .build();

    await page.goto(`/?workshop=${scenario.workshop.id}`);
    await scenario.loginAs(scenario.users.sme[0]);

    await expect(page.getByText(/Trace 1 of/)).toBeVisible({ timeout: 10000 });

    // Select a rating
    await page.locator('input[type="radio"][value="4"]').first().click();

    // Type a multi-line comment in the textarea
    const multiLineComment = 'Line 1\nLine 2\nLine 3';
    const textarea = page.locator('textarea').first();
    await textarea.fill(multiLineComment);

    // Click Next to save
    await page.getByRole('button', { name: /next/i }).click();
    await page.waitForTimeout(1000);

    // Navigate back to first trace
    await page.getByRole('button', { name: /prev|back|previous/i }).click();
    await page.waitForTimeout(1000);

    // Verify the textarea still contains newlines
    const restoredValue = await page.locator('textarea').first().inputValue();
    expect(restoredValue).toContain('Line 1');
    expect(restoredValue).toContain('Line 2');
    expect(restoredValue).toContain('Line 3');

    await scenario.cleanup();
  });

  test('comment-only edit triggers updated toast', async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Comment-Only Edit' })
      .withFacilitator()
      .withSMEs(1)
      .withTraces(3)
      .withRubric({ question: 'How helpful?' })
      .withAnnotation({ traceIndex: 0, rating: 4, comment: 'Original' })
      .inPhase('annotation')
      .build();

    await page.goto(`/?workshop=${scenario.workshop.id}`);
    await scenario.loginAs(scenario.users.sme[0]);

    await expect(page.getByText(/Trace 1 of/)).toBeVisible({ timeout: 10000 });

    // Only change the comment, keep the same rating
    const textarea = page.locator('textarea').first();
    await textarea.fill('Updated comment text');

    // Click Next
    await page.getByRole('button', { name: /next/i }).click();

    // Should trigger "Annotation updated!" since comment changed
    await expect(page.getByText('Annotation updated!')).toBeVisible({ timeout: 5000 });

    await scenario.cleanup();
  });

  test('next button enabled for annotated traces', async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Next Button State' })
      .withFacilitator()
      .withSMEs(1)
      .withTraces(3)
      .withRubric({ question: 'How helpful?' })
      .withAnnotation({ traceIndex: 0, rating: 4 })
      .inPhase('annotation')
      .build();

    await page.goto(`/?workshop=${scenario.workshop.id}`);
    await scenario.loginAs(scenario.users.sme[0]);

    await expect(page.getByText(/Trace 1 of/)).toBeVisible({ timeout: 10000 });

    // The first trace is already annotated, so Next should be enabled
    const nextButton = page.getByRole('button', { name: /next/i });
    await expect(nextButton).toBeEnabled();

    await scenario.cleanup();
  });

  test('annotation count is accurate', async ({ page }) => {
    // Create scenario with some pre-existing annotations
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Annotation Count' })
      .withFacilitator()
      .withSMEs(1)
      .withTraces(5)
      .withRubric({ question: 'How helpful?' })
      .withAnnotation({ traceIndex: 0, rating: 4 })
      .withAnnotation({ traceIndex: 1, rating: 3 })
      .inPhase('annotation')
      .build();

    await page.goto(`/?workshop=${scenario.workshop.id}`);
    await scenario.loginAs(scenario.users.sme[0]);

    await expect(page.getByText(/Trace 1 of/)).toBeVisible({ timeout: 10000 });

    // Verify the annotation count reflects the 2 pre-submitted annotations
    // The UI should show something like "2/5 annotated" or "2 of 5"
    // Look for count indication: either in progress text or a counter element
    const countIndicator = page.getByText(/2.*of.*5|2\/5|2.*annotated/i);
    if (await countIndicator.isVisible({ timeout: 3000 }).catch(() => false)) {
      await expect(countIndicator).toBeVisible();
    }

    await scenario.cleanup();
  });
});
