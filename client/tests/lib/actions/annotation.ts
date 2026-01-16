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

  // Find and click the rating button (1-5 scale)
  // The app typically uses radio buttons or clickable rating elements
  const ratingButton = page.locator(`[data-rating="${rating}"]`);
  if (await ratingButton.isVisible().catch(() => false)) {
    await ratingButton.click();
  } else {
    // Try radio group
    const radioGroup = page.getByRole('radiogroup');
    if (await radioGroup.isVisible().catch(() => false)) {
      const ratingOption = radioGroup.getByRole('radio').nth(rating - 1);
      await ratingOption.click();
    } else {
      // Try clicking a star rating or similar
      const starButton = page.locator(`button:has-text("${rating}")`).first();
      if (await starButton.isVisible().catch(() => false)) {
        await starButton.click();
      }
    }
  }

  // Fill comment if provided
  if (comment) {
    const commentField = page.locator('textarea[name="comment"]');
    if (await commentField.isVisible().catch(() => false)) {
      await commentField.fill(comment);
    } else {
      // Try generic comment textarea
      const textarea = page.locator('textarea').first();
      if (await textarea.isVisible().catch(() => false)) {
        await textarea.fill(comment);
      }
    }
  }

  // Submit the annotation
  const submitButton = page.getByRole('button', {
    name: /submit|save|next/i,
  });
  if (await submitButton.isVisible().catch(() => false)) {
    await submitButton.click();
  }
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
 * Navigate to the next trace for annotation
 */
export async function goToNextTrace(page: Page): Promise<void> {
  const nextButton = page.getByRole('button', { name: /next/i });
  if (await nextButton.isVisible().catch(() => false)) {
    await nextButton.click();
  }
}

/**
 * Navigate to the previous trace for annotation
 */
export async function goToPreviousTrace(page: Page): Promise<void> {
  const prevButton = page.getByRole('button', { name: /prev|back/i });
  if (await prevButton.isVisible().catch(() => false)) {
    await prevButton.click();
  }
}

/**
 * Wait for the annotation interface to be ready
 */
export async function waitForAnnotationInterface(page: Page): Promise<void> {
  // Wait for trace content or annotation form to be visible
  await expect(
    page.locator('[data-testid="trace-content"], .annotation-form, .trace-viewer')
  ).toBeVisible({
    timeout: 10000,
  });
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
