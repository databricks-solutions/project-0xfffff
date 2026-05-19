import { describe, expect, it } from 'vitest';
import { getBackendModelName, getFrontendModelName, getDisplayName, buildModelOptions } from './modelMapping';
import type { AvailableModel } from '@/hooks/useWorkshopApi';

// @spec JUDGE_EVALUATION_SPEC
// @req Likert judges return values 1-5
describe('modelMapping', () => {
  it('maps known frontend names to backend names and back', () => {
    expect(getBackendModelName('GPT-5.1')).toBe('databricks-gpt-5-1');
    expect(getFrontendModelName('databricks-gpt-5-1')).toBe('GPT-5.1');
  });

  it('passes through unknown names', () => {
    expect(getBackendModelName('some-model')).toBe('some-model');
    expect(getFrontendModelName('some-model')).toBe('some-model');
  });

  it('getDisplayName returns friendly name for known endpoints', () => {
    expect(getDisplayName('databricks-claude-opus-4-5')).toBe('Claude Opus 4.5');
  });

  it('getDisplayName formats unknown endpoint names', () => {
    expect(getDisplayName('databricks-some-new-model')).toBe('Some New Model');
  });

  it('buildModelOptions creates options from available models', () => {
    const models: AvailableModel[] = [
      { name: 'databricks-gpt-5-1', state: 'READY', task: 'llm/v1/chat' },
      { name: 'databricks-claude-opus-4-5', state: 'READY', task: 'llm/v1/chat' },
    ];
    const options = buildModelOptions(models);
    expect(options).toHaveLength(2);
    expect(options[0].value).toBe('databricks-gpt-5-1');
    expect(options[0].label).toBe('GPT-5.1');
    expect(options[1].value).toBe('databricks-claude-opus-4-5');
    expect(options[1].label).toBe('Claude Opus 4.5');
  });
});
