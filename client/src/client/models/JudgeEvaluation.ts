/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
/**
 * Judge evaluation result for a single trace.
 */
export type JudgeEvaluation = {
    id: string;
    workshop_id: string;
    prompt_id: string;
    trace_id: string;
    // For rubric judges (1-5 scale)
    predicted_rating?: (number | null);
    human_rating?: (number | null);
    // For binary judges (pass/fail)
    predicted_binary?: (boolean | null);
    human_binary?: (boolean | null);
    // For freeform judges (text feedback)
    predicted_feedback?: (string | null);
    human_feedback?: (string | null);
    // Common fields
    confidence?: (number | null);
    reasoning?: (string | null);
};

