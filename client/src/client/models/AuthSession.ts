/* generated using openapi-typescript-codegen -- do not edit */
/* istanbul ignore file */
/* tslint:disable */
/* eslint-disable */
import type { CurrentProjectSummary } from './CurrentProjectSummary';
import type { ProviderRole } from './ProviderRole';
import type { User } from './User';
import type { UserPermissions } from './UserPermissions';
export type AuthSession = {
    user: User;
    permissions: UserPermissions;
    provider: string;
    provider_role: ProviderRole;
    project?: (CurrentProjectSummary | null);
};

