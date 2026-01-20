import { describe, expect, it } from 'vitest';
import { convertTraceToTraceData } from './traceUtils';

// @spec DATASETS_SPEC
describe('traceUtils', () => {
  it('converts API trace fields and normalizes falsy optionals to undefined', () => {
    const out = convertTraceToTraceData({
      id: 't1',
      input: 'in',
      output: 'out',
      context: null,
      mlflow_trace_id: '',
      mlflow_url: undefined,
      mlflow_host: null,
      mlflow_experiment_id: 0,
    });

    expect(out).toEqual({
      id: 't1',
      input: 'in',
      output: 'out',
      context: undefined,
      mlflow_trace_id: undefined,
      mlflow_url: undefined,
      mlflow_host: undefined,
      mlflow_experiment_id: undefined,
    });
  });
});


