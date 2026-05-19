/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { TraceCriterionType } from './TraceCriterionType';
export type CriterionScoreResult = {
    criterion_id: string;
    criterion_text: string;
    criterion_type: TraceCriterionType;
    weight: number;
    met: boolean;
    rationale?: (string | null);
    score?: number;
};

