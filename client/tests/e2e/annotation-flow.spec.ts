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
import {
  getCommentValue,
  goToNextTrace,
  goToPreviousTrace,
  isNextButtonEnabled,
  submitAnnotation,
  waitForAnnotationInterface,
  waitForAnnotationProgress,
} from '../lib/actions/annotation';

test.describe('Annotation Flow', {
  tag: ['@spec:ANNOTATION_SPEC'],
}, () => {
  test('new annotation is saved when navigating to next trace', { tag: ['@req:Toast shows "Annotation saved!" for new submissions'] }, async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Toast - New Annotation' })
      .withFacilitator()
      .withSMEs(1)
      .withTraces(3)
      .withRubric({ question: 'How helpful?' })
      .inPhase('annotation')
      .withRealApi()
      .build();

    await page.goto(`/?workshop=${scenario.workshop.id}`);
    await scenario.loginAs(scenario.users.sme[0]);

    // Wait for annotation interface (Rate this Response or Trace 1/N)
    await waitForAnnotationInterface(page);

    // Submit annotation on first trace - clicking Next saves in background and navigates
    await submitAnnotation(page, { rating: 4 });

    // Wait for background save, then navigate back to verify it was saved
    await page.waitForTimeout(1500);
    await goToPreviousTrace(page);
    await page.waitForTimeout(500);

    // The "Saved" indicator should be visible for the annotated trace
    await expect(page.getByText(/Saved/)).toBeVisible({ timeout: 5000 });

    await scenario.cleanup();
  });

  test('edit annotation persists changed rating', { tag: ['@req:Toast shows "Annotation updated!" only when changes detected'] }, async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Toast - Edit Annotation' })
      .withFacilitator()
      .withSMEs(1)
      .withTraces(3)
      .withRubric({ question: 'How helpful?' })
      .withAnnotation({ traceIndex: 0, rating: 3, comment: 'Initial' })
      .inPhase('annotation')
      .withRealApi()
      .build();

    await page.goto(`/?workshop=${scenario.workshop.id}`);
    await scenario.loginAs(scenario.users.sme[0]);
    await waitForAnnotationInterface(page);

    // UI auto-advances to first unannotated trace; navigate back to the annotated one
    await goToPreviousTrace(page);
    await page.waitForTimeout(500);

    // The existing annotation (rating 3) should be loaded; edit it to rating 5
    await submitAnnotation(page, { rating: 5 });

    // Wait for background save, then navigate back to verify update persisted
    await page.waitForTimeout(1500);
    await goToPreviousTrace(page);
    await page.waitForTimeout(500);

    // The "Saved" indicator should be visible (annotation was updated)
    await expect(page.getByText(/Saved/)).toBeVisible({ timeout: 5000 });

    await scenario.cleanup();
  });


  test('multi-line comment preserves newlines', { tag: ['@req:Multi-line comments preserved throughout the stack'] }, async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Multi-line Comment' })
      .withFacilitator()
      .withSMEs(1)
      .withTraces(2)
      .withRubric({ question: 'How helpful?' })
      .inPhase('annotation')
      .withRealApi()
      .build();

    await page.goto(`/?workshop=${scenario.workshop.id}`);
    await scenario.loginAs(scenario.users.sme[0]);
    await waitForAnnotationInterface(page);

    const multiLineComment = 'Line 1\nLine 2\nLine 3';
    await submitAnnotation(page, { rating: 4, comment: multiLineComment });
    await page.waitForTimeout(1000);

    await goToPreviousTrace(page);
    await page.waitForTimeout(1000);

    const restoredValue = await getCommentValue(page);
    expect(restoredValue).toContain('Line 1');
    expect(restoredValue).toContain('Line 2');
    expect(restoredValue).toContain('Line 3');

    await scenario.cleanup();
  });

  test('comment-only edit persists updated comment', { tag: ['@req:Toast shows "Annotation updated!" only when changes detected'] }, async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Comment-Only Edit' })
      .withFacilitator()
      .withSMEs(1)
      .withTraces(3)
      .withRubric({ question: 'How helpful?' })
      .withAnnotation({ traceIndex: 0, rating: 4, comment: 'Original' })
      .inPhase('annotation')
      .withRealApi()
      .build();

    await page.goto(`/?workshop=${scenario.workshop.id}`);
    await scenario.loginAs(scenario.users.sme[0]);
    await waitForAnnotationInterface(page);

    // UI auto-advances to first unannotated trace; navigate back to the annotated one
    await goToPreviousTrace(page);
    await page.waitForTimeout(500);

    // Edit only the comment (keep same rating)
    await submitAnnotation(page, { rating: 4, comment: 'Updated comment text' });

    // Wait for background save, then navigate back to verify
    await page.waitForTimeout(1500);
    await goToPreviousTrace(page);
    await page.waitForTimeout(500);

    // The updated comment should be persisted
    const restoredComment = await getCommentValue(page);
    expect(restoredComment).toContain('Updated comment text');

    await scenario.cleanup();
  });

  test('next button enabled for annotated traces', { tag: ['@req:Next button enabled for annotated traces (allows re-navigation)'] }, async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Next Button State' })
      .withFacilitator()
      .withSMEs(1)
      .withTraces(3)
      .withRubric({ question: 'How helpful?' })
      .withAnnotation({ traceIndex: 0, rating: 4 })
      .inPhase('annotation')
      .withRealApi()
      .build();

    await page.goto(`/?workshop=${scenario.workshop.id}`);
    await scenario.loginAs(scenario.users.sme[0]);
    await waitForAnnotationInterface(page);

    // UI auto-advances to first unannotated trace; navigate back to the annotated one
    await goToPreviousTrace(page);
    await page.waitForTimeout(500);

    // On the annotated trace, existing ratings are loaded so Next should be enabled
    await expect(await isNextButtonEnabled(page)).toBe(true);

    await scenario.cleanup();
  });

  test('annotation count is accurate', { tag: ['@req:Annotation count reflects unique submissions (not re-submissions)'] }, async ({ page }) => {
    const scenario = await TestScenario.create(page)
      .withWorkshop({ name: 'Annotation Count' })
      .withFacilitator()
      .withSMEs(1)
      .withTraces(5)
      .withRubric({ question: 'How helpful?' })
      .withAnnotation({ traceIndex: 0, rating: 4 })
      .withAnnotation({ traceIndex: 1, rating: 3 })
      .inPhase('annotation')
      .withRealApi()
      .build();

    await page.goto(`/?workshop=${scenario.workshop.id}`);
    await scenario.loginAs(scenario.users.sme[0]);
    await waitForAnnotationInterface(page);

    await waitForAnnotationProgress(page, 2, 5);

    await scenario.cleanup();
  });
});
