import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { LoadingSpinner } from './LoadingSpinner';

describe('LoadingSpinner', () => {
  it('renders default message', () => {
    render(<LoadingSpinner />);
    expect(screen.getByText('Loading...')).toBeInTheDocument();
  });

  it('renders custom message + subMessage', () => {
    render(<LoadingSpinner message="Hold on" subMessage="Doing work" />);
    expect(screen.getByText('Hold on')).toBeInTheDocument();
    expect(screen.getByText('Doing work')).toBeInTheDocument();
  });

  it('calls onRetry when retry is shown and clicked', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<LoadingSpinner showRetry onRetry={onRetry} />);
    await user.click(screen.getByRole('button', { name: 'Retry' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });
});


