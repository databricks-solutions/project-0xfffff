/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { MLflowIntakeConfig } from './MLflowIntakeConfig';
/**
 * Status of MLflow intake process.
 */
export type MLflowIntakeStatus = {
    workshop_id: string;
    is_configured?: boolean;
    is_ingested?: boolean;
    trace_count?: number;
    last_ingestion_time?: (string | null);
    error_message?: (string | null);
    config?: (MLflowIntakeConfig | null);
    databricks_host?: (string | null);
};

