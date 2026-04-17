/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type EvalEvaluateRequest = {
    /**
     * Model serving endpoint or 'demo'
     */
    model_name?: string;
    /**
     * Specific traces, or null for all with criteria
     */
    trace_ids?: (Array<string> | null);
};

