/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { TraceCriterionType } from './TraceCriterionType';
export type TraceCriterionCreate = {
    text: string;
    criterion_type: TraceCriterionType;
    weight?: number;
    source_finding_id?: (string | null);
    order?: number;
    created_by: string;
};

