/**
 * Rubric phase actions
 *
 * Provides functionality for rubric creation and management.
 */

import { expect, type Page } from '@playwright/test';
import type { Rubric, RubricConfig } from '../types';

/**
 * Create a rubric question via the UI
 */
export async function createRubricQuestion(
  page: Page,
  config: RubricConfig
): Promise<void> {
  const { question = 'How helpful is this response?' } = config;

  // Navigate to the Rubric Questions tab if needed
  const rubricTab = page.getByRole('tab', { name: /Rubric Questions/i });
  if (await rubricTab.isVisible().catch(() => false)) {
    await rubricTab.click();
  }

  // Click "Create First Question" if it exists, otherwise "Add Question"
  const createFirstButton = page.getByRole('button', {
    name: /Create First Question/i,
  });
  if (await createFirstButton.isVisible().catch(() => false)) {
    await createFirstButton.click();
  } else {
    const addButton = page.getByRole('button', { name: /Add Question/i });
    if (await addButton.isVisible().catch(() => false)) {
      await addButton.click();
    }
  }

  // Fill in the question form
  // The app uses #new-title for the question title
  const titleInput = page.locator('#new-title');
  if (await titleInput.isVisible().catch(() => false)) {
    await titleInput.fill(question);
  }

  // Fill description if field exists
  const descriptionInput = page.locator('#new-description');
  if (await descriptionInput.isVisible().catch(() => false)) {
    await descriptionInput.fill(
      config.question || 'Rate the helpfulness of this response.'
    );
  }

  // Save the question
  const saveButton = page.getByRole('button', { name: /^Save$/i });
  await Promise.all([
    page.waitForResponse(
      (resp) =>
        resp.request().method() === 'POST' &&
        resp.url().includes('/rubric') &&
        resp.status() >= 200 &&
        resp.status() < 300
    ),
    saveButton.click(),
  ]);
}

/**
 * Create a rubric via API
 */
export async function createRubricViaApi(
  page: Page,
  workshopId: string,
  config: {
    question: string;
    created_by: string;
    judge_type?: 'likert' | 'binary' | 'freeform';
    rating_scale?: number;
  },
  apiUrl: string = 'http://127.0.0.1:8000'
): Promise<Rubric> {
  const response = await page.request.post(
    `${apiUrl}/workshops/${workshopId}/rubric`,
    {
      headers: { 'Content-Type': 'application/json' },
      data: {
        question: config.question,
        created_by: config.created_by,
        judge_type: config.judge_type || 'likert',
        rating_scale: config.rating_scale || 5,
      },
    }
  );

  if (!response.ok()) {
    throw new Error(
      `Failed to create rubric: ${response.status()} ${await response.text()}`
    );
  }

  return (await response.json()) as Rubric;
}

/**
 * Get the rubric for a workshop
 */
export async function getRubric(
  page: Page,
  workshopId: string,
  apiUrl: string = 'http://127.0.0.1:8000'
): Promise<Rubric | null> {
  const response = await page.request.get(
    `${apiUrl}/workshops/${workshopId}/rubric`
  );

  if (response.status() === 404) {
    return null;
  }

  if (!response.ok()) {
    throw new Error(
      `Failed to get rubric: ${response.status()} ${await response.text()}`
    );
  }

  return (await response.json()) as Rubric;
}

/**
 * Wait for the rubric summary to be visible
 */
export async function waitForRubricSummary(page: Page): Promise<void> {
  await expect(page.getByText(/Rubric Summary/i)).toBeVisible({
    timeout: 10000,
  });
}

/**
 * Verify that a rubric question exists in the UI
 */
export async function verifyRubricQuestionInUI(
  page: Page,
  questionText: string
): Promise<boolean> {
  // Poll for the question to appear in an input field
  return await expect
    .poll(
      async () => {
        return page.locator('input').evaluateAll(
          (els, expected) =>
            els.some((el) => (el as HTMLInputElement).value.includes(expected)),
          questionText
        );
      },
      { timeout: 5000 }
    )
    .toBeTruthy()
    .then(() => true)
    .catch(() => false);
}
