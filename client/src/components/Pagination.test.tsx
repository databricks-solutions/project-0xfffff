import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from './Pagination';

describe('Pagination', () => {
  it('renders null when totalPages <= 1', () => {
    const { container } = render(
      <Pagination
        currentPage={1}
        totalPages={1}
        totalItems={0}
        itemsPerPage={10}
        onPageChange={() => {}}
      />
    );
    expect(container.firstChild).toBeNull();
  });

  it('shows item range and calls onPageChange on next click', async () => {
    const user = userEvent.setup();
    const onPageChange = vi.fn();

    render(
      <Pagination
        currentPage={2}
        totalPages={5}
        totalItems={42}
        itemsPerPage={10}
        onPageChange={onPageChange}
      />
    );

    expect(screen.getByText('Showing 11 to 20 of 42 results')).toBeInTheDocument();

    await user.click(screen.getByTitle('Next page (→)'));
    expect(onPageChange).toHaveBeenCalledWith(3);
  });
});


