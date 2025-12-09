/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type Trace = {
    id: string;
    workshop_id: string;
    input: string;
    output: string;
    context?: (Record<string, any> | null);
    trace_metadata?: (Record<string, any> | null);
    mlflow_trace_id?: (string | null);
    mlflow_url?: (string | null);
    mlflow_host?: (string | null);
    mlflow_experiment_id?: (string | null);
    include_in_alignment?: boolean;
    sme_feedback?: (string | null);
    created_at?: string;
};

