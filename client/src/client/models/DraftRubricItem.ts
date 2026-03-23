/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Promoted finding in draft rubric staging area.
 */
export type DraftRubricItem = {
    id: string;
    workshop_id: string;
    text: string;
    source_type: string;
    source_analysis_id?: (string | null);
    source_trace_ids?: Array<string>;
    group_id?: (string | null);
    group_name?: (string | null);
    promoted_by: string;
    promoted_at?: (string | null);
};

