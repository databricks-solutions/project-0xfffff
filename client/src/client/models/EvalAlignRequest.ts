/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type EvalAlignRequest = {
    /**
     * Model for judge evaluation
     */
    evaluation_model_name: string;
    /**
     * Model for MemAlign optimizer
     */
    alignment_model_name?: (string | null);
    embedding_model_name?: string;
};

