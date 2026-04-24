/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type Annotation = {
    id: string;
    workshop_id: string;
    trace_id: string;
    user_id: string;
    rating: number;
    ratings?: (Record<string, number> | null);
    comment?: (string | null);
    rationales?: (Record<string, string> | null);
    legacy_comment?: (string | null);
    mlflow_trace_id?: (string | null);
    created_at?: string;
};

