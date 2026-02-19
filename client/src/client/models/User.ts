/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { UserRole } from './UserRole';
import type { UserStatus } from './UserStatus';
export type User = {
    id: string;
    email: string;
    name: string;
    role: UserRole;
    workshop_id?: (string | null);
    status?: UserStatus;
    created_at?: string;
    last_active?: (string | null);
    password_hash?: (string | null);
};

