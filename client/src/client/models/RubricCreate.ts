/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { JudgeType } from './JudgePrompt';

export type RubricCreate = {
    question: string;
    created_by: string;
    judge_type?: JudgeType;
    binary_labels?: (Record<string, string> | null);
    rating_scale?: number;
};

