/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Request to create a draft rubric item.
 */
export type CreateDraftRubricItemRequest = {
    text: string;
    source_type?: string;
    source_analysis_id?: (string | null);
    source_trace_ids?: Array<string>;
    promoted_by: string;
};

