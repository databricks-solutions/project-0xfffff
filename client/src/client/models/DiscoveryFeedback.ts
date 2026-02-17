/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { FeedbackLabel } from './FeedbackLabel';
export type DiscoveryFeedback = {
    id: string;
    workshop_id: string;
    trace_id: string;
    user_id: string;
    feedback_label: FeedbackLabel;
    comment: string;
    followup_qna?: Array<Record<string, string>>;
    created_at?: string;
    updated_at?: string;
};

