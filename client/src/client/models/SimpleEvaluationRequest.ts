/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Request model for simple model serving evaluation (no MLflow).
 */
export type SimpleEvaluationRequest = {
    judge_prompt: string;
    endpoint_name: string;
    judge_name?: (string | null);
    prompt_id?: (string | null);
    judge_type?: (string | null);
};

