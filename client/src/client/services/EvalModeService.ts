/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CriterionEvaluation } from '../models/CriterionEvaluation';
import type { CriterionEvaluationCreate } from '../models/CriterionEvaluationCreate';
import type { EvalAlignRequest } from '../models/EvalAlignRequest';
import type { EvalEvaluateRequest } from '../models/EvalEvaluateRequest';
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
     * Get Eval Alignment Status
     * Get eval-mode alignment readiness status.
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getEvalAlignmentStatusWorkshopsWorkshopIdAlignmentStatusGet(
        workshopId: string,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/alignment-status',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
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
     * Create Criterion Evaluation
     * @param workshopId
     * @param traceId
     * @param criterionId
     * @param requestBody
     * @returns CriterionEvaluation Successful Response
     * @throws ApiError
     */
    public static createCriterionEvaluationWorkshopsWorkshopIdTracesTraceIdCriteriaCriterionIdEvaluationsPost(
        workshopId: string,
        traceId: string,
        criterionId: string,
        requestBody: CriterionEvaluationCreate,
    ): CancelablePromise<CriterionEvaluation> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/traces/{trace_id}/criteria/{criterion_id}/evaluations',
            path: {
                'workshop_id': workshopId,
                'trace_id': traceId,
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
     * Get Eval Results
     * @param workshopId
     * @param traceId
     * @param judgeModel
     * @returns TraceEvalScore Successful Response
     * @throws ApiError
     */
    public static getEvalResultsWorkshopsWorkshopIdEvalResultsGet(
        workshopId: string,
        traceId?: (string | null),
        judgeModel?: (string | null),
    ): CancelablePromise<Array<TraceEvalScore>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/eval-results',
            path: {
                'workshop_id': workshopId,
            },
            query: {
                'trace_id': traceId,
                'judge_model': judgeModel,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Start Eval Judge Run
     * Start a background judge evaluation job for eval-mode criteria.
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static startEvalJudgeRunWorkshopsWorkshopIdEvaluatePost(
        workshopId: string,
        requestBody: EvalEvaluateRequest,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/evaluate',
            path: {
                'workshop_id': workshopId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Eval Job Status
     * Poll eval-mode judge evaluation job progress.
     * @param workshopId
     * @param jobId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getEvalJobStatusWorkshopsWorkshopIdEvalJobJobIdGet(
        workshopId: string,
        jobId: string,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/eval-job/{job_id}',
            path: {
                'workshop_id': workshopId,
                'job_id': jobId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Eval Irr
     * Compute eval-mode IRR (pairwise agreement on criterion decisions).
     * @param workshopId
     * @param traceId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getEvalIrrWorkshopsWorkshopIdEvalIrrGet(
        workshopId: string,
        traceId?: (string | null),
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/eval-irr',
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
    /**
     * Start Eval Alignment
     * Start eval-mode judge alignment using criterion-level assessments.
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static startEvalAlignmentWorkshopsWorkshopIdAlignPost(
        workshopId: string,
        requestBody: EvalAlignRequest,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/align',
            path: {
                'workshop_id': workshopId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
}
