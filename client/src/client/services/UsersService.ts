/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { AuthResponse } from '../models/AuthResponse';
import type { FacilitatorConfigCreate } from '../models/FacilitatorConfigCreate';
import type { User } from '../models/User';
import type { UserCreate } from '../models/UserCreate';
import type { UserInvite } from '../models/UserInvite';
import type { UserLogin } from '../models/UserLogin';
import type { UserPermissions } from '../models/UserPermissions';
import type { UserRole } from '../models/UserRole';
import type { UserStatus } from '../models/UserStatus';
import type { WorkshopParticipant } from '../models/WorkshopParticipant';
import type { CancelablePromise } from '../core/CancelablePromise';
import { OpenAPI } from '../core/OpenAPI';
import { request as __request } from '../core/request';
export class UsersService {
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
}
