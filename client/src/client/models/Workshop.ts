/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { WorkshopPhase } from './WorkshopPhase';
import type { WorkshopStatus } from './WorkshopStatus';
export type Workshop = {
    id: string;
    name: string;
    description?: (string | null);
    facilitator_id: string;
    status?: WorkshopStatus;
    current_phase?: WorkshopPhase;
    completed_phases?: Array<string>;
    discovery_started?: boolean;
    annotation_started?: boolean;
    active_discovery_trace_ids?: Array<string>;
    active_annotation_trace_ids?: Array<string>;
    discovery_randomize_traces?: boolean;
    annotation_randomize_traces?: boolean;
    judge_name?: string;
    input_jsonpath?: (string | null);
    output_jsonpath?: (string | null);
    created_at?: string;
};

