import { describe, expect, it } from 'vitest';
import { getBackendModelName, getFrontendModelName, getModelOptions, requiresDatabricks } from './modelMapping';

// @spec JUDGE_EVALUATION_SPEC
describe('modelMapping', () => {
  it('maps known frontend names to backend names and back', () => {
    expect(getBackendModelName('GPT-5.1')).toBe('databricks-gpt-5-1');
    expect(getFrontendModelName('databricks-gpt-5-1')).toBe('GPT-5.1');
  });

  it('passes through unknown names', () => {
    expect(getBackendModelName('some-model')).toBe('some-model');
    expect(getFrontendModelName('some-model')).toBe('some-model');
  });

  it('requiresDatabricks is true for mapped options', () => {
    expect(requiresDatabricks('GPT-5.1')).toBe(true);
  });

  it('getModelOptions disables options when config missing', () => {
    const options = getModelOptions(false);
    expect(options.length).toBeGreaterThan(0);
    expect(options.every((o) => o.disabled === true)).toBe(true);
  });
});


