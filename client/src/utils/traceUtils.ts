import type { TraceData } from '@/components/TraceViewer';

/**
 * Convert API trace to TraceData format for use with TraceViewer component
 */
export const convertTraceToTraceData = (trace: any): TraceData => ({
  id: trace.id,
  input: trace.input,
  output: trace.output,
  context: trace.context || undefined,
  mlflow_trace_id: trace.mlflow_trace_id || undefined,
  mlflow_url: trace.mlflow_url || undefined,
  mlflow_host: trace.mlflow_host || undefined,
  mlflow_experiment_id: trace.mlflow_experiment_id || undefined
});
