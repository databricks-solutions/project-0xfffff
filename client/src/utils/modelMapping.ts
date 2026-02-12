/**
 * Model mapping utilities for Databricks endpoints
 * Maps frontend display names to backend model names
 */

export interface ModelOption {
  value: string;           
  label: string;           
  description?: string;    // Optional description
  disabled?: boolean;      // Whether this option is disabled
  requiresDatabricks?: boolean; // Whether this requires Databricks configuration
}

/**
 * Mapping of frontend display names to backend model names
 */
export const MODEL_MAPPING: Record<string, string> = {
  'GPT-5.2': 'databricks-gpt-5-2',
  'GPT-5.1': 'databricks-gpt-5-1',
  'Claude Opus 4.5': 'databricks-claude-opus-4-5',
  'Claude Sonnet 4.5': 'databricks-claude-sonnet-4-5',
  'Claude Sonnet 4': 'databricks-claude-sonnet-4',
  'Gemini 3 Pro': 'databricks-gemini-3-pro',
  'Gemini 2.5 Flash': 'databricks-gemini-2-5-flash',
  'Llama 4 Maverick': 'databricks-llama-4-maverick',
  'Llama 3.3 70B Instruct': 'databricks-meta-llama-3-3-70b-instruct'
};

/**
 * Reverse mapping from backend model names to frontend display names
 */
const REVERSE_MODEL_MAPPING: Record<string, string> = Object.fromEntries(
  Object.entries(MODEL_MAPPING).map(([key, value]) => [value, key])
);

/**
 * Get the backend model name from a frontend display name
 */
export function getBackendModelName(frontendName: string): string {
  return MODEL_MAPPING[frontendName] || frontendName;
}

/**
 * Get the frontend display name from a backend model name
 */
export function getFrontendModelName(backendName: string): string {
  return REVERSE_MODEL_MAPPING[backendName] || backendName;
}

/**
 * Get all available model options for the UI
 */
export function getModelOptions(hasMlflowConfig: boolean = false): ModelOption[] {
  return [
    // Claude models first (recommended for alignment)
    {
      value: 'Claude Opus 4.5',
      label: 'Claude Opus 4.5 (Recommended)',
      description: 'Anthropic Claude Opus 4.5 - Best for alignment',
      disabled: !hasMlflowConfig,
      requiresDatabricks: true,
    },
    {
      value: 'Claude Sonnet 4.5',
      label: 'Claude Sonnet 4.5',
      description: 'Anthropic Claude Sonnet 4.5 model',
      disabled: !hasMlflowConfig,
      requiresDatabricks: true,
    },
    {
      value: 'Claude Sonnet 4',
      label: 'Claude Sonnet 4',
      description: 'Anthropic Claude Sonnet 4 model',
      disabled: !hasMlflowConfig,
      requiresDatabricks: true,
    },
    // GPT models
    {
      value: 'GPT-5.2',
      label: 'GPT-5.2',
      description: 'OpenAI GPT-5.2 model',
      disabled: !hasMlflowConfig,
      requiresDatabricks: true,
    },
    {
      value: 'GPT-5.1',
      label: 'GPT-5.1',
      description: 'OpenAI GPT-5.1 model',
      disabled: !hasMlflowConfig,
      requiresDatabricks: true,
    },
    // Other models
    {
      value: 'Gemini 3 Pro',
      label: 'Gemini 3 Pro',
      description: 'Google Gemini 3 Pro model',
      disabled: !hasMlflowConfig,
      requiresDatabricks: true,
    },
    {
      value: 'Gemini 2.5 Flash',
      label: 'Gemini 2.5 Flash',
      description: 'Google Gemini 2.5 Flash model',
      disabled: !hasMlflowConfig,
      requiresDatabricks: true,
    },
    {
      value: 'Llama 4 Maverick',
      label: 'Llama 4 Maverick',
      description: 'Meta Llama 4 Maverick model',
      disabled: !hasMlflowConfig,
      requiresDatabricks: true,
    },
    {
      value: 'Llama 3.3 70B Instruct',
      label: 'Llama 3.3 70B Instruct',
      description: 'Meta Llama 3.3 70B Instruct model',
      disabled: !hasMlflowConfig,
      requiresDatabricks: true,
    },
  ];
}

/**
 * Get model option by value
 */
function getModelOptionByValue(value: string, hasMlflowConfig: boolean = false): ModelOption | undefined {
  return getModelOptions(hasMlflowConfig).find(option => option.value === value);
}

/**
 * Check if a model requires Databricks configuration
 */
export function requiresDatabricks(modelName: string): boolean {
  const option = getModelOptionByValue(modelName);
  return option?.requiresDatabricks || false;
}

/**
 * Get a user-friendly display name for a model
 */
export function getDisplayName(modelName: string): string {
  const option = getModelOptionByValue(modelName);
  return option?.label || modelName;
}
