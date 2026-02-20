/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AlignmentRequest } from '../models/AlignmentRequest';
import type { AnalyzeDiscoveryRequest } from '../models/AnalyzeDiscoveryRequest';
import type { Annotation } from '../models/Annotation';
import type { AnnotationCreate } from '../models/AnnotationCreate';
import type { AuthResponse } from '../models/AuthResponse';
import type { Body_call_chat_completion_databricks_chat_post } from '../models/Body_call_chat_completion_databricks_chat_post';
import type { Body_call_serving_endpoint_databricks_call_post } from '../models/Body_call_serving_endpoint_databricks_call_post';
import type { Body_upload_csv_and_log_to_mlflow_workshops__workshop_id__csv_upload_to_mlflow_post } from '../models/Body_upload_csv_and_log_to_mlflow_workshops__workshop_id__csv_upload_to_mlflow_post';
import type { Body_upload_csv_traces_workshops__workshop_id__csv_upload_post } from '../models/Body_upload_csv_traces_workshops__workshop_id__csv_upload_post';
import type { CustomLLMProviderConfigCreate } from '../models/CustomLLMProviderConfigCreate';
import type { CustomLLMProviderStatus } from '../models/CustomLLMProviderStatus';
import type { CustomLLMProviderTestResult } from '../models/CustomLLMProviderTestResult';
import type { DatabricksConfig } from '../models/DatabricksConfig';
import type { DatabricksConnectionTest } from '../models/DatabricksConnectionTest';
import type { DatabricksEndpointInfo } from '../models/DatabricksEndpointInfo';
import type { DatabricksResponse } from '../models/DatabricksResponse';
import type { DBSQLExportRequest } from '../models/DBSQLExportRequest';
import type { DBSQLExportResponse } from '../models/DBSQLExportResponse';
import type { DiscoveryFeedback } from '../models/DiscoveryFeedback';
import type { DiscoveryFeedbackCreate } from '../models/DiscoveryFeedbackCreate';
import type { DiscoveryFinding } from '../models/DiscoveryFinding';
import type { DiscoveryFindingCreate } from '../models/DiscoveryFindingCreate';
import type { DiscoveryFindingWithUser } from '../models/DiscoveryFindingWithUser';
import type { DiscoveryQuestionsModelConfig } from '../models/DiscoveryQuestionsModelConfig';
import type { DiscoveryQuestionsResponse } from '../models/DiscoveryQuestionsResponse';
import type { DiscoverySummariesResponse } from '../models/DiscoverySummariesResponse';
import type { FacilitatorConfigCreate } from '../models/FacilitatorConfigCreate';
import type { GenerateFollowUpRequest } from '../models/GenerateFollowUpRequest';
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
import type { ParticipantNote } from '../models/ParticipantNote';
import type { ParticipantNoteCreate } from '../models/ParticipantNoteCreate';
import type { PromoteFindingRequest } from '../models/PromoteFindingRequest';
import type { Rubric } from '../models/Rubric';
import type { RubricCreate } from '../models/RubricCreate';
import type { RubricGenerationRequest } from '../models/RubricGenerationRequest';
import type { RubricSuggestion } from '../models/RubricSuggestion';
import type { SimpleEvaluationRequest } from '../models/SimpleEvaluationRequest';
import type { SubmitFindingV2Request } from '../models/SubmitFindingV2Request';
import type { SubmitFollowUpAnswerRequest } from '../models/SubmitFollowUpAnswerRequest';
import type { Trace } from '../models/Trace';
import type { TraceUpload } from '../models/TraceUpload';
import type { UpdateThresholdsRequest } from '../models/UpdateThresholdsRequest';
import type { User } from '../models/User';
import type { UserCreate } from '../models/UserCreate';
import type { UserInvite } from '../models/UserInvite';
import type { UserLogin } from '../models/UserLogin';
import type { UserPermissions } from '../models/UserPermissions';
import type { UserRole } from '../models/UserRole';
import type { UserStatus } from '../models/UserStatus';
import type { Workshop } from '../models/Workshop';
import type { WorkshopCreate } from '../models/WorkshopCreate';
import type { WorkshopParticipant } from '../models/WorkshopParticipant';
import type { WorkshopPhase } from '../models/WorkshopPhase';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ApiService {
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
     * Submit Finding
     * @param workshopId
     * @param requestBody
     * @returns DiscoveryFinding Successful Response
     * @throws ApiError
     */
    public static submitFindingWorkshopsWorkshopIdFindingsPost(
        workshopId: string,
        requestBody: DiscoveryFindingCreate,
    ): CancelablePromise<DiscoveryFinding> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/findings',
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
     * Get Findings
     * @param workshopId
     * @param userId
     * @returns DiscoveryFinding Successful Response
     * @throws ApiError
     */
    public static getFindingsWorkshopsWorkshopIdFindingsGet(
        workshopId: string,
        userId?: (string | null),
    ): CancelablePromise<Array<DiscoveryFinding>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/findings',
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
     * Clear Findings
     * Clear all findings for a workshop (for testing).
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static clearFindingsWorkshopsWorkshopIdFindingsDelete(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/workshops/{workshop_id}/findings',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Findings With User Details
     * @param workshopId
     * @param userId
     * @returns DiscoveryFindingWithUser Successful Response
     * @throws ApiError
     */
    public static getFindingsWithUserDetailsWorkshopsWorkshopIdFindingsWithUsersGet(
        workshopId: string,
        userId?: (string | null),
    ): CancelablePromise<Array<DiscoveryFindingWithUser>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/findings-with-users',
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
     * Toggle Participant Notes
     * Toggle the show_participant_notes flag on a workshop.
     *
     * When enabled, participants see a notepad in the discovery view.
     * @param workshopId
     * @returns Workshop Successful Response
     * @throws ApiError
     */
    public static toggleParticipantNotesWorkshopsWorkshopIdToggleParticipantNotesPut(
        workshopId: string,
    ): CancelablePromise<Workshop> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/workshops/{workshop_id}/toggle-participant-notes',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Create Participant Note
     * Create or update a participant note.
     * @param workshopId
     * @param requestBody
     * @returns ParticipantNote Successful Response
     * @throws ApiError
     */
    public static createParticipantNoteWorkshopsWorkshopIdParticipantNotesPost(
        workshopId: string,
        requestBody: ParticipantNoteCreate,
    ): CancelablePromise<ParticipantNote> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/participant-notes',
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
     * Get Participant Notes
     * Get participant notes for a workshop, optionally filtered by user and/or phase.
     * @param workshopId
     * @param userId
     * @param phase
     * @returns ParticipantNote Successful Response
     * @throws ApiError
     */
    public static getParticipantNotesWorkshopsWorkshopIdParticipantNotesGet(
        workshopId: string,
        userId?: (string | null),
        phase?: (string | null),
    ): CancelablePromise<Array<ParticipantNote>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/participant-notes',
            path: {
                'workshop_id': workshopId,
            },
            query: {
                'user_id': userId,
                'phase': phase,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Delete Participant Note
     * Delete a participant note.
     * @param workshopId
     * @param noteId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static deleteParticipantNoteWorkshopsWorkshopIdParticipantNotesNoteIdDelete(
        workshopId: string,
        noteId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/workshops/{workshop_id}/participant-notes/{note_id}',
            path: {
                'workshop_id': workshopId,
                'note_id': noteId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Create Rubric
     * Create or update rubric for a workshop.
     *
     * After creating/updating, triggers an MLflow re-sync in the background.
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
     *
     * After updating, triggers an MLflow re-sync in the background.
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
     *
     * When the title changes, this triggers an MLflow re-sync to update judge names.
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
     *
     * After deletion, triggers an MLflow re-sync to update remaining judge names.
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
     *
     * Only considers ratings for questions that currently exist in the rubric.
     * Old ratings for deleted questions are ignored (but preserved in DB).
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
     * Begin Discovery Phase
     * Begin the discovery phase and distribute traces to participants.
     *
     * Args:
     * workshop_id: The workshop ID
     * trace_limit: Optional limit on number of traces to use (default: all)
     * randomize: Whether to randomize trace order per user (default: False - same order for all)
     * db: Database session
     * @param workshopId
     * @param traceLimit
     * @param randomize
     * @returns any Successful Response
     * @throws ApiError
     */
    public static beginDiscoveryPhaseWorkshopsWorkshopIdBeginDiscoveryPost(
        workshopId: string,
        traceLimit?: (number | null),
        randomize: boolean = false,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/begin-discovery',
            path: {
                'workshop_id': workshopId,
            },
            query: {
                'trace_limit': traceLimit,
                'randomize': randomize,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Add Traces
     * Add additional traces to the current active phase (discovery or annotation).
     *
     * When adding traces to annotation phase, automatically triggers LLM evaluation
     * for the newly added traces in the background.
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
     * - evaluation_model_name: Model to use for auto-evaluation (null to disable)
     *
     * When randomize=False (default): All SMEs see traces in the same chronological order.
     * When randomize=True: All SMEs see the same set of traces but in different random orders.
     *
     * This also triggers automatic LLM evaluation in the background using a judge prompt
     * derived from the rubric. Results are available immediately in the Results UI.
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static beginAnnotationPhaseWorkshopsWorkshopIdBeginAnnotationPost(
        workshopId: string,
        requestBody?: (Record<string, any> | null),
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
     * Reset Discovery
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static resetDiscoveryWorkshopsWorkshopIdResetDiscoveryPost(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/reset-discovery',
            path: {
                'workshop_id': workshopId,
            },
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
     * Advance To Discovery
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static advanceToDiscoveryWorkshopsWorkshopIdAdvanceToDiscoveryPost(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/advance-to-discovery',
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
     * Generate Discovery Test Data
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static generateDiscoveryTestDataWorkshopsWorkshopIdGenerateDiscoveryDataPost(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/generate-discovery-data',
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
     * Generate Rubric Suggestions
     * Generate rubric suggestions using AI analysis of discovery feedback.
     *
     * This endpoint uses a Databricks model serving endpoint to analyze
     * discovery findings and participant notes, then generates suggested
     * rubric criteria for the facilitator to review.
     *
     * Args:
     * workshop_id: Workshop ID to generate suggestions for
     * request: Generation parameters (endpoint_name, temperature, include_notes)
     * db: Database session
     *
     * Returns:
     * List of rubric suggestions with title, description, judge type, etc.
     *
     * Raises:
     * HTTPException 404: Workshop not found
     * HTTPException 400: No discovery feedback available
     * HTTPException 500: Generation or parsing failed
     * @param workshopId
     * @param requestBody
     * @returns RubricSuggestion Successful Response
     * @throws ApiError
     */
    public static generateRubricSuggestionsWorkshopsWorkshopIdGenerateRubricSuggestionsPost(
        workshopId: string,
        requestBody: RubricGenerationRequest,
    ): CancelablePromise<Array<RubricSuggestion>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/generate-rubric-suggestions',
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
     * Mark User Discovery Complete
     * @param workshopId
     * @param userId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static markUserDiscoveryCompleteWorkshopsWorkshopIdUsersUserIdCompleteDiscoveryPost(
        workshopId: string,
        userId: string,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/users/{user_id}/complete-discovery',
            path: {
                'workshop_id': workshopId,
                'user_id': userId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Discovery Completion Status
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getDiscoveryCompletionStatusWorkshopsWorkshopIdDiscoveryCompletionStatusGet(
        workshopId: string,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/discovery-completion-status',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Is User Discovery Complete
     * @param workshopId
     * @param userId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static isUserDiscoveryCompleteWorkshopsWorkshopIdUsersUserIdDiscoveryCompleteGet(
        workshopId: string,
        userId: string,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/users/{user_id}/discovery-complete',
            path: {
                'workshop_id': workshopId,
                'user_id': userId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Analyze Discovery
     * Trigger AI analysis of discovery feedback.
     *
     * Aggregates feedback by trace, detects disagreements deterministically,
     * and calls an LLM to distill findings.
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static analyzeDiscoveryWorkshopsWorkshopIdAnalyzeDiscoveryPost(
        workshopId: string,
        requestBody: AnalyzeDiscoveryRequest,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/analyze-discovery',
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
     * List Discovery Analyses
     * List discovery analyses for a workshop (newest first).
     * @param workshopId
     * @param template
     * @returns any Successful Response
     * @throws ApiError
     */
    public static listDiscoveryAnalysesWorkshopsWorkshopIdDiscoveryAnalysisGet(
        workshopId: string,
        template?: (string | null),
    ): CancelablePromise<Array<Record<string, any>>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/discovery-analysis',
            path: {
                'workshop_id': workshopId,
            },
            query: {
                'template': template,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Discovery Analysis
     * Get a single discovery analysis by ID.
     * @param workshopId
     * @param analysisId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getDiscoveryAnalysisWorkshopsWorkshopIdDiscoveryAnalysisAnalysisIdGet(
        workshopId: string,
        analysisId: string,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/discovery-analysis/{analysis_id}',
            path: {
                'workshop_id': workshopId,
                'analysis_id': analysisId,
            },
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
     * Get Auto Evaluation Status
     * Get the status of the auto-evaluation job that runs when annotation begins.
     *
     * Returns:
     * - status: pending, running, completed, failed, or not_started
     * - job_id: the job ID if auto-evaluation was started
     * - derived_prompt: the judge prompt derived from the rubric
     * - logs: job logs (if available)
     * - result: evaluation result (if completed)
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getAutoEvaluationStatusWorkshopsWorkshopIdAutoEvaluationStatusGet(
        workshopId: string,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/auto-evaluation-status',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Refresh Judge Prompt
     * Regenerate the judge prompt from the rubric without running evaluation.
     *
     * Use this to update the stored prompt after rubric changes.
     * The prompt is regenerated for a single criterion (not all combined).
     *
     * Args:
     * request: Optional JSON body with:
     * - question_index: Which rubric question to generate prompt for (default: 0)
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static refreshJudgePromptWorkshopsWorkshopIdRefreshJudgePromptPost(
        workshopId: string,
        requestBody?: (Record<string, any> | null),
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/refresh-judge-prompt',
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
     * Debug Evaluations
     * Debug endpoint to check evaluation storage.
     *
     * Shows raw data about prompts and evaluations in the database.
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static debugEvaluationsWorkshopsWorkshopIdDebugEvaluationsGet(
        workshopId: string,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/debug-evaluations',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Restart Auto Evaluation
     * Restart auto-evaluation by first tagging traces and then running evaluation.
     *
     * Use this when auto-evaluation failed because traces weren't tagged.
     * This endpoint will:
     * 1. Tag all active annotation traces with 'eval' label
     * 2. Start auto-evaluation jobs for EACH rubric question (multiple judges)
     *
     * Args:
     * request: Optional JSON body with:
     * - evaluation_model_name: Model to use (if not provided, uses stored model)
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static restartAutoEvaluationWorkshopsWorkshopIdRestartAutoEvaluationPost(
        workshopId: string,
        requestBody?: (Record<string, any> | null),
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/restart-auto-evaluation',
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
     * Get Auto Evaluation Results
     * Get the auto-evaluation LLM judge scores for traces.
     *
     * Returns the evaluation results from the auto-evaluation job that ran
     * when annotation began. This includes LLM judge scores for each trace.
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getAutoEvaluationResultsWorkshopsWorkshopIdAutoEvaluationResultsGet(
        workshopId: string,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/auto-evaluation-results',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Re Evaluate
     * Manually trigger re-evaluation with the derived or custom prompt.
     *
     * This is the "Re-evaluate" button functionality for when the user wants
     * to run evaluation again (e.g., after modifying the prompt).
     *
     * Args:
     * request: Optional JSON body with:
     * - judge_prompt: Custom judge prompt (if not provided, uses derived prompt)
     * - judge_name: Name of the judge to use (if not provided, uses workshop judge_name)
     * - judge_type: Type of judge ('likert', 'binary', 'freeform') - defaults to 'likert'
     * - evaluation_model_name: Model to use (default: uses stored model)
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static reEvaluateWorkshopsWorkshopIdReEvaluatePost(
        workshopId: string,
        requestBody?: (Record<string, any> | null),
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/re-evaluate',
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
    /**
     * Get Custom Llm Provider Status
     * Get the status of custom LLM provider configuration for a workshop.
     *
     * Returns configuration status including whether it's configured, enabled,
     * and whether an API key is available (without exposing the actual key).
     * @param workshopId
     * @returns CustomLLMProviderStatus Successful Response
     * @throws ApiError
     */
    public static getCustomLlmProviderStatusWorkshopsWorkshopIdCustomLlmProviderGet(
        workshopId: string,
    ): CancelablePromise<CustomLLMProviderStatus> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/custom-llm-provider',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Create Custom Llm Provider
     * Create or update custom LLM provider configuration for a workshop.
     *
     * The API key is stored in-memory only and will expire after 24 hours.
     * Configuration details (provider name, base URL, model name) are persisted.
     * @param workshopId
     * @param requestBody
     * @returns CustomLLMProviderStatus Successful Response
     * @throws ApiError
     */
    public static createCustomLlmProviderWorkshopsWorkshopIdCustomLlmProviderPost(
        workshopId: string,
        requestBody: CustomLLMProviderConfigCreate,
    ): CancelablePromise<CustomLLMProviderStatus> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/custom-llm-provider',
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
     * Delete Custom Llm Provider
     * Delete custom LLM provider configuration for a workshop.
     *
     * Removes both the persisted configuration and the in-memory API key.
     * @param workshopId
     * @returns void
     * @throws ApiError
     */
    public static deleteCustomLlmProviderWorkshopsWorkshopIdCustomLlmProviderDelete(
        workshopId: string,
    ): CancelablePromise<void> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/workshops/{workshop_id}/custom-llm-provider',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Test Custom Llm Provider
     * Test connection to the configured custom LLM provider.
     *
     * Makes a minimal API call to verify the endpoint is reachable and
     * the API key is valid. Returns response time on success.
     * @param workshopId
     * @returns CustomLLMProviderTestResult Successful Response
     * @throws ApiError
     */
    public static testCustomLlmProviderWorkshopsWorkshopIdCustomLlmProviderTestPost(
        workshopId: string,
    ): CancelablePromise<CustomLLMProviderTestResult> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/custom-llm-provider/test',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Discovery Questions
     * @param workshopId
     * @param traceId
     * @param userId
     * @param append
     * @returns DiscoveryQuestionsResponse Successful Response
     * @throws ApiError
     */
    public static getDiscoveryQuestionsWorkshopsWorkshopIdTracesTraceIdDiscoveryQuestionsGet(
        workshopId: string,
        traceId: string,
        userId?: (string | null),
        append: boolean = false,
    ): CancelablePromise<DiscoveryQuestionsResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/traces/{trace_id}/discovery-questions',
            path: {
                'workshop_id': workshopId,
                'trace_id': traceId,
            },
            query: {
                'user_id': userId,
                'append': append,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Update Discovery Questions Model
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static updateDiscoveryQuestionsModelWorkshopsWorkshopIdDiscoveryQuestionsModelPut(
        workshopId: string,
        requestBody: DiscoveryQuestionsModelConfig,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/workshops/{workshop_id}/discovery-questions-model',
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
     * Generate Discovery Summaries
     * @param workshopId
     * @param refresh
     * @returns DiscoverySummariesResponse Successful Response
     * @throws ApiError
     */
    public static generateDiscoverySummariesWorkshopsWorkshopIdDiscoverySummariesPost(
        workshopId: string,
        refresh: boolean = false,
    ): CancelablePromise<DiscoverySummariesResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/discovery-summaries',
            path: {
                'workshop_id': workshopId,
            },
            query: {
                'refresh': refresh,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Discovery Summaries
     * @param workshopId
     * @returns DiscoverySummariesResponse Successful Response
     * @throws ApiError
     */
    public static getDiscoverySummariesWorkshopsWorkshopIdDiscoverySummariesGet(
        workshopId: string,
    ): CancelablePromise<DiscoverySummariesResponse> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/discovery-summaries',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Submit Discovery Feedback
     * Submit initial feedback (label + comment) for a trace. Upsert behavior.
     * @param workshopId
     * @param requestBody
     * @returns DiscoveryFeedback Successful Response
     * @throws ApiError
     */
    public static submitDiscoveryFeedbackWorkshopsWorkshopIdDiscoveryFeedbackPost(
        workshopId: string,
        requestBody: DiscoveryFeedbackCreate,
    ): CancelablePromise<DiscoveryFeedback> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/discovery-feedback',
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
     * Get Discovery Feedback
     * Get all discovery feedback, optionally filtered by user_id.
     * @param workshopId
     * @param userId
     * @returns DiscoveryFeedback Successful Response
     * @throws ApiError
     */
    public static getDiscoveryFeedbackWorkshopsWorkshopIdDiscoveryFeedbackGet(
        workshopId: string,
        userId?: (string | null),
    ): CancelablePromise<Array<DiscoveryFeedback>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/discovery-feedback',
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
     * Generate Followup Question
     * Generate the next follow-up question for a trace's feedback.
     * @param workshopId
     * @param requestBody
     * @param questionNumber
     * @returns any Successful Response
     * @throws ApiError
     */
    public static generateFollowupQuestionWorkshopsWorkshopIdGenerateFollowupQuestionPost(
        workshopId: string,
        requestBody: GenerateFollowUpRequest,
        questionNumber: number = 1,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/generate-followup-question',
            path: {
                'workshop_id': workshopId,
            },
            query: {
                'question_number': questionNumber,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Submit Followup Answer
     * Append a Q&A pair to the feedback record.
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static submitFollowupAnswerWorkshopsWorkshopIdSubmitFollowupAnswerPost(
        workshopId: string,
        requestBody: SubmitFollowUpAnswerRequest,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/submit-followup-answer',
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
     * Get Discovery Feedback With User Details
     * Get all discovery feedback with user details (name, role) for facilitator view.
     * @param workshopId
     * @param userId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getDiscoveryFeedbackWithUserDetailsWorkshopsWorkshopIdDiscoveryFeedbackWithUsersGet(
        workshopId: string,
        userId?: (string | null),
    ): CancelablePromise<Array<Record<string, any>>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/discovery-feedback-with-users',
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
     * Submit Finding V2
     * Submit finding with real-time classification (v2 assisted facilitation).
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static submitFindingV2WorkshopsWorkshopIdFindingsV2Post(
        workshopId: string,
        requestBody: SubmitFindingV2Request,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/findings-v2',
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
     * Get Trace Discovery State
     * Get full structured state for facilitator.
     * @param workshopId
     * @param traceId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getTraceDiscoveryStateWorkshopsWorkshopIdTracesTraceIdDiscoveryStateGet(
        workshopId: string,
        traceId: string,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/traces/{trace_id}/discovery-state',
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
     * Get Discovery Progress
     * Get fuzzy global progress for participants.
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getDiscoveryProgressWorkshopsWorkshopIdDiscoveryProgressGet(
        workshopId: string,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/discovery-progress',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Promote Finding
     * Promote finding to draft rubric.
     * @param workshopId
     * @param findingId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static promoteFindingWorkshopsWorkshopIdFindingsFindingIdPromotePost(
        workshopId: string,
        findingId: string,
        requestBody: PromoteFindingRequest,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/findings/{finding_id}/promote',
            path: {
                'workshop_id': workshopId,
                'finding_id': findingId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Update Trace Thresholds
     * Update thresholds for trace.
     * @param workshopId
     * @param traceId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static updateTraceThresholdsWorkshopsWorkshopIdTracesTraceIdThresholdsPut(
        workshopId: string,
        traceId: string,
        requestBody: UpdateThresholdsRequest,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/workshops/{workshop_id}/traces/{trace_id}/thresholds',
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
     * Get Draft Rubric
     * Get all promoted findings.
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getDraftRubricWorkshopsWorkshopIdDraftRubricGet(
        workshopId: string,
    ): CancelablePromise<Array<Record<string, any>>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/draft-rubric',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Login
     * Authenticate a user with email and password.
     * @param requestBody
     * @returns AuthResponse Successful Response
     * @throws ApiError
     */
    public static loginUsersAuthLoginPost(
        requestBody: UserLogin,
    ): CancelablePromise<AuthResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/users/auth/login',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Create User
     * Create a new user (no authentication required).
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static createUserUsersPost(
        requestBody: UserCreate,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/users/',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * List Users
     * List users, optionally filtered by workshop or role.
     * @param workshopId
     * @param role
     * @returns User Successful Response
     * @throws ApiError
     */
    public static listUsersUsersGet(
        workshopId?: (string | null),
        role?: (UserRole | null),
    ): CancelablePromise<Array<User>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/users/',
            query: {
                'workshop_id': workshopId,
                'role': role,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * List Facilitator Configs
     * List all pre-configured facilitators (admin only).
     * @returns any Successful Response
     * @throws ApiError
     */
    public static listFacilitatorConfigsUsersAdminFacilitatorsGet(): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/users/admin/facilitators/',
        });
    }
    /**
     * Create Facilitator Config
     * Create a pre-configured facilitator (admin only).
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static createFacilitatorConfigUsersAdminFacilitatorsPost(
        requestBody: FacilitatorConfigCreate,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/users/admin/facilitators/',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Create Invitation
     * Create a new user invitation (facilitators only).
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static createInvitationUsersInvitationsPost(
        requestBody: UserInvite,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/users/invitations/',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * List Invitations
     * List invitations (facilitators only).
     * @param workshopId
     * @param status
     * @returns any Successful Response
     * @throws ApiError
     */
    public static listInvitationsUsersInvitationsGet(
        workshopId?: (string | null),
        status?: (string | null),
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/users/invitations/',
            query: {
                'workshop_id': workshopId,
                'status': status,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Add User To Workshop
     * Add a user to a workshop.
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static addUserToWorkshopUsersWorkshopsWorkshopIdUsersPost(
        workshopId: string,
        requestBody: UserCreate,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/users/workshops/{workshop_id}/users/',
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
     * List Workshop Users
     * List all users in a workshop.
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static listWorkshopUsersUsersWorkshopsWorkshopIdUsersGet(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/users/workshops/{workshop_id}/users/',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get User
     * Get user by ID.
     * @param userId
     * @returns User Successful Response
     * @throws ApiError
     */
    public static getUserUsersUserIdGet(
        userId: string,
    ): CancelablePromise<User> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/users/{user_id}',
            path: {
                'user_id': userId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Delete User
     * Delete a user (no authentication required).
     * @param userId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static deleteUserUsersUserIdDelete(
        userId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/users/{user_id}',
            path: {
                'user_id': userId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get User Permissions
     * Get user permissions based on their role.
     * @param userId
     * @returns UserPermissions Successful Response
     * @throws ApiError
     */
    public static getUserPermissionsUsersUserIdPermissionsGet(
        userId: string,
    ): CancelablePromise<UserPermissions> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/users/{user_id}/permissions',
            path: {
                'user_id': userId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Update User Status
     * Update user status.
     * @param userId
     * @param status
     * @returns any Successful Response
     * @throws ApiError
     */
    public static updateUserStatusUsersUserIdStatusPut(
        userId: string,
        status: UserStatus,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/users/{user_id}/status',
            path: {
                'user_id': userId,
            },
            query: {
                'status': status,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Update Last Active
     * Update user's last active timestamp.
     * @param userId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static updateLastActiveUsersUserIdLastActivePut(
        userId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/users/{user_id}/last-active',
            path: {
                'user_id': userId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Workshop Participants
     * Get all participants in a workshop.
     * @param workshopId
     * @returns WorkshopParticipant Successful Response
     * @throws ApiError
     */
    public static getWorkshopParticipantsUsersWorkshopsWorkshopIdParticipantsGet(
        workshopId: string,
    ): CancelablePromise<Array<WorkshopParticipant>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/users/workshops/{workshop_id}/participants',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Assign Traces To User
     * Assign specific traces to a user for annotation.
     * @param workshopId
     * @param userId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static assignTracesToUserUsersWorkshopsWorkshopIdParticipantsUserIdAssignTracesPost(
        workshopId: string,
        userId: string,
        requestBody: Array<string>,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/users/workshops/{workshop_id}/participants/{user_id}/assign-traces',
            path: {
                'workshop_id': workshopId,
                'user_id': userId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Assigned Traces
     * Get traces assigned to a specific user.
     * @param workshopId
     * @param userId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getAssignedTracesUsersWorkshopsWorkshopIdParticipantsUserIdAssignedTracesGet(
        workshopId: string,
        userId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/users/workshops/{workshop_id}/participants/{user_id}/assigned-traces',
            path: {
                'workshop_id': workshopId,
                'user_id': userId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Remove User From Workshop
     * Remove a user from a workshop (but keep them in the system).
     * @param workshopId
     * @param userId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static removeUserFromWorkshopUsersWorkshopsWorkshopIdUsersUserIdDelete(
        workshopId: string,
        userId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/users/workshops/{workshop_id}/users/{user_id}',
            path: {
                'workshop_id': workshopId,
                'user_id': userId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Update User Role In Workshop
     * Update a user's role in a workshop (SME <-> Participant).
     * @param workshopId
     * @param userId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static updateUserRoleInWorkshopUsersWorkshopsWorkshopIdUsersUserIdRolePut(
        workshopId: string,
        userId: string,
        requestBody: Record<string, any>,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/users/workshops/{workshop_id}/users/{user_id}/role',
            path: {
                'workshop_id': workshopId,
                'user_id': userId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Auto Assign Annotations
     * Automatically balance annotation assignments across SMEs and participants.
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static autoAssignAnnotationsUsersWorkshopsWorkshopIdAutoAssignAnnotationsPost(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/users/workshops/{workshop_id}/auto-assign-annotations',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Export Workshop To Dbsql
     * Export all workshop data from SQLite to Databricks DBSQL tables.
     *
     * This endpoint exports:
     * - All tables from the SQLite database
     * - Creates tables in DBSQL if they don't exist
     * - Inserts or overwrites data in DBSQL tables
     * @param workshopId
     * @param requestBody
     * @returns DBSQLExportResponse Successful Response
     * @throws ApiError
     */
    public static exportWorkshopToDbsqlDbsqlExportWorkshopIdExportPost(
        workshopId: string,
        requestBody: DBSQLExportRequest,
    ): CancelablePromise<DBSQLExportResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/dbsql-export/{workshop_id}/export',
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
     * Get Dbsql Export Status
     * Get the export status and summary for a workshop.
     * @param workshopId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static getDbsqlExportStatusDbsqlExportWorkshopIdExportStatusGet(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/dbsql-export/{workshop_id}/export-status',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Test Databricks Connection
     * Test the connection to a Databricks workspace.
     *
     * Args:
     * config: Databricks workspace configuration
     *
     * Returns:
     * Connection test results
     * @param requestBody
     * @returns DatabricksConnectionTest Successful Response
     * @throws ApiError
     */
    public static testDatabricksConnectionDatabricksTestConnectionPost(
        requestBody: DatabricksConfig,
    ): CancelablePromise<DatabricksConnectionTest> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/databricks/test-connection',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * List Serving Endpoints
     * List all available serving endpoints in the Databricks workspace.
     *
     * Args:
     * config: Databricks workspace configuration
     *
     * Returns:
     * List of serving endpoint information
     * @param requestBody
     * @returns DatabricksEndpointInfo Successful Response
     * @throws ApiError
     */
    public static listServingEndpointsDatabricksEndpointsGet(
        requestBody: DatabricksConfig,
    ): CancelablePromise<Array<DatabricksEndpointInfo>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/databricks/endpoints',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Endpoint Info
     * Get detailed information about a specific serving endpoint.
     *
     * Args:
     * endpoint_name: Name of the serving endpoint
     * config: Databricks workspace configuration
     *
     * Returns:
     * Detailed endpoint information
     * @param endpointName
     * @param requestBody
     * @returns DatabricksEndpointInfo Successful Response
     * @throws ApiError
     */
    public static getEndpointInfoDatabricksEndpointsEndpointNameGet(
        endpointName: string,
        requestBody: DatabricksConfig,
    ): CancelablePromise<DatabricksEndpointInfo> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/databricks/endpoints/{endpoint_name}',
            path: {
                'endpoint_name': endpointName,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Call Serving Endpoint
     * Call a Databricks serving endpoint with a prompt.
     *
     * Args:
     * request: Endpoint call request with prompt and parameters
     * config: Databricks workspace configuration
     *
     * Returns:
     * Response from the model
     * @param requestBody
     * @returns DatabricksResponse Successful Response
     * @throws ApiError
     */
    public static callServingEndpointDatabricksCallPost(
        requestBody: Body_call_serving_endpoint_databricks_call_post,
    ): CancelablePromise<DatabricksResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/databricks/call',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Call Chat Completion
     * Call a Databricks serving endpoint using chat completion format.
     *
     * Args:
     * request: Chat completion request with messages
     * config: Databricks workspace configuration
     *
     * Returns:
     * Response from the model
     * @param requestBody
     * @returns DatabricksResponse Successful Response
     * @throws ApiError
     */
    public static callChatCompletionDatabricksChatPost(
        requestBody: Body_call_chat_completion_databricks_chat_post,
    ): CancelablePromise<DatabricksResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/databricks/chat',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Evaluate Judge Prompt
     * Evaluate a judge prompt using Databricks serving endpoint.
     * This is specifically designed for judge evaluation with default parameters.
     *
     * Args:
     * request: Dictionary containing endpoint_name, prompt, config, temperature, max_tokens
     * db: Database session
     *
     * Returns:
     * Response from the model
     * @param requestBody
     * @returns DatabricksResponse Successful Response
     * @throws ApiError
     */
    public static evaluateJudgePromptDatabricksJudgeEvaluatePost(
        requestBody: Record<string, any>,
    ): CancelablePromise<DatabricksResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/databricks/judge-evaluate',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Simple Endpoint Call
     * Simple endpoint call for testing purposes.
     *
     * Args:
     * endpoint_name: Name of the serving endpoint
     * prompt: The prompt to send
     * temperature: Temperature for generation
     * max_tokens: Maximum tokens to generate
     * workspace_url: Databricks workspace URL
     * token: Databricks API token
     *
     * Returns:
     * Response from the model
     * @param endpointName
     * @param prompt
     * @param temperature
     * @param maxTokens
     * @param workspaceUrl
     * @param token
     * @returns any Successful Response
     * @throws ApiError
     */
    public static simpleEndpointCallDatabricksSimpleCallPost(
        endpointName: string,
        prompt: string,
        temperature: number = 0.5,
        maxTokens?: number,
        workspaceUrl?: string,
        token?: string,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/databricks/simple-call',
            query: {
                'endpoint_name': endpointName,
                'prompt': prompt,
                'temperature': temperature,
                'max_tokens': maxTokens,
                'workspace_url': workspaceUrl,
                'token': token,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
}
