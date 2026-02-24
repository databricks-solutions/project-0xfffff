// @spec DISCOVERY_SPEC
// @req Criteria show evidence (supporting trace IDs)
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock data
const MOCK_ITEMS = [
  {
    id: 'item-1',
    workshop_id: 'ws-1',
    text: 'Response cites verifiable sources',
    source_type: 'finding',
    source_analysis_id: 'analysis-1',
    source_trace_ids: ['trace-abc123', 'trace-def456'],
    group_id: null,
    group_name: null,
    promoted_by: 'facilitator-1',
    promoted_at: '2026-01-01T00:00:00Z',
  },
  {
    id: 'item-2',
    workshop_id: 'ws-1',
    text: 'Tone should be professional',
    source_type: 'disagreement',
    source_analysis_id: null,
    source_trace_ids: ['trace-ghi789'],
    group_id: null,
    group_name: null,
    promoted_by: 'facilitator-1',
    promoted_at: '2026-01-01T00:01:00Z',
  },
  {
    id: 'item-3',
    workshop_id: 'ws-1',
    text: 'Manual observation about clarity',
    source_type: 'manual',
    source_analysis_id: null,
    source_trace_ids: [],
    group_id: null,
    group_name: null,
    promoted_by: 'facilitator-1',
    promoted_at: '2026-01-01T00:02:00Z',
  },
];

const mockSuggestGroups = { mutate: vi.fn(), isPending: false };
const mockApplyGroups = { mutate: vi.fn(), isPending: false };
const mockCreateItem = { mutate: vi.fn(), isPending: false };
const mockUpdateItem = { mutate: vi.fn(), isPending: false };
const mockDeleteItem = { mutate: vi.fn(), isPending: false };

vi.mock('@/hooks/useWorkshopApi', () => ({
  useDraftRubricItems: () => ({ data: MOCK_ITEMS, isLoading: false }),
  useCreateDraftRubricItem: () => mockCreateItem,
  useUpdateDraftRubricItem: () => mockUpdateItem,
  useDeleteDraftRubricItem: () => mockDeleteItem,
  useSuggestGroups: () => mockSuggestGroups,
  useApplyGroups: () => mockApplyGroups,
}));

import { DraftRubricPanel } from './DraftRubricPanel';

function renderPanel() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false } },
  });
  return render(
    <QueryClientProvider client={queryClient}>
      <DraftRubricPanel workshopId="ws-1" userId="facilitator-1" />
    </QueryClientProvider>,
  );
}

describe('DraftRubricPanel evidence display', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('renders trace ID badges for items with source_trace_ids', async () => {
    renderPanel();

    // Item 1 has 2 trace IDs
    await waitFor(() => {
      expect(screen.getByText('trace-ab')).toBeTruthy();
    });
    expect(screen.getByText('trace-de')).toBeTruthy();

    // Item 2 has 1 trace ID
    expect(screen.getByText('trace-gh')).toBeTruthy();
  });

  it('does not render trace badges for manual items with no trace IDs', async () => {
    renderPanel();

    // Item 3 is manual with no trace IDs
    await waitFor(() => {
      expect(screen.getByText('Manual observation about clarity')).toBeTruthy();
    });

    // The item text is rendered but no trace badges for this item
    // All trace badges on the page belong to items 1 and 2
    const allTraceBadges = screen.getAllByText(/^trace-/);
    expect(allTraceBadges.length).toBe(3); // 2 from item-1 + 1 from item-2
  });

  it('renders source type badges for each item', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText('Analysis')).toBeTruthy();   // finding -> Analysis
    });
    expect(screen.getByText('Disagreement')).toBeTruthy(); // disagreement -> Disagreement
    expect(screen.getByText('Manual')).toBeTruthy();        // manual -> Manual
  });

  it('shows item count in header', async () => {
    renderPanel();

    await waitFor(() => {
      expect(screen.getByText(/Draft Rubric Items \(3\)/)).toBeTruthy();
    });
  });
});
