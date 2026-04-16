/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ApplyGroupsRequest } from '../models/ApplyGroupsRequest';
import type { CreateDraftRubricItemRequest } from '../models/CreateDraftRubricItemRequest';
import type { CreateRubricFromDraftRequest } from '../models/CreateRubricFromDraftRequest';
import type { DiscoveryAgentRun } from '../models/DiscoveryAgentRun';
import type { DiscoveryComment } from '../models/DiscoveryComment';
import type { DiscoveryCommentCreateRequest } from '../models/DiscoveryCommentCreateRequest';
import type { DiscoveryCommentVoteRequest } from '../models/DiscoveryCommentVoteRequest';
import type { DiscoveryFeedback } from '../models/DiscoveryFeedback';
import type { DiscoveryFeedbackCreate } from '../models/DiscoveryFeedbackCreate';
import type { DiscoveryFeedbackWithUser } from '../models/DiscoveryFeedbackWithUser';
import type { DiscoveryFinding } from '../models/DiscoveryFinding';
import type { DiscoveryFindingCreate } from '../models/DiscoveryFindingCreate';
import type { DiscoveryFindingWithUser } from '../models/DiscoveryFindingWithUser';
import type { DiscoveryQuestionsModelConfig } from '../models/DiscoveryQuestionsModelConfig';
import type { DiscoveryQuestionsResponse } from '../models/DiscoveryQuestionsResponse';
import type { DiscoverySettingsConfig } from '../models/DiscoverySettingsConfig';
import type { DiscoverySummariesResponse } from '../models/DiscoverySummariesResponse';
import type { DraftRubricItem } from '../models/DraftRubricItem';
import type { GenerateFollowUpRequest } from '../models/GenerateFollowUpRequest';
import type { PromoteFindingRequest } from '../models/PromoteFindingRequest';
import type { Rubric } from '../models/Rubric';
import type { SubmitFindingV2Request } from '../models/SubmitFindingV2Request';
import type { SubmitFollowUpAnswerRequest } from '../models/SubmitFollowUpAnswerRequest';
import type { SuggestGroupsResponse } from '../models/SuggestGroupsResponse';
import type { UpdateDraftRubricItemRequest } from '../models/UpdateDraftRubricItemRequest';
import type { UpdateThresholdsRequest } from '../models/UpdateThresholdsRequest';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class DiscoveryService {
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
     * Update Discovery Settings
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static updateDiscoverySettingsWorkshopsWorkshopIdDiscoverySettingsPut(
        workshopId: string,
        requestBody: DiscoverySettingsConfig,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/workshops/{workshop_id}/discovery-settings',
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
     * @returns DiscoveryFeedbackWithUser Successful Response
     * @throws ApiError
     */
    public static getDiscoveryFeedbackWithUserDetailsWorkshopsWorkshopIdDiscoveryFeedbackWithUsersGet(
        workshopId: string,
        userId?: (string | null),
    ): CancelablePromise<Array<DiscoveryFeedbackWithUser>> {
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
     * Create Discovery Comment
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static createDiscoveryCommentWorkshopsWorkshopIdDiscoveryCommentsPost(
        workshopId: string,
        requestBody: DiscoveryCommentCreateRequest,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/discovery-comments',
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
     * List Discovery Comments
     * @param workshopId
     * @param traceId
     * @param milestoneRef
     * @param userId
     * @returns DiscoveryComment Successful Response
     * @throws ApiError
     */
    public static listDiscoveryCommentsWorkshopsWorkshopIdDiscoveryCommentsGet(
        workshopId: string,
        traceId: string,
        milestoneRef?: (string | null),
        userId?: (string | null),
    ): CancelablePromise<Array<DiscoveryComment>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/discovery-comments',
            path: {
                'workshop_id': workshopId,
            },
            query: {
                'trace_id': traceId,
                'milestone_ref': milestoneRef,
                'user_id': userId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Vote Discovery Comment
     * @param workshopId
     * @param commentId
     * @param requestBody
     * @returns DiscoveryComment Successful Response
     * @throws ApiError
     */
    public static voteDiscoveryCommentWorkshopsWorkshopIdDiscoveryCommentsCommentIdVotePost(
        workshopId: string,
        commentId: string,
        requestBody: DiscoveryCommentVoteRequest,
    ): CancelablePromise<DiscoveryComment> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/discovery-comments/{comment_id}/vote',
            path: {
                'workshop_id': workshopId,
                'comment_id': commentId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Discovery Agent Run
     * @param workshopId
     * @param runId
     * @returns DiscoveryAgentRun Successful Response
     * @throws ApiError
     */
    public static getDiscoveryAgentRunWorkshopsWorkshopIdDiscoveryAgentRunsRunIdGet(
        workshopId: string,
        runId: string,
    ): CancelablePromise<DiscoveryAgentRun> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/discovery-agent-runs/{run_id}',
            path: {
                'workshop_id': workshopId,
                'run_id': runId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Stream Discovery Agent Run
     * @param workshopId
     * @param runId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static streamDiscoveryAgentRunWorkshopsWorkshopIdDiscoveryAgentRunsRunIdStreamGet(
        workshopId: string,
        runId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/discovery-agent-runs/{run_id}/stream',
            path: {
                'workshop_id': workshopId,
                'run_id': runId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Stream Discovery Comments
     * @param workshopId
     * @param traceId
     * @param milestoneRef
     * @param userId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static streamDiscoveryCommentsWorkshopsWorkshopIdDiscoveryCommentsStreamGet(
        workshopId: string,
        traceId: string,
        milestoneRef?: (string | null),
        userId?: (string | null),
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/discovery-comments/stream',
            path: {
                'workshop_id': workshopId,
            },
            query: {
                'trace_id': traceId,
                'milestone_ref': milestoneRef,
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
     * Get all promoted findings (legacy endpoint, delegates to draft-rubric-items).
     * @param workshopId
     * @returns DraftRubricItem Successful Response
     * @throws ApiError
     */
    public static getDraftRubricWorkshopsWorkshopIdDraftRubricGet(
        workshopId: string,
    ): CancelablePromise<Array<DraftRubricItem>> {
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
     * Create Draft Rubric Item
     * Create a new draft rubric item.
     * @param workshopId
     * @param requestBody
     * @returns DraftRubricItem Successful Response
     * @throws ApiError
     */
    public static createDraftRubricItemWorkshopsWorkshopIdDraftRubricItemsPost(
        workshopId: string,
        requestBody: CreateDraftRubricItemRequest,
    ): CancelablePromise<DraftRubricItem> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/draft-rubric-items',
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
     * Get Draft Rubric Items
     * Get all draft rubric items for a workshop.
     * @param workshopId
     * @returns DraftRubricItem Successful Response
     * @throws ApiError
     */
    public static getDraftRubricItemsWorkshopsWorkshopIdDraftRubricItemsGet(
        workshopId: string,
    ): CancelablePromise<Array<DraftRubricItem>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/workshops/{workshop_id}/draft-rubric-items',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Suggest Draft Rubric Groups
     * LLM-suggested grouping of draft rubric items (not persisted).
     * @param workshopId
     * @returns SuggestGroupsResponse Successful Response
     * @throws ApiError
     */
    public static suggestDraftRubricGroupsWorkshopsWorkshopIdDraftRubricItemsSuggestGroupsPost(
        workshopId: string,
    ): CancelablePromise<SuggestGroupsResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/draft-rubric-items/suggest-groups',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Apply Draft Rubric Groups
     * Persist group assignments to draft rubric items.
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static applyDraftRubricGroupsWorkshopsWorkshopIdDraftRubricItemsApplyGroupsPost(
        workshopId: string,
        requestBody: ApplyGroupsRequest,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/draft-rubric-items/apply-groups',
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
     * Create Rubric From Draft
     * Create a rubric from draft rubric items.
     *
     * Groups become rubric questions (group_name -> title, item texts -> description).
     * Ungrouped items each become their own question. All default to LIKERT judge type.
     * @param workshopId
     * @param requestBody
     * @returns Rubric Successful Response
     * @throws ApiError
     */
    public static createRubricFromDraftWorkshopsWorkshopIdDraftRubricItemsCreateRubricPost(
        workshopId: string,
        requestBody: CreateRubricFromDraftRequest,
    ): CancelablePromise<Rubric> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/workshops/{workshop_id}/draft-rubric-items/create-rubric',
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
     * Update Draft Rubric Item
     * Update a draft rubric item.
     * @param workshopId
     * @param itemId
     * @param requestBody
     * @returns DraftRubricItem Successful Response
     * @throws ApiError
     */
    public static updateDraftRubricItemWorkshopsWorkshopIdDraftRubricItemsItemIdPut(
        workshopId: string,
        itemId: string,
        requestBody: UpdateDraftRubricItemRequest,
    ): CancelablePromise<DraftRubricItem> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/workshops/{workshop_id}/draft-rubric-items/{item_id}',
            path: {
                'workshop_id': workshopId,
                'item_id': itemId,
            },
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Delete Draft Rubric Item
     * Delete a draft rubric item.
     * @param workshopId
     * @param itemId
     * @returns any Successful Response
     * @throws ApiError
     */
    public static deleteDraftRubricItemWorkshopsWorkshopIdDraftRubricItemsItemIdDelete(
        workshopId: string,
        itemId: string,
    ): CancelablePromise<Record<string, any>> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/workshops/{workshop_id}/draft-rubric-items/{item_id}',
            path: {
                'workshop_id': workshopId,
                'item_id': itemId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
}
