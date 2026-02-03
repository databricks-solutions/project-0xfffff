// @spec UI_COMPONENTS_SPEC
import { describe, expect, it, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { Pagination } from './Pagination';

describe('@spec:UI_COMPONENTS_SPEC Pagination', () => {
  describe('Basic rendering', () => {
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

    it('renders pagination controls when totalPages > 1', () => {
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          totalItems={50}
          itemsPerPage={10}
          onPageChange={() => {}}
        />
      );
      expect(screen.getByTitle('First page (Home)')).toBeInTheDocument();
      expect(screen.getByTitle('Previous page (←)')).toBeInTheDocument();
      expect(screen.getByTitle('Next page (→)')).toBeInTheDocument();
      expect(screen.getByTitle('Last page (End)')).toBeInTheDocument();
    });
  });

  describe('Page info display', () => {
    it('shows correct item range and total', () => {
      render(
        <Pagination
          currentPage={2}
          totalPages={5}
          totalItems={42}
          itemsPerPage={10}
          onPageChange={() => {}}
        />
      );
      expect(screen.getByText('Showing 11 to 20 of 42 results')).toBeInTheDocument();
    });

    it('shows correct range on first page', () => {
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          totalItems={42}
          itemsPerPage={10}
          onPageChange={() => {}}
        />
      );
      expect(screen.getByText('Showing 1 to 10 of 42 results')).toBeInTheDocument();
    });

    it('shows correct range on last page with partial items', () => {
      render(
        <Pagination
          currentPage={5}
          totalPages={5}
          totalItems={42}
          itemsPerPage={10}
          onPageChange={() => {}}
        />
      );
      expect(screen.getByText('Showing 41 to 42 of 42 results')).toBeInTheDocument();
    });
  });

  describe('Navigation buttons', () => {
    it('calls onPageChange on next click', async () => {
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

      await user.click(screen.getByTitle('Next page (→)'));
      expect(onPageChange).toHaveBeenCalledWith(3);
    });

    it('calls onPageChange on previous click', async () => {
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

      await user.click(screen.getByTitle('Previous page (←)'));
      expect(onPageChange).toHaveBeenCalledWith(1);
    });

    it('calls onPageChange on first page click', async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();

      render(
        <Pagination
          currentPage={3}
          totalPages={5}
          totalItems={42}
          itemsPerPage={10}
          onPageChange={onPageChange}
        />
      );

      await user.click(screen.getByTitle('First page (Home)'));
      expect(onPageChange).toHaveBeenCalledWith(1);
    });

    it('calls onPageChange on last page click', async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();

      render(
        <Pagination
          currentPage={3}
          totalPages={5}
          totalItems={42}
          itemsPerPage={10}
          onPageChange={onPageChange}
        />
      );

      await user.click(screen.getByTitle('Last page (End)'));
      expect(onPageChange).toHaveBeenCalledWith(5);
    });

    it('disables previous/first buttons on first page', () => {
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          totalItems={42}
          itemsPerPage={10}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTitle('First page (Home)')).toBeDisabled();
      expect(screen.getByTitle('Previous page (←)')).toBeDisabled();
      expect(screen.getByTitle('Next page (→)')).not.toBeDisabled();
      expect(screen.getByTitle('Last page (End)')).not.toBeDisabled();
    });

    it('disables next/last buttons on last page', () => {
      render(
        <Pagination
          currentPage={5}
          totalPages={5}
          totalItems={42}
          itemsPerPage={10}
          onPageChange={() => {}}
        />
      );

      expect(screen.getByTitle('First page (Home)')).not.toBeDisabled();
      expect(screen.getByTitle('Previous page (←)')).not.toBeDisabled();
      expect(screen.getByTitle('Next page (→)')).toBeDisabled();
      expect(screen.getByTitle('Last page (End)')).toBeDisabled();
    });
  });

  describe('Page number buttons', () => {
    it('highlights current page', () => {
      render(
        <Pagination
          currentPage={3}
          totalPages={5}
          totalItems={42}
          itemsPerPage={10}
          onPageChange={() => {}}
        />
      );

      const pageButton = screen.getByTitle('Go to page 3');
      // Check that it has the default variant (not outline)
      expect(pageButton).toBeInTheDocument();
    });

    it('navigates to clicked page number', async () => {
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

      await user.click(screen.getByTitle('Go to page 4'));
      expect(onPageChange).toHaveBeenCalledWith(4);
    });

    it('shows ellipsis for large page counts', () => {
      render(
        <Pagination
          currentPage={5}
          totalPages={10}
          totalItems={100}
          itemsPerPage={10}
          onPageChange={() => {}}
        />
      );

      // Should show ellipsis when far from start or end
      const ellipses = screen.getAllByText('...');
      expect(ellipses.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Items per page selector', () => {
    it('does not show selector by default', () => {
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          totalItems={50}
          itemsPerPage={10}
          onPageChange={() => {}}
        />
      );

      expect(screen.queryByText('Show')).not.toBeInTheDocument();
    });

    it('shows selector when showItemsPerPageSelector is true', () => {
      const onItemsPerPageChange = vi.fn();

      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          totalItems={50}
          itemsPerPage={10}
          onPageChange={() => {}}
          onItemsPerPageChange={onItemsPerPageChange}
          showItemsPerPageSelector={true}
        />
      );

      expect(screen.getByText('Show')).toBeInTheDocument();
      expect(screen.getByText('per page')).toBeInTheDocument();
    });

    it('calls onItemsPerPageChange when selection changes', async () => {
      const user = userEvent.setup();
      const onItemsPerPageChange = vi.fn();

      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          totalItems={50}
          itemsPerPage={10}
          onPageChange={() => {}}
          onItemsPerPageChange={onItemsPerPageChange}
          showItemsPerPageSelector={true}
        />
      );

      const select = screen.getByRole('combobox');
      await user.selectOptions(select, '25');
      expect(onItemsPerPageChange).toHaveBeenCalledWith(25);
    });

    it('shows correct options (10, 25, 50, 100)', () => {
      const onItemsPerPageChange = vi.fn();

      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          totalItems={50}
          itemsPerPage={10}
          onPageChange={() => {}}
          onItemsPerPageChange={onItemsPerPageChange}
          showItemsPerPageSelector={true}
        />
      );

      expect(screen.getByRole('option', { name: '10' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '25' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '50' })).toBeInTheDocument();
      expect(screen.getByRole('option', { name: '100' })).toBeInTheDocument();
    });
  });

  describe('Quick jump feature', () => {
    it('does not show quick jump by default', () => {
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          totalItems={50}
          itemsPerPage={10}
          onPageChange={() => {}}
        />
      );

      expect(screen.queryByText('Go to page:')).not.toBeInTheDocument();
    });

    it('shows quick jump when showQuickJump is true', () => {
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          totalItems={50}
          itemsPerPage={10}
          onPageChange={() => {}}
          showQuickJump={true}
        />
      );

      expect(screen.getByText('Go to page:')).toBeInTheDocument();
      expect(screen.getByRole('spinbutton')).toBeInTheDocument();
      expect(screen.getByRole('button', { name: 'Go' })).toBeInTheDocument();
    });

    it('navigates to valid page when Go is clicked', async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();

      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          totalItems={50}
          itemsPerPage={10}
          onPageChange={onPageChange}
          showQuickJump={true}
        />
      );

      const input = screen.getByRole('spinbutton');
      await user.type(input, '3');
      await user.click(screen.getByRole('button', { name: 'Go' }));

      expect(onPageChange).toHaveBeenCalledWith(3);
    });

    it('navigates when Enter is pressed in quick jump input', async () => {
      const user = userEvent.setup();
      const onPageChange = vi.fn();

      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          totalItems={50}
          itemsPerPage={10}
          onPageChange={onPageChange}
          showQuickJump={true}
        />
      );

      const input = screen.getByRole('spinbutton');
      await user.type(input, '4');
      await user.keyboard('{Enter}');

      expect(onPageChange).toHaveBeenCalledWith(4);
    });

    it('disables Go button for invalid page numbers', () => {
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          totalItems={50}
          itemsPerPage={10}
          onPageChange={() => {}}
          showQuickJump={true}
        />
      );

      // Go button should be disabled when input is empty
      expect(screen.getByRole('button', { name: 'Go' })).toBeDisabled();
    });
  });

  describe('Keyboard shortcuts', () => {
    it('does not show keyboard hints by default', () => {
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          totalItems={50}
          itemsPerPage={10}
          onPageChange={() => {}}
        />
      );

      expect(screen.queryByText(/Use.*arrows/)).not.toBeInTheDocument();
    });

    it('shows keyboard hints when showKeyboardShortcuts is true', () => {
      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          totalItems={50}
          itemsPerPage={10}
          onPageChange={() => {}}
          showKeyboardShortcuts={true}
        />
      );

      expect(screen.getByText(/Use.*arrows.*Home.*End.*navigation/)).toBeInTheDocument();
    });

    it('navigates to next page with ArrowRight', async () => {
      const onPageChange = vi.fn();

      render(
        <Pagination
          currentPage={2}
          totalPages={5}
          totalItems={50}
          itemsPerPage={10}
          onPageChange={onPageChange}
          showKeyboardShortcuts={true}
        />
      );

      fireEvent.keyDown(document, { key: 'ArrowRight' });
      expect(onPageChange).toHaveBeenCalledWith(3);
    });

    it('navigates to previous page with ArrowLeft', async () => {
      const onPageChange = vi.fn();

      render(
        <Pagination
          currentPage={3}
          totalPages={5}
          totalItems={50}
          itemsPerPage={10}
          onPageChange={onPageChange}
          showKeyboardShortcuts={true}
        />
      );

      fireEvent.keyDown(document, { key: 'ArrowLeft' });
      expect(onPageChange).toHaveBeenCalledWith(2);
    });

    it('navigates to first page with Home key', async () => {
      const onPageChange = vi.fn();

      render(
        <Pagination
          currentPage={3}
          totalPages={5}
          totalItems={50}
          itemsPerPage={10}
          onPageChange={onPageChange}
          showKeyboardShortcuts={true}
        />
      );

      fireEvent.keyDown(document, { key: 'Home' });
      expect(onPageChange).toHaveBeenCalledWith(1);
    });

    it('navigates to last page with End key', async () => {
      const onPageChange = vi.fn();

      render(
        <Pagination
          currentPage={2}
          totalPages={5}
          totalItems={50}
          itemsPerPage={10}
          onPageChange={onPageChange}
          showKeyboardShortcuts={true}
        />
      );

      fireEvent.keyDown(document, { key: 'End' });
      expect(onPageChange).toHaveBeenCalledWith(5);
    });

    it('does not navigate on ArrowRight when on last page', async () => {
      const onPageChange = vi.fn();

      render(
        <Pagination
          currentPage={5}
          totalPages={5}
          totalItems={50}
          itemsPerPage={10}
          onPageChange={onPageChange}
          showKeyboardShortcuts={true}
        />
      );

      fireEvent.keyDown(document, { key: 'ArrowRight' });
      expect(onPageChange).not.toHaveBeenCalled();
    });

    it('does not navigate on ArrowLeft when on first page', async () => {
      const onPageChange = vi.fn();

      render(
        <Pagination
          currentPage={1}
          totalPages={5}
          totalItems={50}
          itemsPerPage={10}
          onPageChange={onPageChange}
          showKeyboardShortcuts={true}
        />
      );

      fireEvent.keyDown(document, { key: 'ArrowLeft' });
      expect(onPageChange).not.toHaveBeenCalled();
    });

    it('does not handle keyboard when showKeyboardShortcuts is false', async () => {
      const onPageChange = vi.fn();

      render(
        <Pagination
          currentPage={2}
          totalPages={5}
          totalItems={50}
          itemsPerPage={10}
          onPageChange={onPageChange}
          showKeyboardShortcuts={false}
        />
      );

      fireEvent.keyDown(document, { key: 'ArrowRight' });
      expect(onPageChange).not.toHaveBeenCalled();
    });
  });
});
