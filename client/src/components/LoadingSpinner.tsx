import React from 'react';
import { Loader2, RefreshCw } from 'lucide-react';
import { Button } from './ui/button';

interface LoadingSpinnerProps {
  message?: string;
  subMessage?: string;
  showRetry?: boolean;
  onRetry?: () => void;
  size?: 'sm' | 'md' | 'lg';
}

export function LoadingSpinner({ 
  message = 'Loading...', 
  subMessage,
  showRetry = false,
  onRetry,
  size = 'md'
}: LoadingSpinnerProps) {
  const sizeClasses = {
    sm: 'h-4 w-4',
    md: 'h-8 w-8',
    lg: 'h-12 w-12'
  };

  return (
    <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
      <div className="text-center">
        <Loader2 className={`${sizeClasses[size]} mx-auto mb-4 animate-spin text-blue-600`} />
        <div className="text-lg font-medium text-gray-600 mb-2">{message}</div>
        {subMessage && (
          <div className="text-sm text-gray-500 mb-4">{subMessage}</div>
        )}
        {showRetry && onRetry && (
          <Button 
            variant="outline" 
            size="sm" 
            onClick={onRetry}
            className="flex items-center gap-2"
          >
            <RefreshCw className="h-4 w-4" />
            Retry
          </Button>
        )}
      </div>
    </div>
  );
}

