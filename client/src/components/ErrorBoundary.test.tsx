import React from 'react';
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { ErrorBoundary, RootErrorFallback, PageErrorFallback } from './ErrorBoundary';

// Suppress React error boundary console.error noise in test output
beforeEach(() => {
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

function ThrowingComponent({ message }: { message?: string }): React.ReactNode {
  throw new Error(message ?? 'test render error');
}

function GoodComponent() {
  return <div>All good</div>;
}

describe('ErrorBoundary', () => {
  it('renders children when there is no error', () => {
    render(
      <ErrorBoundary>
        <GoodComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('All good')).toBeInTheDocument();
  });

  it('renders default fallback when a child throws', () => {
    render(
      <ErrorBoundary>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Page error')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('renders custom fallback element', () => {
    render(
      <ErrorBoundary fallback={<div>Custom fallback</div>}>
        <ThrowingComponent />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Custom fallback')).toBeInTheDocument();
  });

  it('renders custom fallback function with error and reset', () => {
    render(
      <ErrorBoundary
        fallback={({ error, reset }) => (
          <div>
            <span>Error: {error.message}</span>
            <button onClick={reset}>Reset</button>
          </div>
        )}
      >
        <ThrowingComponent message="kaboom" />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Error: kaboom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reset' })).toBeInTheDocument();
  });

  it('calls onError callback when an error is caught', () => {
    const onError = vi.fn();
    render(
      <ErrorBoundary onError={onError}>
        <ThrowingComponent message="callback test" />
      </ErrorBoundary>,
    );
    expect(onError).toHaveBeenCalledOnce();
    expect(onError.mock.calls[0][0]).toBeInstanceOf(Error);
    expect(onError.mock.calls[0][0].message).toBe('callback test');
  });

  it('recovers from error when reset is triggered', async () => {
    const user = userEvent.setup();
    let shouldThrow = true;

    function MaybeThrows() {
      if (shouldThrow) throw new Error('conditional error');
      return <div>Recovered</div>;
    }

    render(
      <ErrorBoundary>
        <MaybeThrows />
      </ErrorBoundary>,
    );
    expect(screen.getByText('Page error')).toBeInTheDocument();

    // Fix the error condition, then click "Try again"
    shouldThrow = false;
    await user.click(screen.getByRole('button', { name: /try again/i }));

    expect(screen.getByText('Recovered')).toBeInTheDocument();
  });
});

describe('RootErrorFallback', () => {
  it('renders full-page recovery UI', () => {
    const reset = vi.fn();
    render(<RootErrorFallback error={new Error('root error')} reset={reset} />);

    expect(screen.getByText('Something went wrong')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /reload page/i })).toBeInTheDocument();
  });

  it('calls reset when Try again is clicked', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    render(<RootErrorFallback error={new Error('root error')} reset={reset} />);

    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(reset).toHaveBeenCalledOnce();
  });
});

describe('PageErrorFallback', () => {
  it('renders inline recovery UI', () => {
    const reset = vi.fn();
    render(<PageErrorFallback error={new Error('page error')} reset={reset} />);

    expect(screen.getByText('Page error')).toBeInTheDocument();
    expect(
      screen.getByText(/This section encountered an error/),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /try again/i })).toBeInTheDocument();
  });

  it('calls reset when Try again is clicked', async () => {
    const user = userEvent.setup();
    const reset = vi.fn();
    render(<PageErrorFallback error={new Error('page error')} reset={reset} />);

    await user.click(screen.getByRole('button', { name: /try again/i }));
    expect(reset).toHaveBeenCalledOnce();
  });
});
