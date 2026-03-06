/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Request model for creating/updating custom LLM provider config.
 */
export type CustomLLMProviderConfigCreate = {
    /**
     * User-friendly provider name
     */
    provider_name: string;
    /**
     * Base URL for the OpenAI-compatible endpoint
     */
    base_url: string;
    /**
     * API key for authentication
     */
    api_key: string;
    /**
     * Model name/identifier
     */
    model_name: string;
};

