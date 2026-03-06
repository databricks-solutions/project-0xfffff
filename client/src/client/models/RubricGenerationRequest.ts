/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Request model for generating rubric suggestions using AI.
 */
export type RubricGenerationRequest = {
    /**
     * Databricks model serving endpoint name
     */
    endpoint_name?: string;
    /**
     * Model temperature (0.0-2.0)
     */
    temperature?: number;
    /**
     * Include participant notes in prompt
     */
    include_notes?: boolean;
};

