/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ProjectSetupProgress } from '../models/ProjectSetupProgress';
import type { ProjectSetupRequest } from '../models/ProjectSetupRequest';
import type { ProjectSetupResponse } from '../models/ProjectSetupResponse';
import type { ProjectSetupState } from '../models/ProjectSetupState';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ProjectSetupService {
    /**
     * Get Project Setup
     * @returns ProjectSetupState Successful Response
     * @throws ApiError
     */
    public static getProjectSetupApiProjectSetupGet(): CancelablePromise<ProjectSetupState> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/project/setup',
        });
    }
    /**
     * Start Project Setup
     * @param requestBody
     * @returns ProjectSetupResponse Successful Response
     * @throws ApiError
     */
    public static startProjectSetupApiProjectSetupPost(
        requestBody: ProjectSetupRequest,
    ): CancelablePromise<ProjectSetupResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/project/setup',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Update Project Setup
     * @param requestBody
     * @returns ProjectSetupState Successful Response
     * @throws ApiError
     */
    public static updateProjectSetupApiProjectSetupPatch(
        requestBody: ProjectSetupRequest,
    ): CancelablePromise<ProjectSetupState> {
        return __request(OpenAPI, {
            method: 'PATCH',
            url: '/api/project/setup',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Project Setup Status
     * @returns ProjectSetupProgress Successful Response
     * @throws ApiError
     */
    public static getProjectSetupStatusApiProjectSetupStatusGet(): CancelablePromise<ProjectSetupProgress> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/project/setup-status',
        });
    }
    /**
     * Get Project Setup Job
     * @param setupJobId
     * @returns ProjectSetupProgress Successful Response
     * @throws ApiError
     */
    public static getProjectSetupJobApiProjectSetupJobsSetupJobIdGet(
        setupJobId: string,
    ): CancelablePromise<ProjectSetupProgress> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/project/setup-jobs/{setup_job_id}',
            path: {
                'setup_job_id': setupJobId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
}
