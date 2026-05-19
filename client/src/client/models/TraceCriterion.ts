/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { TraceCriterionType } from './TraceCriterionType';
export type TraceCriterion = {
    id: string;
    trace_id: string;
    workshop_id: string;
    text: string;
    criterion_type: TraceCriterionType;
    weight?: number;
    source_finding_id?: (string | null);
    created_by: string;
    order?: number;
    created_at?: string;
    updated_at?: string;
};

