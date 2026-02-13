import React from 'react';
import { AlertCircle, RefreshCw } from 'lucide-react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface ErrorBoundaryProps {
  children: React.ReactNode;
  /** Fallback UI to render on error. Receives error and reset function. */
  fallback?: React.ReactNode | ((props: { error: Error; reset: () => void }) => React.ReactNode);
  /** Called when an error is caught. Useful for telemetry/logging. */
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface ErrorBoundaryState {
  error: Error | null;
}

/**
 * React Error Boundary — catches unhandled render errors in child components
 * and displays a recovery UI instead of crashing the entire app.
 *
 * Must be a class component per React API requirements.
 */
export class ErrorBoundary extends React.Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { error };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo): void {
    this.props.onError?.(error, errorInfo);
  }

  reset = (): void => {
    this.setState({ error: null });
  };

  render(): React.ReactNode {
    if (this.state.error) {
      if (this.props.fallback) {
        if (typeof this.props.fallback === 'function') {
          return this.props.fallback({ error: this.state.error, reset: this.reset });
        }
        return this.props.fallback;
      }

      return <DefaultErrorFallback error={this.state.error} reset={this.reset} />;
    }

    return this.props.children;
  }
}

/** Full-page fallback for the root-level boundary. */
export function RootErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="min-h-screen bg-gray-50 flex items-center justify-center p-6">
      <Card className="max-w-lg w-full border-l-4 border-red-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-red-600" />
            Something went wrong
            <Badge className="ml-auto bg-red-50 text-red-600 border-red-200">Error</Badge>
          </CardTitle>
          <CardDescription>
            The application encountered an unexpected error.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <p className="text-sm text-gray-600">
            You can try recovering by clicking the button below. If the problem persists, refresh the page.
          </p>
          {import.meta.env.DEV && (
            <pre className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-3 overflow-auto max-h-40">
              {error.message}
              {error.stack && `\n\n${error.stack}`}
            </pre>
          )}
          <div className="flex gap-3">
            <Button onClick={reset} variant="default">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try again
            </Button>
            <Button onClick={() => window.location.reload()} variant="outline">
              Reload page
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

/** Inline fallback for page-level boundaries (keeps sidebar/header visible). */
export function PageErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return (
    <div className="flex items-center justify-center p-6 h-full">
      <Card className="max-w-md w-full border-l-4 border-amber-500">
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <AlertCircle className="h-5 w-5 text-amber-600" />
            Page error
            <Badge className="ml-auto bg-amber-50 text-amber-600 border-amber-200">Error</Badge>
          </CardTitle>
          <CardDescription>
            This section encountered an error, but you can keep using the rest of the app.
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {import.meta.env.DEV && (
            <pre className="text-xs text-red-700 bg-red-50 border border-red-200 rounded p-3 overflow-auto max-h-32">
              {error.message}
            </pre>
          )}
          <div className="flex gap-3">
            <Button onClick={reset} size="sm" variant="default">
              <RefreshCw className="h-4 w-4 mr-2" />
              Try again
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

function DefaultErrorFallback({ error, reset }: { error: Error; reset: () => void }) {
  return <PageErrorFallback error={error} reset={reset} />;
}
