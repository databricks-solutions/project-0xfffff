/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { ProjectSetupProgress } from '../models/ProjectSetupProgress';
import type { ProjectSetupRequest } from '../models/ProjectSetupRequest';
import type { ProjectSetupResponse } from '../models/ProjectSetupResponse';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class ProjectSetupService {
    /**
     * Start Project Setup
     * @param requestBody
     * @returns ProjectSetupResponse Successful Response
     * @throws ApiError
     */
    public static startProjectSetupProjectSetupPost(
        requestBody: ProjectSetupRequest,
    ): CancelablePromise<ProjectSetupResponse> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/project/setup',
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
    public static getProjectSetupStatusProjectSetupStatusGet(): CancelablePromise<ProjectSetupProgress> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/project/setup-status',
        });
    }
    /**
     * Get Project Setup Job
     * @param setupJobId
     * @returns ProjectSetupProgress Successful Response
     * @throws ApiError
     */
    public static getProjectSetupJobProjectSetupJobsSetupJobIdGet(
        setupJobId: string,
    ): CancelablePromise<ProjectSetupProgress> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/project/setup-jobs/{setup_job_id}',
            path: {
                'setup_job_id': setupJobId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
}
