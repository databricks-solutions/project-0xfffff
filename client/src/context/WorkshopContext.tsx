/**
 * Workshop context for managing workshop state across the application
 */

import React, { createContext, useContext, useState, ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import type { Workshop } from '@/client';
import { useUser } from './UserContext';

interface WorkshopContextType {
  workshopId: string | null;
  workshop: Workshop | null;
  setWorkshopId: (id: string | null) => void;
  setWorkshop: (workshop: Workshop | null) => void;
  workflowMode: 'filled' | 'manual';
  setWorkflowMode: (mode: 'filled' | 'manual') => void;
  clearInvalidWorkshopId: () => void;
}

const WorkshopContext = createContext<WorkshopContextType | undefined>(undefined);

interface WorkshopProviderProps {
  children: ReactNode;
  restoredWorkshopId?: string | null;
}

// Get workshop ID from URL path or query params, or localStorage fallback
const getWorkshopIdFromUrl = (): string | null => {
  const path = window.location.pathname;
  const search = window.location.search;
  
  // Try URL path pattern: /workshop/id
  let workshopMatch = path.match(/\/workshop\/([a-f0-9-]{36})/);
  if (workshopMatch) {
    const workshopId = workshopMatch[1];
    
    
    // Clear localStorage if URL has a different workshop ID
    const savedWorkshopId = localStorage.getItem('workshop_id');
    if (savedWorkshopId && savedWorkshopId !== workshopId) {
      
      localStorage.removeItem('workshop_id');
    }
    
    return workshopId;
  }
  
  // Try query parameter: ?workshop=id
  const urlParams = new URLSearchParams(search);
  const workshopParam = urlParams.get('workshop');
  if (workshopParam && workshopParam.match(/^[a-f0-9-]{36}$/)) {
    
    
    // Clear localStorage if URL has a different workshop ID
    const savedWorkshopId = localStorage.getItem('workshop_id');
    if (savedWorkshopId && savedWorkshopId !== workshopParam) {
      
      localStorage.removeItem('workshop_id');
    }
    
    return workshopParam;
  }
  
  // Try localStorage as fallback, but validate it first
  const savedWorkshopId = localStorage.getItem('workshop_id');
  if (savedWorkshopId && savedWorkshopId.match(/^[a-f0-9-]{36}$/)) {
    // Check if this is the known invalid workshop ID and clear it
    if (savedWorkshopId === '569c0be9-3782-4587-a595-98033265c7dc') {
      
      localStorage.removeItem('workshop_id');
      return null;
    }
    
    return savedWorkshopId;
  }
  
  // No workshop ID found
  
  return null;
};

export function WorkshopProvider({ children, restoredWorkshopId }: WorkshopProviderProps) {
  // Get query client FIRST, before state initialization
  const queryClient = useQueryClient();
  const { user } = useUser();
  
  const [workshopId, setWorkshopId] = useState<string | null>(() => {
    const urlWorkshopId = getWorkshopIdFromUrl();
    
    
    // Clear React Query cache if we have a workshop ID from URL
    // This ensures we don't use stale data from a previous workshop
    if (urlWorkshopId) {
      
      queryClient.clear();
    }
    
    return urlWorkshopId;
  });
  const [workshop, setWorkshop] = useState<Workshop | null>(null);
  const [workflowMode, setWorkflowMode] = useState<'filled' | 'manual'>('filled');

  const handleSetWorkshopId = (id: string | null) => {
    if (id !== workshopId) {
      
      
      // Clear all cached queries when workshop ID changes
      queryClient.invalidateQueries();
      queryClient.clear();
      setWorkshopId(id);
      setWorkshop(null);
      
      // Persist workshop ID to localStorage
      if (id) {
        localStorage.setItem('workshop_id', id);
        
      } else {
        localStorage.removeItem('workshop_id');
        
      }
    }
  };

  const clearInvalidWorkshopId = () => {
    
    localStorage.removeItem('workshop_id');
    queryClient.invalidateQueries();
    queryClient.clear();
    setWorkshopId(null);
    setWorkshop(null);
  };

  // Sync with UserContext
  React.useEffect(() => {
    // If user is logged in and has a workshop ID that differs from current context, sync it.
    // This handles the login redirection case where UserContext updates but WorkshopContext needs to follow.
    if (user?.workshop_id && user.workshop_id !== workshopId) {
      handleSetWorkshopId(user.workshop_id);
    }
  }, [user, workshopId]);

  // Handle restored workshop ID from user context
  React.useEffect(() => {
    if (restoredWorkshopId && !workshopId) {
      
      handleSetWorkshopId(restoredWorkshopId);
    }
  }, [restoredWorkshopId, workshopId]);

  // Force refresh when component mounts to ensure fresh data
  // REMOVED: This was causing old cached queries to refetch
  // React.useEffect(() => {
  //   queryClient.invalidateQueries();
  // }, []);

  // Listen for URL changes to update workshop ID
  React.useEffect(() => {
    const handleUrlChange = () => {
      const newWorkshopId = getWorkshopIdFromUrl();
      
      if (newWorkshopId && newWorkshopId !== workshopId) {
        
        
        // IMPORTANT: Clear ALL queries before switching workshop
        // This prevents stale data from old workshop ID
        
        queryClient.clear();
        queryClient.removeQueries(); // More aggressive cleanup
        
        handleSetWorkshopId(newWorkshopId);
      }
    };

    // Listen for popstate events (back/forward navigation)
    window.addEventListener('popstate', handleUrlChange);
    
    // Check for URL changes on mount
    handleUrlChange();
    
    return () => {
      window.removeEventListener('popstate', handleUrlChange);
    };
  }, [workshopId, queryClient]);

  return (
    <WorkshopContext.Provider 
      value={{
        workshopId,
        workshop,
        setWorkshopId: handleSetWorkshopId,
        setWorkshop,
        workflowMode,
        setWorkflowMode,
        clearInvalidWorkshopId,
      }}
    >
      {children}
    </WorkshopContext.Provider>
  );
}

export function useWorkshopContext() {
  const context = useContext(WorkshopContext);
  if (context === undefined) {
    throw new Error('useWorkshopContext must be used within a WorkshopProvider');
  }
  return context;
}