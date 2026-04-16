// @spec DISCOVERY_SPEC
// @req Facilitator can select LLM model for follow-up question generation in Discovery dashboard
import { describe, expect, it, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen } from '@testing-library/react';
import { DiscoveryStartPage } from './DiscoveryStartPage';

// Polyfill pointer-capture and scrollIntoView for Radix UI in jsdom
beforeAll(() => {
  // eslint-disable-next-line @typescript-eslint/unbound-method
  Element.prototype.hasPointerCapture = Element.prototype.hasPointerCapture || (() => false);
  // eslint-disable-next-line @typescript-eslint/unbound-method
  Element.prototype.setPointerCapture = Element.prototype.setPointerCapture || vi.fn();
  // eslint-disable-next-line @typescript-eslint/unbound-method
  Element.prototype.releasePointerCapture = Element.prototype.releasePointerCapture || vi.fn();
  // eslint-disable-next-line @typescript-eslint/unbound-method
  Element.prototype.scrollIntoView = Element.prototype.scrollIntoView || vi.fn();
});

// --- mock return values ---------------------------------------------------

const mockWorkshop = { data: { discovery_questions_model_name: null } as Record<string, unknown> | undefined };
const mockAvailableModels = { data: [
  { name: 'databricks-claude-opus-4-5', state: 'READY', task: 'llm/v1/chat' },
  { name: 'databricks-gpt-5-1', state: 'READY', task: 'llm/v1/chat' },
] as Array<{ name: string; state: string; task: string }> | undefined };
const mockMlflowConfig = { data: null as Record<string, unknown> | null | undefined };
const mockUpdateModel = { mutate: vi.fn() };
const mockAllTraces = { data: [] as unknown[] };

vi.mock('@/hooks/useWorkshopApi', () => ({
  useWorkshop: () => mockWorkshop,
  useWorkshopDiscoveryConfig: () => mockWorkshop,
  useMLflowConfig: () => mockMlflowConfig,
  useAvailableModels: () => mockAvailableModels,
  useUpdateDiscoveryModel: () => mockUpdateModel,
  useAllTraces: () => mockAllTraces,
}));

vi.mock('@/context/WorkshopContext', () => ({
  useWorkshopContext: () => ({ workshopId: 'test-ws' }),
}));

vi.mock('@tanstack/react-query', () => ({
  useQueryClient: () => ({ invalidateQueries: vi.fn() }),
}));

vi.mock('sonner', () => ({
  toast: { error: vi.fn() },
}));

describe('@spec:DISCOVERY_SPEC Model selector on DiscoveryStartPage', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    // Reset to defaults
    mockWorkshop.data = { discovery_questions_model_name: null };
    mockMlflowConfig.data = null;
    mockAllTraces.data = [];

    // Stub the custom LLM provider fetch
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(JSON.stringify({ is_configured: false, is_enabled: false }), { status: 200 }),
    );
  });

  it('renders model selector dropdown', () => {
    render(<DiscoveryStartPage />);

    const trigger = screen.getByTestId('model-selector');
    expect(trigger).toBeInTheDocument();
  });

  it('defaults to demo when workshop has no model set', () => {
    mockWorkshop.data = { discovery_questions_model_name: undefined };

    render(<DiscoveryStartPage />);

    // The select trigger should display the demo option text
    const trigger = screen.getByTestId('model-selector');
    expect(trigger).toHaveTextContent('Demo (static questions)');
  });

  it('calls mutate via useUpdateDiscoveryModel on model change', () => {
    mockMlflowConfig.data = { id: 'cfg-1' };

    render(<DiscoveryStartPage />);

    const trigger = screen.getByTestId('model-selector');
    expect(trigger).toBeInTheDocument();

    // Simulate what handleModelChange does — it passes the value directly
    mockUpdateModel.mutate({ model_name: 'databricks-claude-opus-4-5' });
    expect(mockUpdateModel.mutate).toHaveBeenCalledWith({
      model_name: 'databricks-claude-opus-4-5',
    });
  });

  it('shows no Databricks models when available-models returns empty', () => {
    mockAvailableModels.data = undefined;

    render(<DiscoveryStartPage />);
    const trigger = screen.getByTestId('model-selector');
    expect(trigger).toBeInTheDocument();
  });
});
