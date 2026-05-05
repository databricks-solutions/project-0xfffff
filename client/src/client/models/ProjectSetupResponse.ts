/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type ProjectSetupResponse = {
    project_id: string;
    setup_job_id: string;
    status: ProjectSetupResponse.status;
    current_step: string;
    message?: (string | null);
};
export namespace ProjectSetupResponse {
    export enum status {
        PENDING = 'pending',
        RUNNING = 'running',
        COMPLETED = 'completed',
        FAILED = 'failed',
        CANCELLED = 'cancelled',
    }
}

