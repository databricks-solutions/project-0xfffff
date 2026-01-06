/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { JudgeType } from './JudgePrompt';

export type Rubric = {
    id: string;
    workshop_id: string;
    question: string;
    judge_type?: JudgeType;
    binary_labels?: (Record<string, string> | null);
    rating_scale?: number;
    created_by: string;
    created_at?: string;
};

