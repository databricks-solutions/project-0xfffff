import React, { createContext, useContext, useState, useEffect, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { UsersService } from '@/client';

export interface User {
  id: string;
  email: string;
  name: string;
  role: 'facilitator' | 'sme' | 'participant';
  workshop_id: string;
  status: 'active' | 'inactive' | 'pending';
  created_at: string;
  last_active?: string;
}

export interface UserPermissions {
  can_view_discovery: boolean;
  can_create_findings: boolean;
  can_view_all_findings: boolean;
  can_create_rubric: boolean;
  can_view_rubric: boolean;
  can_annotate: boolean;
  can_view_all_annotations: boolean;
  can_view_results: boolean;
  can_manage_workshop: boolean;
  can_assign_annotations: boolean;
}

interface UserContextType {
  user: User | null;
  permissions: UserPermissions | null;
  setUser: (user: User | null) => void;
  login: (email: string, password: string) => Promise<void>;
  logout: () => void;
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
  const queryClient = useQueryClient();
  const [user, setUser] = useState<User | null>(null);
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  // Load user from localStorage on mount with validation
  useEffect(() => {
    const initializeUser = async () => {
      const savedUser = localStorage.getItem('workshop_user');
      if (savedUser) {
        try {
          const userData = JSON.parse(savedUser);
          
          // Validate user exists by trying to fetch their data
          try {
            const validatedUser = await UsersService.getUserUsersUserIdGet(userData.id);
            setUser(validatedUser);
            
            // Also restore workshop ID if user has one and it's not already set
            if (validatedUser.workshop_id) {
              const currentWorkshopId = localStorage.getItem('workshop_id');
              if (!currentWorkshopId) {
                localStorage.setItem('workshop_id', validatedUser.workshop_id);
              }
            }
            
            // Load permissions and wait for them before setting isLoading to false
            await loadPermissions(validatedUser.id);
          } catch (validationError: any) {
            const is404 = validationError.status === 404 || validationError.message?.includes('404');
            if (is404) {
              localStorage.removeItem('workshop_user');
              setUser(null);
              setPermissions(null);
            } else {
              // Other errors - still try to use cached user
              setUser(userData);
              // Try to load permissions but don't fail if it doesn't work
              try {
                await loadPermissions(userData.id);
              } catch (permError) {
                console.error('Failed to load permissions on cached user:', permError);
                // Set default minimal permissions to allow login
                setPermissions({
                  can_annotate: true,
                  can_view_rubric: true,
                  can_create_rubric: false,
                  can_manage_workshop: false,
                  can_assign_annotations: false,
                });
              }
            }
          }
        } catch (e) {
          console.error('Error initializing user:', e);
          localStorage.removeItem('workshop_user');
          setUser(null);
          setPermissions(null);
        }
      }
      // Always set isLoading to false at the end, even if no saved user
      setIsLoading(false);
    };
    
    initializeUser();
  }, []);

  // Save user to localStorage when it changes
  useEffect(() => {
    if (user) {
      localStorage.setItem('workshop_user', JSON.stringify(user));
    } else {
      localStorage.removeItem('workshop_user');
    }
  }, [user]);

  const loadPermissions = async (userId: string) => {
    try {
      const permissions = await UsersService.getUserPermissionsUsersUserIdPermissionsGet(userId);
      setPermissions(permissions);
      setError(null); // Clear any previous errors on successful load
    } catch (error: any) {
      console.error('Error loading permissions:', error);
      // Auto-recovery: If user not found (404), clear stale user data
      const is404 = error.status === 404 || error.message?.includes('404') || error.body?.detail?.includes('not found');
      if (is404) {
        localStorage.removeItem('workshop_user');
        setUser(null);
        setPermissions(null);
        setError('Your session has expired. Please log in again.');
      } else {
        // For other errors, set default permissions to allow basic access
        console.warn('Failed to load permissions, using defaults');
        setPermissions({
          can_annotate: true,
          can_view_rubric: true,
          can_create_rubric: false,
          can_manage_workshop: false,
          can_assign_annotations: false,
        });
        setError(null); // Don't show error to user for non-404 permission errors
      }
    }
  };

  const updateLastActive = async () => {
    if (user) {
      try {
        await UsersService.updateLastActiveUsersUsersUserIdLastActivePut(user.id);
      } catch (error) {
        // Silent fail for last active updates
      }
    }
  };

  const setUserWithPermissions = async (newUser: User | null) => {
    setUser(newUser);
    if (newUser) {
      try {
        await loadPermissions(newUser.id);
        
        // Invalidate all queries to refresh data after login
        queryClient.invalidateQueries();
        
        // Store workshop ID if present
        if (newUser.workshop_id) {
          const currentWorkshopId = localStorage.getItem('workshop_id');
          if (currentWorkshopId !== newUser.workshop_id) {
            localStorage.setItem('workshop_id', newUser.workshop_id);
          }
        }
      } catch (error) {
        console.error('Error setting user with permissions:', error);
        // Don't fail the login, permissions will have defaults
      }
    } else {
      setPermissions(null);
      setError(null);
    }
  };

  const login = async (email: string, password: string) => {
    try {
      setError(null); // Clear any previous errors before attempting login
      setIsLoading(true); // Set loading during login
      
      const response = await fetch('/users/auth/login', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Login failed');
      }

      const data = await response.json();
      
      // Set the user with permissions
      await setUserWithPermissions(data.user);
      
      setError(null); // Clear errors on successful login
    } catch (error: any) {
      setError(error.message || 'Login failed');
      throw new Error(error.message || 'Login failed');
    } finally {
      setIsLoading(false); // Always set loading to false after login attempt
    }
  };

  const logout = () => {
    setUser(null);
    setPermissions(null);

    localStorage.removeItem('workshop_user');
  };

  return (
    <UserContext.Provider
      value={{
        user,
        permissions,
        setUser: setUserWithPermissions,
        login,
        logout,
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
  
  const isFacilitator = user?.role === 'facilitator';
  const isSME = user?.role === 'sme';
  const isParticipant = user?.role === 'participant';
  
  const canViewDiscovery = permissions?.can_view_discovery ?? false;
  const canCreateFindings = permissions?.can_create_findings ?? false;
  const canViewAllFindings = permissions?.can_view_all_findings ?? false;
  const canCreateRubric = permissions?.can_create_rubric ?? false;
  const canViewRubric = permissions?.can_view_rubric ?? false;
  const canAnnotate = permissions?.can_annotate ?? false;
  const canViewAllAnnotations = permissions?.can_view_all_annotations ?? false;
  const canViewResults = permissions?.can_view_results ?? false;
  const canManageWorkshop = permissions?.can_manage_workshop ?? false;
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
    canAssignAnnotations
  };
};