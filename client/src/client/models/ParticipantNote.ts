/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Participant note model.
 */
export type ParticipantNote = {
    id: string;
    workshop_id: string;
    user_id: string;
    trace_id?: (string | null);
    content: string;
    phase?: string;
    user_name?: (string | null);
    created_at?: string;
    updated_at?: string;
};

