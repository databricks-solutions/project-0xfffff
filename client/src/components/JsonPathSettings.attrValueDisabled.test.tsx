// @spec TRACE_DISPLAY_SPEC
// @req Attribute value input is disabled until attribute key has a value
import { describe, expect, it, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { JsonPathSettings } from './JsonPathSettings';

const mockWorkshop = {
  id: 'ws-1',
  name: 'Test Workshop',
  input_jsonpath: null,
  output_jsonpath: null,
  span_attribute_filter: null,
};

const mockUseWorkshop = { data: mockWorkshop, isLoading: false };
const mockUpdateJsonPath = { mutateAsync: vi.fn(), isPending: false };
const mockPreviewJsonPath = { mutateAsync: vi.fn(), isPending: false };
const mockUpdateSpanFilter = { mutateAsync: vi.fn(), isPending: false };
const mockPreviewSpanFilter = { mutateAsync: vi.fn(), isPending: false };

vi.mock('@/context/WorkshopContext', () => ({
  useWorkshopContext: () => ({ workshopId: 'ws-1' }),
}));

vi.mock('@/hooks/useWorkshopApi', () => ({
  useWorkshop: () => mockUseWorkshop,
  useUpdateJsonPathSettings: () => mockUpdateJsonPath,
  usePreviewJsonPath: () => mockPreviewJsonPath,
  useUpdateSpanAttributeFilter: () => mockUpdateSpanFilter,
  usePreviewSpanFilter: () => mockPreviewSpanFilter,
}));

vi.mock('sonner', () => ({
  toast: { success: vi.fn(), error: vi.fn() },
}));

describe('@spec:TRACE_DISPLAY_SPEC Attribute value disabled until attribute key has value', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUseWorkshop.data = { ...mockWorkshop, span_attribute_filter: null };
  });

  it('attribute value input is disabled when attribute key is empty', () => {
    render(<JsonPathSettings />);

    const attrValueInput = screen.getByLabelText('Attribute Value');
    expect(attrValueInput).toBeDisabled();
  });

  it('attribute value input becomes enabled when attribute key has a value', () => {
    render(<JsonPathSettings />);

    const attrKeyInput = screen.getByLabelText('Attribute Key');
    const attrValueInput = screen.getByLabelText('Attribute Value');

    // Initially disabled
    expect(attrValueInput).toBeDisabled();

    // Type into attribute key
    fireEvent.change(attrKeyInput, { target: { value: 'model' } });

    // Now attribute value should be enabled
    expect(attrValueInput).toBeEnabled();
  });

  it('attribute value input becomes disabled again when attribute key is cleared', () => {
    render(<JsonPathSettings />);

    const attrKeyInput = screen.getByLabelText('Attribute Key');
    const attrValueInput = screen.getByLabelText('Attribute Value');

    // Set a key value
    fireEvent.change(attrKeyInput, { target: { value: 'model' } });
    expect(attrValueInput).toBeEnabled();

    // Clear the key
    fireEvent.change(attrKeyInput, { target: { value: '' } });
    expect(attrValueInput).toBeDisabled();
  });
});
