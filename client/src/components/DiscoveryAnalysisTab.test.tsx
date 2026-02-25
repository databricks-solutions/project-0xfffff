// @spec DISCOVERY_SPEC
// @req Facilitator selects analysis template (Evaluation Criteria or Themes & Patterns) before running
import { describe, expect, it, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiscoveryAnalysisTab } from './DiscoveryAnalysisTab';
import type { DiscoveryAnalysis } from '@/hooks/useWorkshopApi';

// Polyfill pointer-capture and scrollIntoView for Radix UI in jsdom
beforeAll(() => {
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || vi.fn();
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || vi.fn();
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || vi.fn();
});

// --- Mock return values (mutable for per-test configuration) ---

const mockAnalyses: { data: DiscoveryAnalysis[] | undefined; isLoading: boolean } = {
  data: undefined,
  isLoading: false,
};

const mockRunAnalysis = {
  mutate: vi.fn(),
  isPending: false,
};

vi.mock('@/hooks/useWorkshopApi', () => ({
  useDiscoveryAnalyses: () => mockAnalyses,
  useRunDiscoveryAnalysis: () => mockRunAnalysis,
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: () => ({ data: { id: 'mlflow-cfg-1' } }), // mlflow config present
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

// --- Test data factories ---

function makeAnalysis(overrides: Partial<DiscoveryAnalysis> = {}): DiscoveryAnalysis {
  return {
    id: 'analysis-1',
    workshop_id: 'ws-1',
    template_used: 'evaluation_criteria',
    analysis_data: 'Overall summary of the analysis results.',
    findings: [
      {
        text: 'Responses should include specific transaction IDs',
        evidence_trace_ids: ['trace-aaa11111', 'trace-bbb22222'],
        priority: 'high',
      },
      {
        text: 'Tone should be empathetic',
        evidence_trace_ids: ['trace-ccc33333'],
        priority: 'medium',
      },
      {
        text: 'Formatting is generally clear',
        evidence_trace_ids: ['trace-ddd44444'],
        priority: 'low',
      },
    ],
    disagreements: {
      high: [
        {
          trace_id: 'trace-aaa11111',
          summary: 'One reviewer said GOOD, the other BAD',
          underlying_theme: 'Accuracy expectations differ',
          followup_questions: ['What counts as accurate?'],
          facilitator_suggestions: ['Calibrate on accuracy'],
        },
      ],
      medium: [
        {
          trace_id: 'trace-bbb22222',
          summary: 'Both BAD but for different reasons',
          underlying_theme: 'Different failure modes identified',
          followup_questions: ['Which failure is more impactful?'],
          facilitator_suggestions: ['Discuss failure priorities'],
        },
      ],
      lower: [
        {
          trace_id: 'trace-ccc33333',
          summary: 'Both GOOD but valued different aspects',
          underlying_theme: 'Tone vs. completeness',
          followup_questions: ['Which aspect matters more?'],
          facilitator_suggestions: ['Document both strengths'],
        },
      ],
    },
    participant_count: 5,
    model_used: 'databricks-claude-sonnet-4-5',
    created_at: '2026-02-19T10:30:00Z',
    updated_at: '2026-02-19T10:30:00Z',
    ...overrides,
  };
}

// --- Tests ---

describe('DiscoveryAnalysisTab', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockAnalyses.data = undefined;
    mockAnalyses.isLoading = false;
    mockRunAnalysis.isPending = false;
  });

  // Requirement: "Facilitator selects analysis template (Evaluation Criteria or Themes & Patterns) before running"
  describe('template selector', () => {
    it('renders template selector with Evaluation Criteria as the default selected value', () => {
      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      // The select trigger should display the default template
      const label = screen.getByText('Analysis Template');
      expect(label).toBeInTheDocument();

      // Default value is "evaluation_criteria" which displays as "Evaluation Criteria"
      expect(screen.getByText('Evaluation Criteria')).toBeInTheDocument();
    });

    it('renders a model selector alongside the template selector', () => {
      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      // Both selectors are labeled
      expect(screen.getByText('Model')).toBeInTheDocument();
      expect(screen.getByText('Analysis Template')).toBeInTheDocument();
    });

    it('renders the Run Analysis button', () => {
      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      const button = screen.getByRole('button', { name: /Run Analysis/i });
      expect(button).toBeInTheDocument();
      expect(button).toBeEnabled();
    });
  });

  // Requirement: "Warning if < 2 participants (not an error)"
  // Requirement: "Analysis shows warning (not error) if < 2 participants"
  describe('participant warning', () => {
    it('shows warning alert when participant_count is 1', () => {
      const analysis = makeAnalysis({ participant_count: 1 });
      mockAnalyses.data = [analysis];

      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      expect(screen.getByText('Limited Participant Data')).toBeInTheDocument();
      expect(
        screen.getByText(/based on feedback from only 1 participant\./)
      ).toBeInTheDocument();
    });

    it('shows warning alert when participant_count is 0', () => {
      const analysis = makeAnalysis({ participant_count: 0 });
      mockAnalyses.data = [analysis];

      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      expect(screen.getByText('Limited Participant Data')).toBeInTheDocument();
      expect(
        screen.getByText(/based on feedback from only 0 participants\./)
      ).toBeInTheDocument();
    });

    it('does NOT show warning when participant_count >= 2', () => {
      const analysis = makeAnalysis({ participant_count: 3 });
      mockAnalyses.data = [analysis];

      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      expect(screen.queryByText('Limited Participant Data')).not.toBeInTheDocument();
    });

    it('warning is an Alert (not destructive variant), confirming it is a warning not an error', () => {
      const analysis = makeAnalysis({ participant_count: 1 });
      mockAnalyses.data = [analysis];

      const { container } = render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      // The Alert containing the warning should NOT have variant="destructive"
      const alertEl = container.querySelector('[role="alert"]');
      expect(alertEl).toBeInTheDocument();

      // Destructive alerts would have the "destructive" class from shadcn
      // The warning alert should not be destructive
      const alertText = alertEl!.textContent;
      expect(alertText).toContain('Limited Participant Data');

      // Verify it's not using the destructive variant (which would indicate an error)
      // The component uses <Alert> (no variant prop = default), not <Alert variant="destructive">
      expect(alertEl!.className).not.toContain('destructive');
    });
  });

  // Requirement: "Data freshness banner (participant count, last run timestamp)"
  describe('data freshness banner', () => {
    it('displays participant count in the freshness banner', () => {
      const analysis = makeAnalysis({ participant_count: 5 });
      mockAnalyses.data = [analysis];

      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      expect(screen.getByText('5 participants')).toBeInTheDocument();
    });

    it('displays singular participant text when count is 1', () => {
      const analysis = makeAnalysis({ participant_count: 1 });
      mockAnalyses.data = [analysis];

      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      expect(screen.getByText('1 participant')).toBeInTheDocument();
    });

    it('displays the analysis timestamp', () => {
      const analysis = makeAnalysis({ created_at: '2026-02-19T10:30:00Z' });
      mockAnalyses.data = [analysis];

      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      // The timestamp is rendered via toLocaleString(), verify it appears
      const formattedDate = new Date('2026-02-19T10:30:00Z').toLocaleString();
      expect(screen.getByText(formattedDate)).toBeInTheDocument();
    });

    it('displays the template name in the freshness banner', () => {
      const analysis = makeAnalysis({ template_used: 'themes_patterns' });
      mockAnalyses.data = [analysis];

      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      // The banner shows the human-readable template name
      expect(screen.getByText('Themes & Patterns')).toBeInTheDocument();
    });

    it('displays the model used in the freshness banner', () => {
      const analysis = makeAnalysis({ model_used: 'databricks-claude-sonnet-4-5' });
      mockAnalyses.data = [analysis];

      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      expect(screen.getByText('databricks-claude-sonnet-4-5')).toBeInTheDocument();
    });
  });

  // Requirement: "Results organized by priority (HIGH -> MEDIUM -> LOWER)"
  describe('priority ordering', () => {
    it('renders disagreement sections in order: HIGH, MEDIUM, LOWER', () => {
      const analysis = makeAnalysis();
      mockAnalyses.data = [analysis];

      const { container } = render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      // Get all disagreement section titles in DOM order
      const highTitle = screen.getByText(/HIGH Priority/);
      const mediumTitle = screen.getByText(/MEDIUM Priority/);
      const lowerTitle = screen.getByText(/LOWER Priority/);

      // Verify they all exist
      expect(highTitle).toBeInTheDocument();
      expect(mediumTitle).toBeInTheDocument();
      expect(lowerTitle).toBeInTheDocument();

      // Verify DOM order: HIGH before MEDIUM before LOWER
      const allText = container.textContent ?? '';
      const highIdx = allText.indexOf('HIGH Priority');
      const mediumIdx = allText.indexOf('MEDIUM Priority');
      const lowerIdx = allText.indexOf('LOWER Priority');

      expect(highIdx).toBeLessThan(mediumIdx);
      expect(mediumIdx).toBeLessThan(lowerIdx);
    });

    it('renders findings with priority badges', () => {
      const analysis = makeAnalysis();
      mockAnalyses.data = [analysis];

      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      // Each finding has a priority badge
      expect(screen.getByText('high')).toBeInTheDocument();
      expect(screen.getByText('medium')).toBeInTheDocument();
      expect(screen.getByText('low')).toBeInTheDocument();
    });
  });

  // Requirement: "Disagreements color-coded by priority (red/yellow/blue)"
  describe('disagreement color-coding', () => {
    it('HIGH disagreement section uses red color classes', () => {
      const analysis = makeAnalysis();
      mockAnalyses.data = [analysis];

      const { container } = render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      // Find the HIGH priority card by its title text
      const highSection = screen.getByText(/HIGH Priority/).closest('[class*="border-red"]');
      expect(highSection).not.toBeNull();
      expect(highSection!.className).toContain('border-red-200');
    });

    it('MEDIUM disagreement section uses yellow color classes', () => {
      const analysis = makeAnalysis();
      mockAnalyses.data = [analysis];

      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      const mediumSection = screen.getByText(/MEDIUM Priority/).closest('[class*="border-yellow"]');
      expect(mediumSection).not.toBeNull();
      expect(mediumSection!.className).toContain('border-yellow-200');
    });

    it('LOWER disagreement section uses blue color classes', () => {
      const analysis = makeAnalysis();
      mockAnalyses.data = [analysis];

      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      const lowerSection = screen.getByText(/LOWER Priority/).closest('[class*="border-blue"]');
      expect(lowerSection).not.toBeNull();
      expect(lowerSection!.className).toContain('border-blue-200');
    });

    it('HIGH items use red background', () => {
      const analysis = makeAnalysis();
      mockAnalyses.data = [analysis];

      const { container } = render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      // Find the disagreement item inside the HIGH section
      const highCard = screen.getByText(/HIGH Priority/).closest('[class*="border-red"]');
      expect(highCard).not.toBeNull();
      const redBgItems = highCard!.querySelectorAll('[class*="bg-red-50"]');
      expect(redBgItems.length).toBeGreaterThanOrEqual(1);
    });

    it('MEDIUM items use yellow background', () => {
      const analysis = makeAnalysis();
      mockAnalyses.data = [analysis];

      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      const mediumCard = screen.getByText(/MEDIUM Priority/).closest('[class*="border-yellow"]');
      expect(mediumCard).not.toBeNull();
      const yellowBgItems = mediumCard!.querySelectorAll('[class*="bg-yellow-50"]');
      expect(yellowBgItems.length).toBeGreaterThanOrEqual(1);
    });

    it('LOWER items use blue background', () => {
      const analysis = makeAnalysis();
      mockAnalyses.data = [analysis];

      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      const lowerCard = screen.getByText(/LOWER Priority/).closest('[class*="border-blue"]');
      expect(lowerCard).not.toBeNull();
      const blueBgItems = lowerCard!.querySelectorAll('[class*="bg-blue-50"]');
      expect(blueBgItems.length).toBeGreaterThanOrEqual(1);
    });
  });

  // Requirement: "Criteria show evidence (supporting trace IDs)"
  describe('evidence trace IDs', () => {
    it('renders evidence trace IDs for findings', () => {
      const analysis = makeAnalysis();
      mockAnalyses.data = [analysis];

      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      // Evidence label is present
      expect(screen.getAllByText('Evidence:').length).toBeGreaterThanOrEqual(1);

      // Trace IDs are shown (truncated to first 8 chars)
      expect(screen.getByText('trace-aa')).toBeInTheDocument();
      expect(screen.getByText('trace-bb')).toBeInTheDocument();
      expect(screen.getByText('trace-cc')).toBeInTheDocument();
    });

    it('shows trace ID for each disagreement item', () => {
      const analysis = makeAnalysis();
      mockAnalyses.data = [analysis];

      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      // Disagreement items show "Trace: <id>" badges
      expect(screen.getByText('Trace: trace-aa')).toBeInTheDocument();
      expect(screen.getByText('Trace: trace-bb')).toBeInTheDocument();
      expect(screen.getByText('Trace: trace-cc')).toBeInTheDocument();
    });
  });

  // Summary card
  describe('summary card', () => {
    it('shows the findings count in the header', () => {
      const analysis = makeAnalysis();
      mockAnalyses.data = [analysis];

      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      // The findings section header includes the count
      expect(screen.getByText(/Findings \(3\)/)).toBeInTheDocument();
    });

    it('shows disagreement counts by priority level', () => {
      const analysis = makeAnalysis();
      mockAnalyses.data = [analysis];

      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      expect(screen.getByText('HIGH Disagreements')).toBeInTheDocument();
      expect(screen.getByText('MEDIUM Disagreements')).toBeInTheDocument();
      expect(screen.getByText('LOWER Disagreements')).toBeInTheDocument();
    });
  });

  // Disagreement content
  describe('disagreement content', () => {
    it('renders disagreement summary and underlying theme', () => {
      const analysis = makeAnalysis();
      mockAnalyses.data = [analysis];

      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      expect(screen.getByText('One reviewer said GOOD, the other BAD')).toBeInTheDocument();
      expect(screen.getByText(/Accuracy expectations differ/)).toBeInTheDocument();
    });

    it('renders follow-up questions for disagreements', () => {
      const analysis = makeAnalysis();
      mockAnalyses.data = [analysis];

      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      expect(screen.getByText('What counts as accurate?')).toBeInTheDocument();
      expect(screen.getByText('Which failure is more impactful?')).toBeInTheDocument();
    });

    it('renders facilitator suggestions for disagreements', () => {
      const analysis = makeAnalysis();
      mockAnalyses.data = [analysis];

      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      expect(screen.getByText('Calibrate on accuracy')).toBeInTheDocument();
      expect(screen.getByText('Discuss failure priorities')).toBeInTheDocument();
      expect(screen.getByText('Document both strengths')).toBeInTheDocument();
    });
  });

  // Empty state
  describe('empty state', () => {
    it('shows no-results message when no analyses exist', () => {
      mockAnalyses.data = undefined;
      mockAnalyses.isLoading = false;

      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      expect(screen.getByText(/No analysis runs yet/)).toBeInTheDocument();
    });
  });

  // Hides disagreement sections when empty
  describe('empty disagreement sections', () => {
    it('hides disagreement section when that priority level has no items', () => {
      const analysis = makeAnalysis({
        disagreements: {
          high: [],
          medium: [],
          lower: [],
        },
      });
      mockAnalyses.data = [analysis];

      render(<DiscoveryAnalysisTab workshopId="ws-1" />);

      expect(screen.queryByText(/HIGH Priority/)).not.toBeInTheDocument();
      expect(screen.queryByText(/MEDIUM Priority/)).not.toBeInTheDocument();
      expect(screen.queryByText(/LOWER Priority/)).not.toBeInTheDocument();
    });
  });
});
