/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Request model for creating MLflow intake configuration.
 */
export type MLflowIntakeConfigCreate = {
    /**
     * MLflow experiment ID — resolved from MLFLOW_EXPERIMENT_ID env var if not provided
     */
    experiment_id?: (string | null);
    /**
     * Maximum number of traces to pull
     */
    max_traces?: (number | null);
    /**
     * Optional filter string for traces
     */
    filter_string?: (string | null);
};

