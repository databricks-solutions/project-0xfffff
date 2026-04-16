/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
export type DiscoveryAgentRun = {
    id: string;
    workshop_id: string;
    trace_id: string;
    milestone_ref?: (string | null);
    trigger_comment_id: string;
    status: string;
    tool_calls_count?: number;
    events?: Array<Record<string, any>>;
    partial_output?: string;
    final_output?: (string | null);
    error?: (string | null);
    created_by: string;
    completed_at?: (string | null);
    created_at: string;
    updated_at: string;
};

