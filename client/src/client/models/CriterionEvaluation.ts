/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type CriterionEvaluation = {
    id: string;
    criterion_id: string;
    trace_id: string;
    workshop_id: string;
    judge_model: string;
    met: boolean;
    rationale?: (string | null);
    raw_response?: (Record<string, any> | null);
    created_at?: string;
};

