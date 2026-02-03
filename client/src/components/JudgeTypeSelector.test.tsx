// @spec JUDGE_EVALUATION_SPEC
import { describe, expect, it, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { JudgeTypeSelector, defaultPromptTemplates, binaryLabelPresets } from './JudgeTypeSelector';

describe('@spec:JUDGE_EVALUATION_SPEC JudgeTypeSelector', () => {
  describe('Rendering', () => {
    it('renders all three judge type cards', () => {
      render(
        <JudgeTypeSelector
          selectedType="likert"
          onTypeChange={() => {}}
        />
      );

      expect(screen.getByText('Likert Scale Judge')).toBeInTheDocument();
      expect(screen.getByText('Binary Judge')).toBeInTheDocument();
      expect(screen.getByText('Free-form Feedback')).toBeInTheDocument();
    });

    it('displays descriptions for each judge type', () => {
      render(
        <JudgeTypeSelector
          selectedType="likert"
          onTypeChange={() => {}}
        />
      );

      expect(screen.getByText('Rubric-based scoring with 1-5 scale ratings')).toBeInTheDocument();
      expect(screen.getByText('Simple pass/fail or yes/no evaluation')).toBeInTheDocument();
      expect(screen.getByText('Open-ended qualitative analysis')).toBeInTheDocument();
    });

    it('shows features for Likert judge', () => {
      render(
        <JudgeTypeSelector
          selectedType="likert"
          onTypeChange={() => {}}
        />
      );

      expect(screen.getByText('1-5 Likert scale ratings')).toBeInTheDocument();
      expect(screen.getByText('Multiple evaluation criteria')).toBeInTheDocument();
      expect(screen.getByText('Detailed rubric alignment')).toBeInTheDocument();
    });

    it('shows features for Binary judge', () => {
      render(
        <JudgeTypeSelector
          selectedType="binary"
          onTypeChange={() => {}}
        />
      );

      expect(screen.getByText('Pass/Fail decisions')).toBeInTheDocument();
      expect(screen.getByText('Custom label support')).toBeInTheDocument();
      expect(screen.getByText('High-speed evaluation')).toBeInTheDocument();
    });

    it('shows features for Free-form judge', () => {
      render(
        <JudgeTypeSelector
          selectedType="freeform"
          onTypeChange={() => {}}
        />
      );

      expect(screen.getByText('Detailed text feedback')).toBeInTheDocument();
      expect(screen.getByText('Qualitative insights')).toBeInTheDocument();
      expect(screen.getByText('Flexible format')).toBeInTheDocument();
    });

    it('shows use cases for each judge type', () => {
      render(
        <JudgeTypeSelector
          selectedType="likert"
          onTypeChange={() => {}}
        />
      );

      // Likert use cases
      expect(screen.getByText('Quality evaluation')).toBeInTheDocument();

      // Binary use cases
      expect(screen.getByText('Safety checks')).toBeInTheDocument();

      // Freeform use cases
      expect(screen.getByText('Improvement suggestions')).toBeInTheDocument();
    });
  });

  describe('Selection behavior', () => {
    it('calls onTypeChange when clicking Likert card', () => {
      const onTypeChange = vi.fn();
      render(
        <JudgeTypeSelector
          selectedType="binary"
          onTypeChange={onTypeChange}
        />
      );

      fireEvent.click(screen.getByText('Likert Scale Judge'));
      expect(onTypeChange).toHaveBeenCalledWith('likert');
    });

    it('calls onTypeChange when clicking Binary card', () => {
      const onTypeChange = vi.fn();
      render(
        <JudgeTypeSelector
          selectedType="likert"
          onTypeChange={onTypeChange}
        />
      );

      fireEvent.click(screen.getByText('Binary Judge'));
      expect(onTypeChange).toHaveBeenCalledWith('binary');
    });

    it('calls onTypeChange when clicking Free-form card', () => {
      const onTypeChange = vi.fn();
      render(
        <JudgeTypeSelector
          selectedType="likert"
          onTypeChange={onTypeChange}
        />
      );

      fireEvent.click(screen.getByText('Free-form Feedback'));
      expect(onTypeChange).toHaveBeenCalledWith('freeform');
    });

    it('highlights selected type with checkmark', () => {
      const { container } = render(
        <JudgeTypeSelector
          selectedType="binary"
          onTypeChange={() => {}}
        />
      );

      // The selected card should have ring-2 ring-primary class
      const binaryCard = screen.getByText('Binary Judge').closest('div[class*="cursor-pointer"]');
      expect(binaryCard).toHaveClass('ring-2');
    });
  });

  describe('Disabled state', () => {
    it('does not call onTypeChange when disabled', () => {
      const onTypeChange = vi.fn();
      render(
        <JudgeTypeSelector
          selectedType="likert"
          onTypeChange={onTypeChange}
          disabled={true}
        />
      );

      fireEvent.click(screen.getByText('Binary Judge'));
      expect(onTypeChange).not.toHaveBeenCalled();
    });

    it('applies opacity styling when disabled', () => {
      const { container } = render(
        <JudgeTypeSelector
          selectedType="likert"
          onTypeChange={() => {}}
          disabled={true}
        />
      );

      const cards = container.querySelectorAll('[class*="cursor-not-allowed"]');
      expect(cards.length).toBe(3);
    });
  });
});

describe('@spec:JUDGE_EVALUATION_SPEC defaultPromptTemplates', () => {
  describe('Likert template', () => {
    it('includes 1-5 scale rating instructions', () => {
      expect(defaultPromptTemplates.likert).toContain('1-5');
      expect(defaultPromptTemplates.likert).toContain('1 = Poor');
      expect(defaultPromptTemplates.likert).toContain('5 = Excellent');
    });

    it('includes rubric placeholder', () => {
      expect(defaultPromptTemplates.likert).toContain('{rubric}');
    });

    it('includes input and output placeholders', () => {
      expect(defaultPromptTemplates.likert).toContain('{input}');
      expect(defaultPromptTemplates.likert).toContain('{output}');
    });
  });

  describe('Binary template', () => {
    it('includes 0/1 rating instructions', () => {
      expect(defaultPromptTemplates.binary).toContain('0:');
      expect(defaultPromptTemplates.binary).toContain('1:');
      expect(defaultPromptTemplates.binary).toContain('PASS');
      expect(defaultPromptTemplates.binary).toContain('FAIL');
    });

    it('includes criteria placeholder', () => {
      expect(defaultPromptTemplates.binary).toContain('{criteria}');
    });

    it('includes example format', () => {
      expect(defaultPromptTemplates.binary).toContain('Example format');
    });
  });

  describe('Freeform template', () => {
    it('includes qualitative feedback instructions', () => {
      expect(defaultPromptTemplates.freeform).toContain('Strengths');
      expect(defaultPromptTemplates.freeform).toContain('Areas for improvement');
      expect(defaultPromptTemplates.freeform).toContain('suggestions');
    });

    it('includes focus placeholder', () => {
      expect(defaultPromptTemplates.freeform).toContain('{focus}');
    });
  });
});

describe('@spec:JUDGE_EVALUATION_SPEC binaryLabelPresets', () => {
  it('has pass_fail preset', () => {
    expect(binaryLabelPresets.pass_fail).toEqual({ pass: 'Pass', fail: 'Fail' });
  });

  it('has yes_no preset', () => {
    expect(binaryLabelPresets.yes_no).toEqual({ pass: 'Yes', fail: 'No' });
  });

  it('has accept_reject preset', () => {
    expect(binaryLabelPresets.accept_reject).toEqual({ pass: 'Accept', fail: 'Reject' });
  });

  it('has safe_unsafe preset', () => {
    expect(binaryLabelPresets.safe_unsafe).toEqual({ pass: 'Safe', fail: 'Unsafe' });
  });

  it('has compliant_violation preset', () => {
    expect(binaryLabelPresets.compliant_violation).toEqual({ pass: 'Compliant', fail: 'Violation' });
  });

  it('all presets have pass and fail keys', () => {
    Object.values(binaryLabelPresets).forEach(preset => {
      expect(preset).toHaveProperty('pass');
      expect(preset).toHaveProperty('fail');
      expect(typeof preset.pass).toBe('string');
      expect(typeof preset.fail).toBe('string');
    });
  });
});
