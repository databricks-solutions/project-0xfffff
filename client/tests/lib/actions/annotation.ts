/**
 * Annotation phase actions
 *
 * Provides functionality for annotation submission and management.
 */

import { expect, type Page } from '@playwright/test';
import type { Annotation, AnnotationConfig } from '../types';

/**
 * Submit an annotation via the UI
 */
export async function submitAnnotation(
  page: Page,
  config: AnnotationConfig
): Promise<void> {
  const { rating = 4, comment } = config;

  // AnnotationDemo renders Likert ratings as div[role="button"] elements
  // containing a child div with the rating number (1-5).
  // Click the one matching the desired rating value.
  const ratingButton = page.locator('[role="button"]').filter({ hasText: new RegExp(`^${rating}$`) }).first();
  await ratingButton.waitFor({ state: 'visible', timeout: 5000 });
  await ratingButton.click();

  // Fill comment if provided (AnnotationDemo uses id="comment")
  if (comment !== undefined && comment !== '') {
    const commentField = page.locator('#comment').or(page.locator('textarea[name="comment"]'));
    if (await commentField.first().isVisible().catch(() => false)) {
      await commentField.first().fill(comment);
    }
  }

  // Submit the annotation via Next or Complete button (use data-testid to avoid
  // matching sidebar workflow buttons that also contain "complete" text).
  const submitButton = page.getByTestId('next-trace-button').or(page.getByTestId('complete-annotation-button'));
  await submitButton.first().waitFor({ state: 'visible', timeout: 5000 });
  await submitButton.first().click();
}

/**
 * Submit an annotation via API
 */
export async function submitAnnotationViaApi(
  page: Page,
  workshopId: string,
  annotation: {
    trace_id: string;
    user_id: string;
    rating: number;
    ratings?: Record<string, number>;
    comment?: string;
  },
  apiUrl: string = 'http://127.0.0.1:8000'
): Promise<Annotation> {
  const response = await page.request.post(
    `${apiUrl}/workshops/${workshopId}/annotations`,
    {
      headers: { 'Content-Type': 'application/json' },
      data: annotation,
    }
  );

  if (!response.ok()) {
    throw new Error(
      `Failed to submit annotation: ${response.status()} ${await response.text()}`
    );
  }

  return (await response.json()) as Annotation;
}

/**
 * Get annotations for a workshop
 */
export async function getAnnotations(
  page: Page,
  workshopId: string,
  userId?: string,
  apiUrl: string = 'http://127.0.0.1:8000'
): Promise<Annotation[]> {
  const url = userId
    ? `${apiUrl}/workshops/${workshopId}/annotations?user_id=${userId}`
    : `${apiUrl}/workshops/${workshopId}/annotations`;

  const response = await page.request.get(url);

  if (!response.ok()) {
    throw new Error(
      `Failed to get annotations: ${response.status()} ${await response.text()}`
    );
  }

  return (await response.json()) as Annotation[];
}

/**
 * Navigate to the next trace for annotation (or Complete on last trace)
 */
export async function goToNextTrace(page: Page): Promise<void> {
  const nextButton = page.getByTestId('next-trace-button').or(page.getByTestId('complete-annotation-button'));
  await nextButton.first().click();
}

/**
 * Navigate to the previous trace for annotation
 */
export async function goToPreviousTrace(page: Page): Promise<void> {
  const prevButton = page.getByRole('button', { name: /prev|back|previous/i });
  if (await prevButton.isVisible().catch(() => false)) {
    await prevButton.click();
  }
}

/**
 * Wait for the annotation interface to be ready.
 * AnnotationDemo shows "Rate this Response" and a trace counter "Trace 1/N".
 */
export async function waitForAnnotationInterface(page: Page): Promise<void> {
  await expect(
    page.getByText(/Rate this Response|Trace \d+\/\d+/).first()
  ).toBeVisible({ timeout: 10000 });
}

/**
 * Get the current comment/feedback value from the annotation form (id="comment").
 */
export async function getCommentValue(page: Page): Promise<string> {
  const field = page.locator('#comment').or(page.locator('textarea').first());
  return field.inputValue();
}

/**
 * Whether the Next (or Complete) button is enabled.
 */
export async function isNextButtonEnabled(page: Page): Promise<boolean> {
  const btn = page.getByTestId('next-trace-button').or(page.getByTestId('complete-annotation-button')).first();
  return btn.isEnabled();
}

/**
 * Wait for the annotation progress indicator to show completed/total (e.g. "2/5").
 */
export async function waitForAnnotationProgress(
  page: Page,
  completed: number,
  total: number
): Promise<void> {
  const pattern = new RegExp(`${completed}/${total}`);
  await expect(page.getByText(pattern)).toBeVisible({ timeout: 5000 });
}

/**
 * Complete all annotations for a set of traces
 */
export async function completeAllAnnotations(
  page: Page,
  workshopId: string,
  userId: string,
  traceIds: string[],
  rating: number = 4,
  apiUrl: string = 'http://127.0.0.1:8000'
): Promise<Annotation[]> {
  const annotations: Annotation[] = [];

  for (const traceId of traceIds) {
    const annotation = await submitAnnotationViaApi(page, workshopId, {
      trace_id: traceId,
      user_id: userId,
      rating,
    }, apiUrl);
    annotations.push(annotation);
  }

  return annotations;
}
