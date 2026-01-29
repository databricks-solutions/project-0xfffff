/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { JudgeType } from './JudgeType';
export type RubricCreate = {
    question: string;
    created_by: string;
    /**
     * Type of judge: likert, binary, or freeform
     */
    judge_type?: (JudgeType | null);
    /**
     * Custom labels for binary judge
     */
    binary_labels?: (Record<string, string> | null);
    /**
     * Rating scale for rubric judge
     */
    rating_scale?: (number | null);
};

