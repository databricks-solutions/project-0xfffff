// @spec DISCOVERY_SPEC
// @req Data freshness banner (participant count, last run timestamp)
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
    participant_count: 5, model_used: 'databricks-claude-sonnet-4-5',
    created_at: '2026-02-19T10:30:00Z', updated_at: '2026-02-19T10:30:00Z',
    ...overrides,
  };
}

describe('DiscoveryAnalysisTab - data freshness banner', () => {
  beforeEach(() => { vi.clearAllMocks(); mockAnalyses.data = undefined; mockAnalyses.isLoading = false; });

  it('displays participant count', () => {
    mockAnalyses.data = [makeAnalysis({ participant_count: 5 })];
    render(<DiscoveryAnalysisTab workshopId="ws-1" />);
    expect(screen.getByText('5 participants')).toBeInTheDocument();
  });

  it('displays singular participant text when count is 1', () => {
    mockAnalyses.data = [makeAnalysis({ participant_count: 1 })];
    render(<DiscoveryAnalysisTab workshopId="ws-1" />);
    expect(screen.getByText('1 participant')).toBeInTheDocument();
  });

  it('displays the analysis timestamp', () => {
    mockAnalyses.data = [makeAnalysis({ created_at: '2026-02-19T10:30:00Z' })];
    render(<DiscoveryAnalysisTab workshopId="ws-1" />);
    const formattedDate = new Date('2026-02-19T10:30:00Z').toLocaleString();
    expect(screen.getByText(formattedDate)).toBeInTheDocument();
  });

  it('displays the template name', () => {
    mockAnalyses.data = [makeAnalysis({ template_used: 'themes_patterns' })];
    render(<DiscoveryAnalysisTab workshopId="ws-1" />);
    expect(screen.getByText('Themes & Patterns')).toBeInTheDocument();
  });

  it('displays the model used', () => {
    mockAnalyses.data = [makeAnalysis({ model_used: 'databricks-claude-sonnet-4-5' })];
    render(<DiscoveryAnalysisTab workshopId="ws-1" />);
    expect(screen.getByText('databricks-claude-sonnet-4-5')).toBeInTheDocument();
  });
});
