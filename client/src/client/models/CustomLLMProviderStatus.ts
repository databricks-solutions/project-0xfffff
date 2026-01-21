/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Status of custom LLM provider configuration.
 */
export type CustomLLMProviderStatus = {
  workshop_id: string;
  is_configured?: boolean;
  is_enabled?: boolean;
  provider_name?: string | null;
  base_url?: string | null;
  model_name?: string | null;
  has_api_key?: boolean;
};
