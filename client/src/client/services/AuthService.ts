/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AuthSession } from '../models/AuthSession';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class AuthService {
    /**
     * Get Auth Session
     * @returns AuthSession Successful Response
     * @throws ApiError
     */
    public static getAuthSessionApiAuthSessionGet(): CancelablePromise<AuthSession> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/auth/session',
        });
    }
}
