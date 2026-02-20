// @spec DISCOVERY_SPEC
// @req Warning if < 2 participants (not an error)
import { describe, expect, it, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiscoveryAnalysisTab } from './DiscoveryAnalysisTab';
import type { DiscoveryAnalysis } from '@/hooks/useWorkshopApi';

beforeAll(() => {
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || vi.fn();
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || vi.fn();
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || vi.fn();
});

const mockAnalyses: { data: DiscoveryAnalysis[] | undefined; isLoading: boolean } = {
  data: undefined,
  isLoading: false,
};

vi.mock('@/hooks/useWorkshopApi', () => ({
  useDiscoveryAnalyses: () => mockAnalyses,
  useRunDiscoveryAnalysis: () => ({ mutate: vi.fn(), isPending: false }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { id: 'mlflow-cfg-1' } }),
}));

vi.mock('sonner', () => ({ toast: { success: vi.fn(), error: vi.fn() } }));

function makeAnalysis(overrides: Partial<DiscoveryAnalysis> = {}): DiscoveryAnalysis {
  return {
    id: 'analysis-1', workshop_id: 'ws-1', template_used: 'evaluation_criteria',
    analysis_data: 'Summary.', findings: [], disagreements: { high: [], medium: [], lower: [] },
    participant_count: 5, model_used: 'test-model',
    created_at: '2026-02-19T10:30:00Z', updated_at: '2026-02-19T10:30:00Z',
    ...overrides,
  };
}

describe('DiscoveryAnalysisTab - participant warning', () => {
  beforeEach(() => { vi.clearAllMocks(); mockAnalyses.data = undefined; mockAnalyses.isLoading = false; });

  it('shows warning alert when participant_count is 1', () => {
    mockAnalyses.data = [makeAnalysis({ participant_count: 1 })];
    render(<DiscoveryAnalysisTab workshopId="ws-1" />);
    expect(screen.getByText('Limited Participant Data')).toBeInTheDocument();
    expect(screen.getByText(/based on feedback from only 1 participant\./)).toBeInTheDocument();
  });

  it('shows warning alert when participant_count is 0', () => {
    mockAnalyses.data = [makeAnalysis({ participant_count: 0 })];
    render(<DiscoveryAnalysisTab workshopId="ws-1" />);
    expect(screen.getByText('Limited Participant Data')).toBeInTheDocument();
  });

  it('does NOT show warning when participant_count >= 2', () => {
    mockAnalyses.data = [makeAnalysis({ participant_count: 3 })];
    render(<DiscoveryAnalysisTab workshopId="ws-1" />);
    expect(screen.queryByText('Limited Participant Data')).not.toBeInTheDocument();
  });

  it('warning uses default Alert variant (not destructive/error)', () => {
    mockAnalyses.data = [makeAnalysis({ participant_count: 1 })];
    const { container } = render(<DiscoveryAnalysisTab workshopId="ws-1" />);
    const alertEl = container.querySelector('[role="alert"]');
    expect(alertEl).toBeInTheDocument();
    expect(alertEl!.className).not.toContain('destructive');
  });
});
