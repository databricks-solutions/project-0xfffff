/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AlignmentRequest } from '../models/AlignmentRequest';
import type { Annotation } from '../models/Annotation';
import type { AnnotationCreate } from '../models/AnnotationCreate';
import type { Body_upload_csv_and_log_to_mlflow_workshops__workshop_id__csv_upload_to_mlflow_post } from '../models/Body_upload_csv_and_log_to_mlflow_workshops__workshop_id__csv_upload_to_mlflow_post';
import type { Body_upload_csv_traces_workshops__workshop_id__csv_upload_post } from '../models/Body_upload_csv_traces_workshops__workshop_id__csv_upload_post';
import type { IRRResult } from '../models/IRRResult';
import type { JsonPathPreviewRequest } from '../models/JsonPathPreviewRequest';
import type { JsonPathSettingsUpdate } from '../models/JsonPathSettingsUpdate';
import type { JudgeEvaluation } from '../models/JudgeEvaluation';
import type { JudgeEvaluationDirectRequest } from '../models/JudgeEvaluationDirectRequest';
import type { JudgeEvaluationRequest } from '../models/JudgeEvaluationRequest';
import type { JudgeEvaluationResult } from '../models/JudgeEvaluationResult';
import type { JudgeExportConfig } from '../models/JudgeExportConfig';
import type { JudgePerformanceMetrics } from '../models/JudgePerformanceMetrics';
import type { JudgePrompt } from '../models/JudgePrompt';
import type { JudgePromptCreate } from '../models/JudgePromptCreate';
import type { MLflowIntakeConfig } from '../models/MLflowIntakeConfig';
import type { MLflowIntakeConfigCreate } from '../models/MLflowIntakeConfigCreate';
import type { MLflowIntakeStatus } from '../models/MLflowIntakeStatus';
import type { MLflowTraceInfo } from '../models/MLflowTraceInfo';
import type { Rubric } from '../models/Rubric';
import type { RubricCreate } from '../models/RubricCreate';
import type { SimpleEvaluationRequest } from '../models/SimpleEvaluationRequest';
import type { Trace } from '../models/Trace';
import type { TraceUpload } from '../models/TraceUpload';
import type { Workshop } from '../models/Workshop';
import type { WorkshopCreate } from '../models/WorkshopCreate';
import type { WorkshopPhase } from '../models/WorkshopPhase';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class WorkshopsService {
    /**
     * List Workshops
     * List all workshops, optionally filtered by facilitator or user.
     *
     * Args:
     * facilitator_id: If provided, only return workshops created by this facilitator
     * user_id: If provided, return all workshops the user has access to (as facilitator or participant)
     * db: Database session
     *
     * Returns:
     * List of workshops sorted by creation date (newest first)
     * @param facilitatorId
     * @param userId
     * @returns Workshop Successful Response
     * @throws ApiError
     */
    public static listWorkshopsWorkshopsGet(
        facilitatorId?: (string | null),
        userId?: (string | null),
    ): CancelablePromise<Array<Workshop>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/',
            query: {
                'facilitator_id': facilitatorId,
                'user_id': userId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Create Workshop
     * Create a new workshop.
     * @param requestBody
     * @returns Workshop Successful Response
     * @throws ApiError
     */
    public static createWorkshopWorkshopsPost(
        requestBody: WorkshopCreate,
    ): CancelablePromise<Workshop> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Workshop
     * Get workshop details.
     * @param workshopId
     * @returns Workshop Successful Response
     * @throws ApiError
     */
    public static getWorkshopWorkshopsWorkshopIdGet(
        workshopId: string,
    ): CancelablePromise<Workshop> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Update Judge Name
     * Update the judge name for the workshop. Should be set before annotation phase.
     * @param workshopId
     * @param judgeName
     * @returns any Successful Response
     * @throws ApiError
     */
    public static updateJudgeNameWorkshopsWorkshopIdJudgeNamePut(
        workshopId: string,
        judgeName: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/workshops/{workshop_id}/judge-name',
            path: {
                'workshop_id': workshopId,
            },
            query: {
                'judge_name': judgeName,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Update Jsonpath Settings
     * Update JSONPath settings for trace display customization.
     *
     * These settings allow facilitators to configure JSONPath queries that
     * extract specific values from trace inputs and outputs for cleaner display
     * in the TraceViewer.
     * @param workshopId
     * @param requestBody
     * @returns Workshop Successful Response
     * @throws ApiError
     */
    public static updateJsonpathSettingsWorkshopsWorkshopIdJsonpathSettingsPut(
        workshopId: string,
        requestBody: JsonPathSettingsUpdate,
    ): CancelablePromise<Workshop> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/workshops/{workshop_id}/jsonpath-settings',
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
     * Preview Jsonpath
     * Preview JSONPath extraction against the first trace in the workshop.
     *
     * This allows facilitators to test their JSONPath queries before saving
     * to verify they extract the expected content.
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static previewJsonpathWorkshopsWorkshopIdPreviewJsonpathPost(
        workshopId: string,
        requestBody: JsonPathPreviewRequest,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/preview-jsonpath',
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
     * Resync Annotations
     * Re-sync all annotations to MLflow with the current workshop judge_name.
     *
     * This is useful when the judge_name changes after annotations were created.
     * Creates new MLflow feedback entries with the correct judge_name.
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static resyncAnnotationsWorkshopsWorkshopIdResyncAnnotationsPost(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/resync-annotations',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Upload Traces
     * Upload traces to a workshop.
     * @param workshopId
     * @param requestBody
     * @returns Trace Successful Response
     * @throws ApiError
     */
    public static uploadTracesWorkshopsWorkshopIdTracesPost(
        workshopId: string,
        requestBody: Array<TraceUpload>,
    ): CancelablePromise<Array<Trace>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/traces',
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
     * Get Traces
     * Get traces for a workshop in user-specific order.
     *
     * Args:
     * workshop_id: The workshop ID
     * user_id: The user ID (REQUIRED for personalized trace ordering)
     * db: Database session
     *
     * Returns:
     * List of traces in user-specific order
     *
     * Raises:
     * HTTPException: If workshop not found or user_id not provided
     * @param workshopId
     * @param userId
     * @returns Trace Successful Response
     * @throws ApiError
     */
    public static getTracesWorkshopsWorkshopIdTracesGet(
        workshopId: string,
        userId?: (string | null),
    ): CancelablePromise<Array<Trace>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/traces',
            path: {
                'workshop_id': workshopId,
            },
            query: {
                'user_id': userId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Delete All Traces
     * Delete all traces for a workshop and reset to intake phase (facilitator only).
     *
     * This allows starting over with new trace data.
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static deleteAllTracesWorkshopsWorkshopIdTracesDelete(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/workshops/{workshop_id}/traces',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get All Traces
     * Get ALL traces for a workshop, unfiltered by phase.
     * @param workshopId
     * @returns Trace Successful Response
     * @throws ApiError
     */
    public static getAllTracesWorkshopsWorkshopIdAllTracesGet(
        workshopId: string,
    ): CancelablePromise<Array<Trace>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/all-traces',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Original Traces
     * Get only the original intake traces for a workshop (no duplicates).
     *
     * This endpoint is used for judge tuning where we only want to evaluate
     * the original traces, not multiple instances from different annotators.
     * @param workshopId
     * @returns Trace Successful Response
     * @throws ApiError
     */
    public static getOriginalTracesWorkshopsWorkshopIdOriginalTracesGet(
        workshopId: string,
    ): CancelablePromise<Array<Trace>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/original-traces',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Create Rubric
     * Create or update rubric for a workshop.
     * @param workshopId
     * @param requestBody
     * @returns Rubric Successful Response
     * @throws ApiError
     */
    public static createRubricWorkshopsWorkshopIdRubricPost(
        workshopId: string,
        requestBody: RubricCreate,
    ): CancelablePromise<Rubric> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/rubric',
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
     * Update Rubric
     * Update rubric for a workshop.
     * @param workshopId
     * @param requestBody
     * @returns Rubric Successful Response
     * @throws ApiError
     */
    public static updateRubricWorkshopsWorkshopIdRubricPut(
        workshopId: string,
        requestBody: RubricCreate,
    ): CancelablePromise<Rubric> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/workshops/{workshop_id}/rubric',
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
     * Get Rubric
     * Get rubric for a workshop.
     * @param workshopId
     * @returns Rubric Successful Response
     * @throws ApiError
     */
    public static getRubricWorkshopsWorkshopIdRubricGet(
        workshopId: string,
    ): CancelablePromise<Rubric> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/rubric',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Clear Rubric
     * Clear the rubric for a workshop (for testing).
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static clearRubricWorkshopsWorkshopIdRubricDelete(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/workshops/{workshop_id}/rubric',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Update Rubric Question
     * Update a specific question in the rubric.
     * @param workshopId
     * @param questionId
     * @param requestBody
     * @returns Rubric Successful Response
     * @throws ApiError
     */
    public static updateRubricQuestionWorkshopsWorkshopIdRubricQuestionsQuestionIdPut(
        workshopId: string,
        questionId: string,
        requestBody: Record<string, any>,
    ): CancelablePromise<Rubric> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/workshops/{workshop_id}/rubric/questions/{question_id}',
            path: {
                'workshop_id': workshopId,
                'question_id': questionId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Delete Rubric Question
     * Delete a specific question from the rubric.
     * @param workshopId
     * @param questionId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static deleteRubricQuestionWorkshopsWorkshopIdRubricQuestionsQuestionIdDelete(
        workshopId: string,
        questionId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/workshops/{workshop_id}/rubric/questions/{question_id}',
            path: {
                'workshop_id': workshopId,
                'question_id': questionId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Submit Annotation
     * Submit an annotation for a trace.
     * @param workshopId
     * @param requestBody
     * @returns Annotation Successful Response
     * @throws ApiError
     */
    public static submitAnnotationWorkshopsWorkshopIdAnnotationsPost(
        workshopId: string,
        requestBody: AnnotationCreate,
    ): CancelablePromise<Annotation> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/annotations',
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
     * Get Annotations
     * Get annotations for a workshop, optionally filtered by user.
     * @param workshopId
     * @param userId
     * @returns Annotation Successful Response
     * @throws ApiError
     */
    public static getAnnotationsWorkshopsWorkshopIdAnnotationsGet(
        workshopId: string,
        userId?: (string | null),
    ): CancelablePromise<Array<Annotation>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/annotations',
            path: {
                'workshop_id': workshopId,
            },
            query: {
                'user_id': userId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Clear Annotations
     * Clear all annotations for a workshop (for testing).
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static clearAnnotationsWorkshopsWorkshopIdAnnotationsDelete(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/workshops/{workshop_id}/annotations',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Annotations With User Details
     * Get annotations with user details for facilitator view.
     * @param workshopId
     * @param userId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getAnnotationsWithUserDetailsWorkshopsWorkshopIdAnnotationsWithUsersGet(
        workshopId: string,
        userId?: (string | null),
    ): CancelablePromise<Array<Record<string, any>>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/annotations-with-users',
            path: {
                'workshop_id': workshopId,
            },
            query: {
                'user_id': userId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Irr
     * Calculate Inter-Rater Reliability for a workshop.
     * @param workshopId
     * @returns IRRResult Successful Response
     * @throws ApiError
     */
    public static getIrrWorkshopsWorkshopIdIrrGet(
        workshopId: string,
    ): CancelablePromise<IRRResult> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/irr',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Add Traces
     * Add additional traces to the current active phase (discovery or annotation).
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static addTracesWorkshopsWorkshopIdAddTracesPost(
        workshopId: string,
        requestBody: Record<string, any>,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/add-traces',
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
     * Add Discovery Traces
     * Add additional traces to the active discovery phase (legacy endpoint).
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static addDiscoveryTracesWorkshopsWorkshopIdAddDiscoveryTracesPost(
        workshopId: string,
        requestBody: Record<string, any>,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/add-discovery-traces',
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
     * Add Annotation Traces
     * Add additional traces to the annotation phase (legacy endpoint).
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static addAnnotationTracesWorkshopsWorkshopIdAddAnnotationTracesPost(
        workshopId: string,
        requestBody: Record<string, any>,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/add-annotation-traces',
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
     * Reorder Annotation Traces
     * Reorder annotation traces so completed ones come first, then in-progress ones.
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static reorderAnnotationTracesWorkshopsWorkshopIdReorderAnnotationTracesPost(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/reorder-annotation-traces',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Begin Annotation Phase
     * Begin the annotation phase with a subset of traces.
     *
     * Args:
     * workshop_id: The workshop ID
     * request: JSON body with optional fields:
     * - trace_limit: Number of traces to use (default: 10, -1 for all)
     * - randomize: Whether to randomize trace order per user (default: False)
     *
     * When randomize=False (default): All SMEs see traces in the same chronological order.
     * When randomize=True: All SMEs see the same set of traces but in different random orders.
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static beginAnnotationPhaseWorkshopsWorkshopIdBeginAnnotationPost(
        workshopId: string,
        requestBody?: Record<string, any>,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/begin-annotation',
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
     * Reset Annotation
     * Reset a workshop back to before annotation phase started (facilitator only).
     *
     * This allows changing the annotation configuration (e.g., trace selection, randomization).
     *
     * IMPORTANT: This clears ALL SME annotation progress:
     * - All annotations submitted by SMEs
     *
     * Traces are kept, but SMEs will start fresh from the beginning.
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static resetAnnotationWorkshopsWorkshopIdResetAnnotationPost(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/reset-annotation',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Advance To Rubric
     * Advance workshop from DISCOVERY to RUBRIC phase (facilitator only).
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static advanceToRubricWorkshopsWorkshopIdAdvanceToRubricPost(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/advance-to-rubric',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Advance To Annotation
     * Advance workshop from RUBRIC to ANNOTATION phase (facilitator only).
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static advanceToAnnotationWorkshopsWorkshopIdAdvanceToAnnotationPost(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/advance-to-annotation',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Advance To Results
     * Advance workshop from ANNOTATION to RESULTS phase (facilitator only).
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static advanceToResultsWorkshopsWorkshopIdAdvanceToResultsPost(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/advance-to-results',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Advance Workshop Phase
     * Generic phase advancement - use specific endpoints instead (facilitator only).
     * @param workshopId
     * @param targetPhase
     * @returns any Successful Response
     * @throws ApiError
     */
    public static advanceWorkshopPhaseWorkshopsWorkshopIdAdvancePhasePost(
        workshopId: string,
        targetPhase: WorkshopPhase,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/advance-phase',
            path: {
                'workshop_id': workshopId,
            },
            query: {
                'target_phase': targetPhase,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Workshop Participants
     * Get all participants for a workshop.
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getWorkshopParticipantsWorkshopsWorkshopIdParticipantsGet(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/participants',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Generate Rubric Test Data
     * Generate realistic rubric for testing.
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static generateRubricTestDataWorkshopsWorkshopIdGenerateRubricDataPost(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/generate-rubric-data',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Generate Annotation Test Data
     * Generate realistic annotations for testing.
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static generateAnnotationTestDataWorkshopsWorkshopIdGenerateAnnotationDataPost(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/generate-annotation-data',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Generate Test Data
     * Generate all test data (rubric + annotations) for development.
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static generateTestDataWorkshopsWorkshopIdGenerateTestDataPost(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/generate-test-data',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Advance To Judge Tuning
     * Advance workshop from ANNOTATION or RESULTS to JUDGE_TUNING phase (facilitator only).
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static advanceToJudgeTuningWorkshopsWorkshopIdAdvanceToJudgeTuningPost(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/advance-to-judge-tuning',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Advance To Unity Volume
     * Advance workshop from JUDGE_TUNING to UNITY_VOLUME phase (facilitator only).
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static advanceToUnityVolumeWorkshopsWorkshopIdAdvanceToUnityVolumePost(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/advance-to-unity-volume',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Upload Workshop To Volume
     * Upload workshop SQLite database to Unity Catalog volume using provided credentials.
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static uploadWorkshopToVolumeWorkshopsWorkshopIdUploadToVolumePost(
        workshopId: string,
        requestBody: Record<string, any>,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/upload-to-volume',
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
     * Download Workshop Database
     * Download the workshop SQLite database file.
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static downloadWorkshopDatabaseWorkshopsWorkshopIdDownloadDatabaseGet(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/download-database',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Complete Phase
     * Mark a phase as completed (facilitator only).
     * @param workshopId
     * @param phase
     * @returns any Successful Response
     * @throws ApiError
     */
    public static completePhaseWorkshopsWorkshopIdCompletePhasePhasePost(
        workshopId: string,
        phase: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/complete-phase/{phase}',
            path: {
                'workshop_id': workshopId,
                'phase': phase,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Resume Phase
     * Resume a completed phase (facilitator only).
     * @param workshopId
     * @param phase
     * @returns any Successful Response
     * @throws ApiError
     */
    public static resumePhaseWorkshopsWorkshopIdResumePhasePhasePost(
        workshopId: string,
        phase: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/resume-phase/{phase}',
            path: {
                'workshop_id': workshopId,
                'phase': phase,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Create Judge Prompt
     * Create a new judge prompt.
     * @param workshopId
     * @param requestBody
     * @returns JudgePrompt Successful Response
     * @throws ApiError
     */
    public static createJudgePromptWorkshopsWorkshopIdJudgePromptsPost(
        workshopId: string,
        requestBody: JudgePromptCreate,
    ): CancelablePromise<JudgePrompt> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/judge-prompts',
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
     * Get Judge Prompts
     * Get all judge prompts for a workshop.
     * @param workshopId
     * @returns JudgePrompt Successful Response
     * @throws ApiError
     */
    public static getJudgePromptsWorkshopsWorkshopIdJudgePromptsGet(
        workshopId: string,
    ): CancelablePromise<Array<JudgePrompt>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/judge-prompts',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Update Judge Prompt Metrics
     * Update performance metrics for a judge prompt.
     * @param workshopId
     * @param promptId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static updateJudgePromptMetricsWorkshopsWorkshopIdJudgePromptsPromptIdMetricsPut(
        workshopId: string,
        promptId: string,
        requestBody: Record<string, any>,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/workshops/{workshop_id}/judge-prompts/{prompt_id}/metrics',
            path: {
                'workshop_id': workshopId,
                'prompt_id': promptId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Evaluate Judge Prompt
     * Evaluate a judge prompt against human annotations.
     * @param workshopId
     * @param requestBody
     * @returns JudgePerformanceMetrics Successful Response
     * @throws ApiError
     */
    public static evaluateJudgePromptWorkshopsWorkshopIdEvaluateJudgePost(
        workshopId: string,
        requestBody: JudgeEvaluationRequest,
    ): CancelablePromise<JudgePerformanceMetrics> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/evaluate-judge',
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
     * Evaluate Judge Prompt Direct
     * Evaluate a judge prompt directly without saving it to history.
     * @param workshopId
     * @param requestBody
     * @returns JudgeEvaluationResult Successful Response
     * @throws ApiError
     */
    public static evaluateJudgePromptDirectWorkshopsWorkshopIdEvaluateJudgeDirectPost(
        workshopId: string,
        requestBody: JudgeEvaluationDirectRequest,
    ): CancelablePromise<JudgeEvaluationResult> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/evaluate-judge-direct',
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
     * Get Judge Evaluations
     * Get evaluation results for a specific judge prompt.
     * @param workshopId
     * @param promptId
     * @returns JudgeEvaluation Successful Response
     * @throws ApiError
     */
    public static getJudgeEvaluationsWorkshopsWorkshopIdJudgeEvaluationsPromptIdGet(
        workshopId: string,
        promptId: string,
    ): CancelablePromise<Array<JudgeEvaluation>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/judge-evaluations/{prompt_id}',
            path: {
                'workshop_id': workshopId,
                'prompt_id': promptId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Save Judge Evaluations
     * Save evaluation results for a specific judge prompt.
     * @param workshopId
     * @param promptId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static saveJudgeEvaluationsWorkshopsWorkshopIdJudgeEvaluationsPromptIdPost(
        workshopId: string,
        promptId: string,
        requestBody: Array<JudgeEvaluation>,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/judge-evaluations/{prompt_id}',
            path: {
                'workshop_id': workshopId,
                'prompt_id': promptId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Export Judge
     * Export a judge configuration.
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static exportJudgeWorkshopsWorkshopIdExportJudgePost(
        workshopId: string,
        requestBody: JudgeExportConfig,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/export-judge',
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
     * Configure Mlflow Intake
     * Configure MLflow intake for a workshop (token stored in memory, not database).
     * @param workshopId
     * @param requestBody
     * @returns MLflowIntakeConfig Successful Response
     * @throws ApiError
     */
    public static configureMlflowIntakeWorkshopsWorkshopIdMlflowConfigPost(
        workshopId: string,
        requestBody: MLflowIntakeConfigCreate,
    ): CancelablePromise<MLflowIntakeConfig> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/mlflow-config',
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
     * Get Mlflow Config
     * Get MLflow intake configuration for a workshop.
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getMlflowConfigWorkshopsWorkshopIdMlflowConfigGet(
        workshopId: string,
    ): CancelablePromise<(MLflowIntakeConfig | null)> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/mlflow-config',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Mlflow Intake Status
     * Get MLflow intake status for a workshop.
     * @param workshopId
     * @returns MLflowIntakeStatus Successful Response
     * @throws ApiError
     */
    public static getMlflowIntakeStatusWorkshopsWorkshopIdMlflowStatusGet(
        workshopId: string,
    ): CancelablePromise<MLflowIntakeStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/mlflow-status',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Test Mlflow Connection
     * Test MLflow connection and return experiment info.
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static testMlflowConnectionWorkshopsWorkshopIdMlflowTestConnectionPost(
        workshopId: string,
        requestBody: MLflowIntakeConfigCreate,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/mlflow-test-connection',
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
     * Ingest Mlflow Traces
     * Ingest traces from MLflow into the workshop.
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static ingestMlflowTracesWorkshopsWorkshopIdMlflowIngestPost(
        workshopId: string,
        requestBody: Record<string, any>,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/mlflow-ingest',
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
     * Get Mlflow Traces
     * Get available traces from MLflow (without ingesting).
     * @param workshopId
     * @param requestBody
     * @returns MLflowTraceInfo Successful Response
     * @throws ApiError
     */
    public static getMlflowTracesWorkshopsWorkshopIdMlflowTracesGet(
        workshopId: string,
        requestBody: MLflowIntakeConfigCreate,
    ): CancelablePromise<Array<MLflowTraceInfo>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/mlflow-traces',
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
     * Upload Csv Traces
     * Upload traces from a MLflow trace export CSV file.
     *
     * Expected CSV format (MLflow export):
     * - Required columns: request_preview, response_preview
     * - Optional columns: trace_id, execution_duration_ms, state, request, response,
     * spans, tags, trace_metadata, trace_location, assessments, etc.
     *
     * Example from MLflow export:
     * trace_id,request_preview,response_preview,execution_duration_ms,state,...
     * "tr-abc123","What is Python?","Python is a programming language",150,"OK",...
     * @param workshopId
     * @param formData
     * @returns any Successful Response
     * @throws ApiError
     */
    public static uploadCsvTracesWorkshopsWorkshopIdCsvUploadPost(
        workshopId: string,
        formData: Body_upload_csv_traces_workshops__workshop_id__csv_upload_post,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/csv-upload',
            path: {
                'workshop_id': workshopId,
            },
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Upload Csv And Log To Mlflow
     * Upload CSV with request/response data and log each row as an MLflow trace.
     *
     * This enables customers who don't have existing MLflow traces to participate
     * in the Judge Builder workshop by uploading conversational data as CSV.
     *
     * Expected CSV format:
     * - Required columns: request_preview, response_preview
     * - Optional columns: any additional metadata
     *
     * The endpoint will:
     * 1. Parse the CSV file
     * 2. For each row, create an MLflow trace with the request/response
     * 3. Store the traces locally with their MLflow trace IDs
     *
     * Environment variables used if parameters not provided:
     * - DATABRICKS_HOST
     * - DATABRICKS_TOKEN
     * - MLFLOW_EXPERIMENT_ID
     * @param workshopId
     * @param formData
     * @returns any Successful Response
     * @throws ApiError
     */
    public static uploadCsvAndLogToMlflowWorkshopsWorkshopIdCsvUploadToMlflowPost(
        workshopId: string,
        formData: Body_upload_csv_and_log_to_mlflow_workshops__workshop_id__csv_upload_to_mlflow_post,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/csv-upload-to-mlflow',
            path: {
                'workshop_id': workshopId,
            },
            formData: formData,
            mediaType: 'multipart/form-data',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Migrate Annotations To Multi Metric
     * Migrate old annotations (with single 'rating' field) to new format (with 'ratings' dict).
     * This populates the 'ratings' dictionary by copying the legacy 'rating' value to all rubric questions.
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static migrateAnnotationsToMultiMetricWorkshopsWorkshopIdMigrateAnnotationsPost(
        workshopId: string,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/migrate-annotations',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Update Trace Alignment Inclusion
     * Update whether a trace should be included in judge alignment.
     *
     * This allows facilitators to exclude traces with SME disagreement from the alignment process.
     * @param workshopId
     * @param traceId
     * @param includeInAlignment
     * @returns Trace Successful Response
     * @throws ApiError
     */
    public static updateTraceAlignmentInclusionWorkshopsWorkshopIdTracesTraceIdAlignmentPatch(
        workshopId: string,
        traceId: string,
        includeInAlignment: boolean,
    ): CancelablePromise<Trace> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/workshops/{workshop_id}/traces/{trace_id}/alignment',
            path: {
                'workshop_id': workshopId,
                'trace_id': traceId,
            },
            query: {
                'include_in_alignment': includeInAlignment,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Traces For Alignment
     * Get all traces that are marked for inclusion in judge alignment.
     *
     * Returns only traces where include_in_alignment is True.
     * @param workshopId
     * @returns Trace Successful Response
     * @throws ApiError
     */
    public static getTracesForAlignmentWorkshopsWorkshopIdTracesForAlignmentGet(
        workshopId: string,
    ): CancelablePromise<Array<Trace>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/traces-for-alignment',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Aggregate Trace Feedback
     * Aggregate all SME feedback for a trace and store it on the trace.
     *
     * This concatenates all non-empty comments from annotations on this trace
     * into a single sme_feedback field for use in alignment.
     * @param workshopId
     * @param traceId
     * @returns Trace Successful Response
     * @throws ApiError
     */
    public static aggregateTraceFeedbackWorkshopsWorkshopIdTracesTraceIdAggregateFeedbackPost(
        workshopId: string,
        traceId: string,
    ): CancelablePromise<Trace> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/traces/{trace_id}/aggregate-feedback',
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
     * Aggregate All Trace Feedback
     * Aggregate SME feedback for all annotated traces in the workshop.
     *
     * This is a batch operation that processes all traces and updates their sme_feedback fields.
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static aggregateAllTraceFeedbackWorkshopsWorkshopIdAggregateAllFeedbackPost(
        workshopId: string,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/aggregate-all-feedback',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Start Alignment Job
     * Start an alignment job in the background and return a job ID for polling.
     *
     * This is more reliable than SSE streaming as it avoids proxy buffering issues.
     * Use GET /alignment-job/{job_id} to poll for status and logs.
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static startAlignmentJobWorkshopsWorkshopIdStartAlignmentPost(
        workshopId: string,
        requestBody: AlignmentRequest,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/start-alignment',
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
     * Get Alignment Job Status
     * Get the status and logs of an alignment job.
     *
     * Use `since_log_index` to get only new logs since the last poll.
     * This allows efficient incremental updates without re-sending all logs.
     *
     * Returns:
     * - status: pending, running, completed, or failed
     * - logs: list of log messages (or new logs if since_log_index provided)
     * - log_count: total number of logs
     * - result: alignment result (if completed)
     * - error: error message (if failed)
     * @param workshopId
     * @param jobId
     * @param sinceLogIndex
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getAlignmentJobStatusWorkshopsWorkshopIdAlignmentJobJobIdGet(
        workshopId: string,
        jobId: string,
        sinceLogIndex?: number,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/alignment-job/{job_id}',
            path: {
                'workshop_id': workshopId,
                'job_id': jobId,
            },
            query: {
                'since_log_index': sinceLogIndex,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Start Evaluation Job
     * Start an evaluation job in the background and return a job ID for polling.
     *
     * This is more reliable than SSE streaming as it avoids proxy buffering issues.
     * Use GET /evaluation-job/{job_id} to poll for status and logs.
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static startEvaluationJobWorkshopsWorkshopIdStartEvaluationPost(
        workshopId: string,
        requestBody: AlignmentRequest,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/start-evaluation',
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
     * Start Simple Evaluation
     * Start a simple evaluation job using Databricks Model Serving (no MLflow required).
     *
     * This endpoint evaluates the judge prompt by directly calling a Databricks model serving
     * endpoint. This is useful when MLflow is not available or configured.
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static startSimpleEvaluationWorkshopsWorkshopIdStartSimpleEvaluationPost(
        workshopId: string,
        requestBody: SimpleEvaluationRequest,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/start-simple-evaluation',
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
     * Get Evaluation Job Status
     * Get the status and logs of an evaluation job.
     *
     * Use `since_log_index` to get only new logs since the last poll.
     * This allows efficient incremental updates without re-sending all logs.
     *
     * Returns:
     * - status: pending, running, completed, or failed
     * - logs: list of log messages (or new logs if since_log_index provided)
     * - log_count: total number of logs
     * - result: evaluation result (if completed)
     * - error: error message (if failed)
     * @param workshopId
     * @param jobId
     * @param sinceLogIndex
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getEvaluationJobStatusWorkshopsWorkshopIdEvaluationJobJobIdGet(
        workshopId: string,
        jobId: string,
        sinceLogIndex?: number,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/evaluation-job/{job_id}',
            path: {
                'workshop_id': workshopId,
                'job_id': jobId,
            },
            query: {
                'since_log_index': sinceLogIndex,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Alignment Status
     * Get the current alignment status for a workshop.
     *
     * Returns information about:
     * - Number of traces available for alignment
     * - Whether evaluation has been run
     * - Whether alignment is ready to run
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getAlignmentStatusWorkshopsWorkshopIdAlignmentStatusGet(
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
}
