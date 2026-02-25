// @spec DISCOVERY_SPEC
// @req Results organized by priority (HIGH → MEDIUM → LOWER)
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
      { text: 'Finding A', evidence_trace_ids: ['t1'], priority: 'high' },
      { text: 'Finding B', evidence_trace_ids: ['t2'], priority: 'medium' },
      { text: 'Finding C', evidence_trace_ids: ['t3'], priority: 'low' },
    ],
    disagreements: {
      high: [{ trace_id: 't1', summary: 'HIGH disagreement', underlying_theme: 'Theme A', followup_questions: ['Q1'], facilitator_suggestions: ['S1'] }],
      medium: [{ trace_id: 't2', summary: 'MEDIUM disagreement', underlying_theme: 'Theme B', followup_questions: ['Q2'], facilitator_suggestions: ['S2'] }],
      lower: [{ trace_id: 't3', summary: 'LOWER disagreement', underlying_theme: 'Theme C', followup_questions: ['Q3'], facilitator_suggestions: ['S3'] }],
    },
    participant_count: 5, model_used: 'test-model',
    created_at: '2026-02-19T10:30:00Z', updated_at: '2026-02-19T10:30:00Z',
  };
}

describe('DiscoveryAnalysisTab - priority ordering', () => {
  beforeEach(() => { vi.clearAllMocks(); mockAnalyses.data = undefined; mockAnalyses.isLoading = false; });

  it('renders disagreement sections in order: HIGH, MEDIUM, LOWER', () => {
    mockAnalyses.data = [makeAnalysis()];
    const { container } = render(<DiscoveryAnalysisTab workshopId="ws-1" />);
    const allText = container.textContent ?? '';
    const highIdx = allText.indexOf('HIGH Priority');
    const mediumIdx = allText.indexOf('MEDIUM Priority');
    const lowerIdx = allText.indexOf('LOWER Priority');
    expect(highIdx).toBeLessThan(mediumIdx);
    expect(mediumIdx).toBeLessThan(lowerIdx);
  });

  it('renders findings with priority badges', () => {
    mockAnalyses.data = [makeAnalysis()];
    render(<DiscoveryAnalysisTab workshopId="ws-1" />);
    expect(screen.getByText('high')).toBeInTheDocument();
    expect(screen.getByText('medium')).toBeInTheDocument();
    expect(screen.getByText('low')).toBeInTheDocument();
  });
});
