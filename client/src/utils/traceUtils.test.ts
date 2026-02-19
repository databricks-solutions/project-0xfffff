// @spec DATASETS_SPEC
import { describe, expect, it } from 'vitest';
import { convertTraceToTraceData } from './traceUtils';

describe('@spec:DATASETS_SPEC traceUtils', () => {
  describe('convertTraceToTraceData', () => {
    it('converts basic API trace fields', () => {
      const out = convertTraceToTraceData({
        id: 't1',
        workshop_id: 'w1',
        input: '{"query": "test"}',
        output: '{"response": "result"}',
      });

      expect(out).toEqual({
        id: 't1',
        input: '{"query": "test"}',
        output: '{"response": "result"}',
        context: undefined,
        mlflow_trace_id: undefined,
        mlflow_url: undefined,
        mlflow_host: undefined,
        mlflow_experiment_id: undefined,
      });
    });

    it('normalizes null optional fields to undefined', () => {
      const out = convertTraceToTraceData({
        id: 't1',
        workshop_id: 'w1',
        input: 'in',
        output: 'out',
        context: null,
        mlflow_trace_id: null,
        mlflow_url: null,
        mlflow_host: null,
        mlflow_experiment_id: null,
      });

      expect(out.context).toBeUndefined();
      expect(out.mlflow_trace_id).toBeUndefined();
      expect(out.mlflow_url).toBeUndefined();
      expect(out.mlflow_host).toBeUndefined();
      expect(out.mlflow_experiment_id).toBeUndefined();
    });

    it('normalizes empty string optional fields to undefined', () => {
      const out = convertTraceToTraceData({
        id: 't1',
        workshop_id: 'w1',
        input: 'in',
        output: 'out',
        mlflow_trace_id: '',
        mlflow_url: '',
        mlflow_host: '',
        mlflow_experiment_id: '',
      });

      expect(out.mlflow_trace_id).toBeUndefined();
      expect(out.mlflow_url).toBeUndefined();
      expect(out.mlflow_host).toBeUndefined();
      expect(out.mlflow_experiment_id).toBeUndefined();
    });

    it('normalizes zero/falsy optional fields to undefined', () => {
      const out = convertTraceToTraceData({
        id: 't1',
        workshop_id: 'w1',
        input: 'in',
        output: 'out',
        context: undefined,
        mlflow_trace_id: '',
        mlflow_url: undefined,
        mlflow_host: null,
        mlflow_experiment_id: 0 as unknown as string,
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

    it('preserves valid MLflow metadata', () => {
      const out = convertTraceToTraceData({
        id: 'trace-123',
        workshop_id: 'w1',
        input: '{"messages": []}',
        output: '{"choices": []}',
        context: { source: 'test' },
        mlflow_trace_id: 'mlflow-abc-123',
        mlflow_url: 'https://mlflow.example.com/trace/abc-123',
        mlflow_host: 'mlflow.example.com',
        mlflow_experiment_id: 'exp-456',
      });

      expect(out.id).toBe('trace-123');
      expect(out.context).toEqual({ source: 'test' });
      expect(out.mlflow_trace_id).toBe('mlflow-abc-123');
      expect(out.mlflow_url).toBe('https://mlflow.example.com/trace/abc-123');
      expect(out.mlflow_host).toBe('mlflow.example.com');
      expect(out.mlflow_experiment_id).toBe('exp-456');
    });

    it('preserves complex JSON input/output', () => {
      const complexInput = JSON.stringify({
        messages: [
          { role: 'user', content: 'Hello' },
          { role: 'assistant', content: 'Hi there' },
        ],
        metadata: { session_id: '123' },
      });

      const complexOutput = JSON.stringify({
        choices: [{ message: { content: 'Response text' } }],
        usage: { total_tokens: 100 },
      });

      const out = convertTraceToTraceData({
        id: 't1',
        workshop_id: 'w1',
        input: complexInput,
        output: complexOutput,
      });

      expect(out.input).toBe(complexInput);
      expect(out.output).toBe(complexOutput);
    });

    it('handles trace with only required fields', () => {
      const out = convertTraceToTraceData({
        id: 'minimal-trace',
        workshop_id: 'w1',
        input: 'test input',
        output: 'test output',
      });

      expect(out.id).toBe('minimal-trace');
      expect(out.input).toBe('test input');
      expect(out.output).toBe('test output');
    });

    it('handles trace with complex context object', () => {
      const context = {
        source: 'mlflow',
        experiment: { id: 'exp-1', name: 'test-experiment' },
        run: { id: 'run-1', status: 'FINISHED' },
        nested: { deep: { value: true } },
      };

      const out = convertTraceToTraceData({
        id: 't1',
        workshop_id: 'w1',
        input: 'in',
        output: 'out',
        context: context,
      });

      expect(out.context).toEqual(context);
    });
  });
});
