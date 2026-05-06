/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { User } from '../models/User';
import type { UserCreate } from '../models/UserCreate';
import type { UserPermissions } from '../models/UserPermissions';
import type { UserRole } from '../models/UserRole';
import type { UserStatus } from '../models/UserStatus';
import type { WorkshopParticipant } from '../models/WorkshopParticipant';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class UsersService {
    /**
     * Create User
     * Create a pending provider-authenticated user.
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static createUserApiUsersPost(
        requestBody: UserCreate,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/users/',
            body: requestBody,
            mediaType: 'application/json',
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * List Users
     * List materialized app users, optionally filtered by workshop or role.
     * @param workshopId
     * @param role
     * @returns User Successful Response
     * @throws ApiError
     */
    public static listUsersApiUsersGet(
        workshopId?: (string | null),
        role?: (UserRole | null),
    ): CancelablePromise<Array<User>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/users/',
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
     * Add User To Workshop
     * Add a user to a workshop.
     * @param workshopId
     * @param requestBody
     * @returns any Successful Response
     * @throws ApiError
     */
    public static addUserToWorkshopApiUsersWorkshopsWorkshopIdUsersPost(
        workshopId: string,
        requestBody: UserCreate,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/users/workshops/{workshop_id}/users/',
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
    public static listWorkshopUsersApiUsersWorkshopsWorkshopIdUsersGet(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/users/workshops/{workshop_id}/users/',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
    /**
     * Get Current User Profile
     * @returns User Successful Response
     * @throws ApiError
     */
    public static getCurrentUserProfileApiUsersMeGet(): CancelablePromise<User> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/users/me',
        });
    }
    /**
     * Get User
     * Get user by ID.
     * @param userId
     * @returns User Successful Response
     * @throws ApiError
     */
    public static getUserApiUsersUserIdGet(
        userId: string,
    ): CancelablePromise<User> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/users/{user_id}',
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
    public static deleteUserApiUsersUserIdDelete(
        userId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/users/{user_id}',
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
    public static getUserPermissionsApiUsersUserIdPermissionsGet(
        userId: string,
    ): CancelablePromise<UserPermissions> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/users/{user_id}/permissions',
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
    public static updateUserStatusApiUsersUserIdStatusPut(
        userId: string,
        status: UserStatus,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/users/{user_id}/status',
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
    public static updateLastActiveApiUsersUserIdLastActivePut(
        userId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/users/{user_id}/last-active',
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
    public static getWorkshopParticipantsApiUsersWorkshopsWorkshopIdParticipantsGet(
        workshopId: string,
    ): CancelablePromise<Array<WorkshopParticipant>> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/users/workshops/{workshop_id}/participants',
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
    public static assignTracesToUserApiUsersWorkshopsWorkshopIdParticipantsUserIdAssignTracesPost(
        workshopId: string,
        userId: string,
        requestBody: Array<string>,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/users/workshops/{workshop_id}/participants/{user_id}/assign-traces',
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
    public static getAssignedTracesApiUsersWorkshopsWorkshopIdParticipantsUserIdAssignedTracesGet(
        workshopId: string,
        userId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'GET',
            url: '/api/users/workshops/{workshop_id}/participants/{user_id}/assigned-traces',
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
    public static removeUserFromWorkshopApiUsersWorkshopsWorkshopIdUsersUserIdDelete(
        workshopId: string,
        userId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'DELETE',
            url: '/api/users/workshops/{workshop_id}/users/{user_id}',
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
    public static updateUserRoleInWorkshopApiUsersWorkshopsWorkshopIdUsersUserIdRolePut(
        workshopId: string,
        userId: string,
        requestBody: Record<string, any>,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'PUT',
            url: '/api/users/workshops/{workshop_id}/users/{user_id}/role',
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
    public static autoAssignAnnotationsApiUsersWorkshopsWorkshopIdAutoAssignAnnotationsPost(
        workshopId: string,
    ): CancelablePromise<any> {
        return __request(OpenAPI, {
            method: 'POST',
            url: '/api/users/workshops/{workshop_id}/auto-assign-annotations',
            path: {
                'workshop_id': workshopId,
            },
            errors: {
                422: `Validation Error`,
            },
        });
    }
}
