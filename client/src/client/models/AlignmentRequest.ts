/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Request model for running judge alignment.
 */
export type AlignmentRequest = {
    judge_name: string;
    judge_prompt: string;
    evaluation_model_name: string;
    alignment_model_name?: (string | null);
    prompt_id?: (string | null);
    judge_type?: (string | null);
};

