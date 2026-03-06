/**
 * Custom LLM Provider actions
 *
 * Provides functionality for configuring and managing custom LLM providers
 * in the Judge Tuning phase.
 */

import { expect, type Page } from '@playwright/test';

export interface ProviderConfig {
  providerName: string;
  baseUrl: string;
  modelName: string;
  apiKey: string;
}

/**
 * Navigate to Judge Tuning and wait for Custom LLM Provider section
 */
export async function navigateToCustomLlmProvider(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Judge Tuning/i }).click();
  await expect(page.getByText('Custom LLM Provider')).toBeVisible({ timeout: 10000 });
}

/**
 * Expand the provider config form (click Configure)
 */
export async function expandProviderConfig(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Configure/i }).first().click();
}

/**
 * Fill in the provider configuration form fields
 */
export async function fillProviderConfig(page: Page, config: ProviderConfig): Promise<void> {
  await page.getByLabel('Provider Name').fill(config.providerName);
  await page.getByLabel('Base URL').fill(config.baseUrl);
  await page.getByLabel('Model Name').fill(config.modelName);
  await page.getByLabel('API Key').fill(config.apiKey);
}

/**
 * Click Save/Update Configuration and wait for confirmation
 */
export async function saveProviderConfig(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Save Configuration|Update Configuration/i }).click();
  await expect(
    page.getByText(/saved/i).or(page.getByText('Active')).first()
  ).toBeVisible({ timeout: 5000 });
}

/**
 * Delete the provider configuration and wait for removal confirmation
 */
export async function deleteProviderConfig(page: Page): Promise<void> {
  await page.getByRole('button', { name: /Delete configuration/i }).click();
  await expect(page.getByText(/removed/i)).toBeVisible({ timeout: 5000 });
}

/**
 * Configure a custom LLM provider end-to-end (expand, fill, save)
 */
export async function configureProvider(page: Page, config: ProviderConfig): Promise<void> {
  await expandProviderConfig(page);
  await fillProviderConfig(page, config);
  await saveProviderConfig(page);
}

/**
 * Update an already-configured provider's fields and save
 */
export async function updateProviderConfig(page: Page, config: Partial<ProviderConfig>): Promise<void> {
  if (config.providerName !== undefined) {
    await page.getByLabel('Provider Name').clear();
    await page.getByLabel('Provider Name').fill(config.providerName);
  }
  if (config.baseUrl !== undefined) {
    await page.getByLabel('Base URL').clear();
    await page.getByLabel('Base URL').fill(config.baseUrl);
  }
  if (config.modelName !== undefined) {
    await page.getByLabel('Model Name').clear();
    await page.getByLabel('Model Name').fill(config.modelName);
  }
  if (config.apiKey !== undefined) {
    await page.getByLabel('API Key').fill(config.apiKey);
  }
  await saveProviderConfig(page);
}
