/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ProjectSetupProgress = {
    project_id: string;
    setup_job_id: string;
    status: ProjectSetupProgress.status;
    current_step: string;
    message?: (string | null);
    queue_job_id?: (string | null);
    delegated_run_ids?: Array<string>;
    details?: Record<string, any>;
};
export namespace ProjectSetupProgress {
    export enum status {
        PENDING = 'pending',
        RUNNING = 'running',
        COMPLETED = 'completed',
        FAILED = 'failed',
        CANCELLED = 'cancelled',
    }
}

