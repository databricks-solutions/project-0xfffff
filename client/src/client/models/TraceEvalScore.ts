/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CriterionScoreResult } from './CriterionScoreResult';
export type TraceEvalScore = {
    trace_id: string;
    hurdle_passed: boolean;
    hurdle_results?: Array<CriterionScoreResult>;
    criteria_results?: Array<CriterionScoreResult>;
    raw_score?: number;
    max_possible?: number;
    normalized_score?: number;
};

