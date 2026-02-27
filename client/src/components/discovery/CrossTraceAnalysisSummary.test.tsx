import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, it, expect, vi } from 'vitest';
import { CrossTraceAnalysisSummary } from './CrossTraceAnalysisSummary';

const mockAnalysis = {
  id: 'analysis-1',
  workshop_id: 'ws-1',
  template_used: 'evaluation_criteria',
  analysis_data: 'Reviewers consistently disagree about brevity vs completeness.',
  findings: [
    { text: 'Brevity tolerance varies', evidence_trace_ids: ['t1', 't2', 't3', 't4'], priority: 'high' },
    { text: 'Factual accuracy universally valued', evidence_trace_ids: ['t1', 't2', 't3', 't5', 't6', 't7', 't8'], priority: 'high' },
    { text: 'Trace-specific finding', evidence_trace_ids: ['t1'], priority: 'medium' },
  ],
  disagreements: { high: [], medium: [], lower: [] },
  participant_count: 4,
  model_used: 'claude-sonnet-4.5',
  created_at: '2026-02-27T00:00:00Z',
  updated_at: '2026-02-27T00:00:00Z',
};

// @req DISCOVERY_SPEC.facilitator-workspace.cross-trace-summary
describe('CrossTraceAnalysisSummary', () => {
  it('renders summary text', () => {
    render(
      <CrossTraceAnalysisSummary analysis={mockAnalysis} onPromote={vi.fn()} />
    );
    expect(screen.getByText(/consistently disagree/)).toBeInTheDocument();
  });

  it('shows only cross-trace findings (multi-trace references)', () => {
    render(
      <CrossTraceAnalysisSummary analysis={mockAnalysis} onPromote={vi.fn()} />
    );
    // Cross-trace findings (2+ trace references) should appear
    expect(screen.getByText(/Brevity tolerance varies/)).toBeInTheDocument();
    expect(screen.getByText(/Factual accuracy/)).toBeInTheDocument();
    // Single-trace finding should NOT appear here
    expect(screen.queryByText('Trace-specific finding')).not.toBeInTheDocument();
  });

  it('shows "Linked to N traces" for cross-trace findings', () => {
    render(
      <CrossTraceAnalysisSummary analysis={mockAnalysis} onPromote={vi.fn()} />
    );
    expect(screen.getByText(/Linked to 4 traces/)).toBeInTheDocument();
    expect(screen.getByText(/Linked to 7 traces/)).toBeInTheDocument();
  });

  it('is collapsible', async () => {
    render(
      <CrossTraceAnalysisSummary analysis={mockAnalysis} onPromote={vi.fn()} />
    );
    const collapseButton = screen.getByRole('button', { name: /collapse/i });
    await userEvent.click(collapseButton);
    expect(screen.queryByText(/consistently disagree/)).not.toBeInTheDocument();
  });
});
