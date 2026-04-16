/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { TraceCriterion } from '../models/TraceCriterion';
import type { TraceCriterionCreate } from '../models/TraceCriterionCreate';
import type { TraceCriterionUpdate } from '../models/TraceCriterionUpdate';
import type { TraceEvalScore } from '../models/TraceEvalScore';
import type { TraceRubric } from '../models/TraceRubric';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class EvalModeService {
    /**
     * Create Trace Criterion
     * @param workshopId
     * @param traceId
     * @param requestBody
     * @returns TraceCriterion Successful Response
     * @throws ApiError
     */
    public static createTraceCriterionWorkshopsWorkshopIdTracesTraceIdCriteriaPost(
        workshopId: string,
        traceId: string,
        requestBody: TraceCriterionCreate,
    ): CancelablePromise<TraceCriterion> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/traces/{trace_id}/criteria',
            path: {
                'workshop_id': workshopId,
                'trace_id': traceId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * List Trace Criteria
     * @param workshopId
     * @param traceId
     * @returns TraceCriterion Successful Response
     * @throws ApiError
     */
    public static listTraceCriteriaWorkshopsWorkshopIdTracesTraceIdCriteriaGet(
        workshopId: string,
        traceId: string,
    ): CancelablePromise<Array<TraceCriterion>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/traces/{trace_id}/criteria',
            path: {
                'workshop_id': workshopId,
                'trace_id': traceId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Update Trace Criterion
     * @param workshopId
     * @param criterionId
     * @param requestBody
     * @returns TraceCriterion Successful Response
     * @throws ApiError
     */
    public static updateTraceCriterionWorkshopsWorkshopIdCriteriaCriterionIdPut(
        workshopId: string,
        criterionId: string,
        requestBody: TraceCriterionUpdate,
    ): CancelablePromise<TraceCriterion> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/workshops/{workshop_id}/criteria/{criterion_id}',
            path: {
                'workshop_id': workshopId,
                'criterion_id': criterionId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Delete Trace Criterion
     * @param workshopId
     * @param criterionId
     * @returns void
     * @throws ApiError
     */
    public static deleteTraceCriterionWorkshopsWorkshopIdCriteriaCriterionIdDelete(
        workshopId: string,
        criterionId: string,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/workshops/{workshop_id}/criteria/{criterion_id}',
            path: {
                'workshop_id': workshopId,
                'criterion_id': criterionId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Trace Rubric
     * @param workshopId
     * @param traceId
     * @returns TraceRubric Successful Response
     * @throws ApiError
     */
    public static getTraceRubricWorkshopsWorkshopIdTracesTraceIdRubricGet(
        workshopId: string,
        traceId: string,
    ): CancelablePromise<TraceRubric> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/traces/{trace_id}/rubric',
            path: {
                'workshop_id': workshopId,
                'trace_id': traceId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Eval Results
     * @param workshopId
     * @param traceId
     * @returns TraceEvalScore Successful Response
     * @throws ApiError
     */
    public static getEvalResultsWorkshopsWorkshopIdEvalResultsGet(
        workshopId: string,
        traceId?: (string | null),
    ): CancelablePromise<Array<TraceEvalScore>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/eval-results',
            path: {
                'workshop_id': workshopId,
            },
            query: {
                'trace_id': traceId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
}
