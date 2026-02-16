/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ConvergenceMetricsResponse } from './ConvergenceMetricsResponse';
import type { DiscussionPromptResponse } from './DiscussionPromptResponse';
import type { KeyDisagreementResponse } from './KeyDisagreementResponse';
/**
 * LLM-generated summaries of discovery findings for facilitators.
 */
export type DiscoverySummariesResponse = {
    overall: Record<string, any>;
    by_user: Array<Record<string, any>>;
    by_trace: Array<Record<string, any>>;
    candidate_rubric_questions?: Array<string>;
    key_disagreements?: Array<KeyDisagreementResponse>;
    discussion_prompts?: Array<DiscussionPromptResponse>;
    convergence?: ConvergenceMetricsResponse;
    ready_for_rubric?: boolean;
};

