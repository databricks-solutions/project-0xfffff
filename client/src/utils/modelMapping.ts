/**
 * Model mapping utilities for Databricks endpoints
 */

import type { AvailableModel } from '@/hooks/useWorkshopApi';

export interface ModelOption {
  value: string;
  label: string;
  description?: string;
  disabled?: boolean;
  requiresDatabricks?: boolean;
}

/**
 * Known display names for common Databricks endpoints.
 * Used to provide friendly labels; unknown endpoints fall back to their raw name.
 */
const KNOWN_DISPLAY_NAMES: Record<string, string> = {
  'databricks-gpt-5-2': 'GPT-5.2',
  'databricks-gpt-5-1': 'GPT-5.1',
  'databricks-claude-opus-4-5': 'Claude Opus 4.5',
  'databricks-claude-sonnet-4-5': 'Claude Sonnet 4.5',
  'databricks-claude-sonnet-4': 'Claude Sonnet 4',
  'databricks-gemini-3-pro': 'Gemini 3 Pro',
  'databricks-gemini-2-5-flash': 'Gemini 2.5 Flash',
  'databricks-llama-4-maverick': 'Llama 4 Maverick',
  'databricks-meta-llama-3-3-70b-instruct': 'Llama 3.3 70B Instruct',
};

/**
 * Derive a human-readable label from an endpoint name.
 */
function endpointToDisplayName(endpointName: string): string {
  if (KNOWN_DISPLAY_NAMES[endpointName]) {
    return KNOWN_DISPLAY_NAMES[endpointName];
  }
  // Strip common prefixes and format
  return endpointName
    .replace(/^databricks-/, '')
    .replace(/-/g, ' ')
    .replace(/\b\w/g, c => c.toUpperCase());
}

/**
 * Build model options from a list of available endpoints fetched from the API.
 */
export function buildModelOptions(models: AvailableModel[]): ModelOption[] {
  return models.map(m => ({
    value: m.name,
    label: endpointToDisplayName(m.name),
    requiresDatabricks: true,
  }));
}

/**
 * Get the backend model name from a frontend display name.
 * Supports both known display names and pass-through of endpoint names.
 */
export function getBackendModelName(frontendName: string): string {
  // Check if it's a known display name → endpoint mapping
  const reverseEntry = Object.entries(KNOWN_DISPLAY_NAMES).find(
    ([, display]) => display === frontendName
  );
  if (reverseEntry) return reverseEntry[0];
  // Already an endpoint name
  return frontendName;
}

/**
 * Get the frontend display name from a backend model name.
 */
export function getFrontendModelName(backendName: string): string {
  return KNOWN_DISPLAY_NAMES[backendName] || backendName;
}

/**
 * Get a user-friendly display name for a model (accepts either format).
 */
export function getDisplayName(modelName: string): string {
  return KNOWN_DISPLAY_NAMES[modelName] || endpointToDisplayName(modelName);
}
