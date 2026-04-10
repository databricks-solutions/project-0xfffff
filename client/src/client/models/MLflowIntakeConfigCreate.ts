/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Request model for creating MLflow intake configuration.
 */
export type MLflowIntakeConfigCreate = {
    /**
     * Databricks workspace host URL
     */
    databricks_host: string;
    /**
     * Deprecated — SDK auth used instead
     */
    databricks_token?: string;
    /**
     * MLflow experiment ID to pull traces from
     */
    experiment_id: string;
    /**
     * Maximum number of traces to pull
     */
    max_traces?: (number | null);
    /**
     * Optional filter string for traces
     */
    filter_string?: (string | null);
};

