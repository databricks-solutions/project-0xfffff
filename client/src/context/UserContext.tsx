import React, { createContext, useContext, ReactNode } from 'react';
import { type User, type UserPermissions, UserRole } from '@/client';
import { useAuthSession } from '@/hooks/useAuthSession';

interface UserContextType {
  user: User | null;
  permissions: UserPermissions | null;
  refreshSession: () => Promise<void>;
  updateLastActive: () => void;
  isLoading: boolean;
  error: string | null;
}

const UserContext = createContext<UserContextType | undefined>(undefined);

export const useUser = () => {
  const context = useContext(UserContext);
  if (context === undefined) {
    throw new Error('useUser must be used within a UserProvider');
  }
  return context;
};

interface UserProviderProps {
  children: ReactNode;
}

export const UserProvider: React.FC<UserProviderProps> = ({ children }) => {
  const sessionQuery = useAuthSession();
  const user = sessionQuery.data?.user ?? null;
  const permissions = sessionQuery.data?.permissions ?? null;
  const isLoading = sessionQuery.isLoading;
  const error = sessionQuery.error instanceof Error ? sessionQuery.error.message : null;

  const updateLastActive = async () => {
    // Last-active updates happen during backend session resolution.
  };

  return (
    <UserContext.Provider
      value={{
        user,
        permissions,
        refreshSession: async () => {
          await sessionQuery.refetch();
        },
        updateLastActive,
        isLoading,
        error
      }}
    >
      {children}
    </UserContext.Provider>
  );
};

// Role-based access control helpers
export const useRoleCheck = () => {
  const { user, permissions } = useUser();
  
  const isFacilitator = user?.role === UserRole.FACILITATOR;
  const isSME = user?.role === UserRole.SME;
  const isParticipant = user?.role === UserRole.PARTICIPANT;
  
  const canViewDiscovery = permissions?.can_view_discovery ?? false;
  const canCreateFindings = permissions?.can_create_findings ?? false;
  const canViewAllFindings = permissions?.can_view_all_findings ?? false;
  const canCreateRubric = permissions?.can_create_rubric ?? false;
  const canViewRubric = permissions?.can_view_rubric ?? false;
  const canAnnotate = permissions?.can_annotate ?? false;
  const canViewAllAnnotations = permissions?.can_view_all_annotations ?? false;
  const canViewResults = permissions?.can_view_results ?? false;
  const canManageWorkshop = permissions?.can_manage_workshop ?? false;
  const canManageProject = permissions?.can_manage_project ?? false;
  const canAssignAnnotations = permissions?.can_assign_annotations ?? false;

  return {
    isFacilitator,
    isSME,
    isParticipant,
    canViewDiscovery,
    canCreateFindings,
    canViewAllFindings,
    canCreateRubric,
    canViewRubric,
    canAnnotate,
    canViewAllAnnotations,
    canViewResults,
    canManageWorkshop,
    canManageProject,
    canAssignAnnotations
  };
};