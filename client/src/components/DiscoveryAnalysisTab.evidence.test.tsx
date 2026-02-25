// @spec DISCOVERY_SPEC
// @req Criteria show evidence (supporting trace IDs)
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

function makeAnalysis(): DiscoveryAnalysis {
  return {
    id: 'analysis-1', workshop_id: 'ws-1', template_used: 'evaluation_criteria',
    analysis_data: 'Summary.',
    findings: [
      { text: 'Include transaction IDs', evidence_trace_ids: ['trace-aaa11111', 'trace-bbb22222'], priority: 'high' },
      { text: 'Empathetic tone', evidence_trace_ids: ['trace-ccc33333'], priority: 'medium' },
    ],
    disagreements: {
      high: [{ trace_id: 'trace-aaa11111', summary: 'Disagreement', underlying_theme: 'Accuracy', followup_questions: [], facilitator_suggestions: [] }],
      medium: [], lower: [],
    },
    participant_count: 5, model_used: 'test-model',
    created_at: '2026-02-19T10:30:00Z', updated_at: '2026-02-19T10:30:00Z',
  };
}

describe('DiscoveryAnalysisTab - evidence trace IDs', () => {
  beforeEach(() => { vi.clearAllMocks(); mockAnalyses.data = undefined; mockAnalyses.isLoading = false; });

  it('renders evidence trace IDs for findings (truncated to 8 chars)', () => {
    mockAnalyses.data = [makeAnalysis()];
    render(<DiscoveryAnalysisTab workshopId="ws-1" />);
    expect(screen.getAllByText('Evidence:').length).toBeGreaterThanOrEqual(1);
    expect(screen.getByText('trace-aa')).toBeInTheDocument();
    expect(screen.getByText('trace-bb')).toBeInTheDocument();
    expect(screen.getByText('trace-cc')).toBeInTheDocument();
  });

  it('shows trace ID badge for each disagreement item', () => {
    mockAnalyses.data = [makeAnalysis()];
    render(<DiscoveryAnalysisTab workshopId="ws-1" />);
    expect(screen.getByText('Trace: trace-aa')).toBeInTheDocument();
  });
});
