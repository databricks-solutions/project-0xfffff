/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FeedbackLabel } from './FeedbackLabel';
/**
 * Feedback enriched with user display info (for facilitator views).
 */
export type DiscoveryFeedbackWithUser = {
    id: string;
    workshop_id: string;
    trace_id: string;
    user_id: string;
    user_name: string;
    user_email: string;
    user_role: string;
    feedback_label: FeedbackLabel;
    comment: string;
    followup_qna?: Array<Record<string, string>>;
    created_at: string;
    updated_at: string;
};

