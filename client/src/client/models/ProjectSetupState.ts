/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ProjectSetupState = {
    project_id?: (string | null);
    name?: string;
    description?: (string | null);
    agent_description?: string;
    facilitator_id?: string;
    trace_uc_table_path?: string;
    setup_job_id?: (string | null);
    setup_status?: ('pending' | 'running' | 'completed' | 'failed' | 'enqueue_failed' | 'cancelled' | null);
};

