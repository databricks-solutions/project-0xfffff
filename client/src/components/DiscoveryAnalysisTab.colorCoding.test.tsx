// @spec DISCOVERY_SPEC
// @req Disagreements color-coded by priority (red/yellow/blue)
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
    analysis_data: 'Summary.', findings: [],
    disagreements: {
      high: [{ trace_id: 't1', summary: 'HIGH', underlying_theme: 'A', followup_questions: [], facilitator_suggestions: [] }],
      medium: [{ trace_id: 't2', summary: 'MEDIUM', underlying_theme: 'B', followup_questions: [], facilitator_suggestions: [] }],
      lower: [{ trace_id: 't3', summary: 'LOWER', underlying_theme: 'C', followup_questions: [], facilitator_suggestions: [] }],
    },
    participant_count: 5, model_used: 'test-model',
    created_at: '2026-02-19T10:30:00Z', updated_at: '2026-02-19T10:30:00Z',
  };
}

describe('DiscoveryAnalysisTab - disagreement color-coding', () => {
  beforeEach(() => { vi.clearAllMocks(); mockAnalyses.data = undefined; mockAnalyses.isLoading = false; });

  it('HIGH disagreement section uses red border', () => {
    mockAnalyses.data = [makeAnalysis()];
    render(<DiscoveryAnalysisTab workshopId="ws-1" />);
    const section = screen.getByText(/HIGH Priority/).closest('[class*="border-red"]');
    expect(section).not.toBeNull();
    expect(section!.className).toContain('border-red-200');
  });

  it('MEDIUM disagreement section uses yellow border', () => {
    mockAnalyses.data = [makeAnalysis()];
    render(<DiscoveryAnalysisTab workshopId="ws-1" />);
    const section = screen.getByText(/MEDIUM Priority/).closest('[class*="border-yellow"]');
    expect(section).not.toBeNull();
    expect(section!.className).toContain('border-yellow-200');
  });

  it('LOWER disagreement section uses blue border', () => {
    mockAnalyses.data = [makeAnalysis()];
    render(<DiscoveryAnalysisTab workshopId="ws-1" />);
    const section = screen.getByText(/LOWER Priority/).closest('[class*="border-blue"]');
    expect(section).not.toBeNull();
    expect(section!.className).toContain('border-blue-200');
  });

  it('HIGH items use red background', () => {
    mockAnalyses.data = [makeAnalysis()];
    render(<DiscoveryAnalysisTab workshopId="ws-1" />);
    const card = screen.getByText(/HIGH Priority/).closest('[class*="border-red"]');
    expect(card!.querySelectorAll('[class*="bg-red-50"]').length).toBeGreaterThanOrEqual(1);
  });

  it('MEDIUM items use yellow background', () => {
    mockAnalyses.data = [makeAnalysis()];
    render(<DiscoveryAnalysisTab workshopId="ws-1" />);
    const card = screen.getByText(/MEDIUM Priority/).closest('[class*="border-yellow"]');
    expect(card!.querySelectorAll('[class*="bg-yellow-50"]').length).toBeGreaterThanOrEqual(1);
  });

  it('LOWER items use blue background', () => {
    mockAnalyses.data = [makeAnalysis()];
    render(<DiscoveryAnalysisTab workshopId="ws-1" />);
    const card = screen.getByText(/LOWER Priority/).closest('[class*="border-blue"]');
    expect(card!.querySelectorAll('[class*="bg-blue-50"]').length).toBeGreaterThanOrEqual(1);
  });
});
