import { useState } from 'react';
import { ChevronDown, ChevronRight, ArrowRight } from 'lucide-react';

interface SpanDataRef {
  span_name: string;
  field: 'inputs' | 'outputs';
  jsonpath?: string | null;
  value?: unknown;
}

interface Milestone {
  number: number;
  title: string;
  summary: string;
  inputs: SpanDataRef[];
  outputs: SpanDataRef[];
}

interface MilestoneViewProps {
  executiveSummary: string;
  milestones: Milestone[];
}

function formatValue(value: unknown): string {
  if (value === null || value === undefined) return '—';
  if (typeof value === 'string') return value;
  return JSON.stringify(value, null, 2);
}

function RefLabel({ dataRef }: { dataRef: SpanDataRef }) {
  const path = dataRef.jsonpath
    ? `${dataRef.span_name} → ${dataRef.jsonpath}`
    : `${dataRef.span_name} → ${dataRef.field}`;
  return (
    <span className="text-xs font-mono text-gray-500 dark:text-gray-400">
      {path}
    </span>
  );
}

function SpanDataItem({ dataRef }: { dataRef: SpanDataRef }) {
  const [expanded, setExpanded] = useState(false);
  const valueStr = formatValue(dataRef.value);
  const isLong = valueStr.length > 120;
  const displayValue = isLong && !expanded ? valueStr.slice(0, 120) + '...' : valueStr;

  return (
    <div className="py-1.5">
      <RefLabel dataRef={dataRef} />
      <div className="mt-0.5">
        {dataRef.value === null || dataRef.value === undefined ? (
          <span className="text-sm text-gray-400 italic">not resolved</span>
        ) : (
          <>
            <pre className="text-sm text-gray-800 dark:text-gray-200 whitespace-pre-wrap break-words font-mono bg-gray-50 dark:bg-gray-800 rounded px-2 py-1 max-h-48 overflow-y-auto">
              {displayValue}
            </pre>
            {isLong && (
              <button
                onClick={() => setExpanded(!expanded)}
                className="text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300 mt-0.5"
              >
                {expanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export function MilestoneView({ executiveSummary, milestones }: MilestoneViewProps) {
  return (
    <div className="space-y-4">
      {/* Executive Summary */}
      <div className="p-4 bg-gray-50 dark:bg-gray-800/50 rounded-lg border border-gray-200 dark:border-gray-700">
        <p className="text-sm text-gray-700 dark:text-gray-300 italic">
          {executiveSummary}
        </p>
      </div>

      {/* Milestones */}
      <div className="space-y-3">
        {milestones.map((milestone) => (
          <MilestoneCard key={milestone.number} milestone={milestone} />
        ))}
      </div>
    </div>
  );
}

function MilestoneCard({ milestone }: { milestone: Milestone }) {
  const [expanded, setExpanded] = useState(true);
  const hasData = milestone.inputs.length > 0 || milestone.outputs.length > 0;

  return (
    <div className="border border-gray-200 dark:border-gray-700 rounded-lg overflow-hidden">
      <button
        onClick={() => setExpanded(!expanded)}
        className="w-full flex items-center gap-3 p-3 hover:bg-gray-50 dark:hover:bg-gray-800/50 transition-colors text-left"
      >
        <span className="flex-shrink-0 w-7 h-7 rounded-full bg-indigo-100 dark:bg-indigo-900/30 text-indigo-700 dark:text-indigo-300 flex items-center justify-center text-sm font-semibold">
          {milestone.number}
        </span>
        <div className="flex-1 min-w-0">
          <h3 className="text-sm font-semibold text-gray-900 dark:text-gray-100">
            {milestone.title}
          </h3>
        </div>
        {expanded ? (
          <ChevronDown className="h-4 w-4 text-gray-400 flex-shrink-0" />
        ) : (
          <ChevronRight className="h-4 w-4 text-gray-400 flex-shrink-0" />
        )}
      </button>

      {expanded && (
        <div className="px-3 pb-3">
          <p className="text-sm text-gray-600 dark:text-gray-400 ml-10 mb-3">
            {milestone.summary}
          </p>

          {hasData && (
            <div className="ml-10 space-y-2">
              {/* Input → Output flow */}
              {milestone.inputs.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-medium text-blue-600 dark:text-blue-400 uppercase tracking-wide">Input</span>
                  </div>
                  <div className="border-l-2 border-blue-200 dark:border-blue-800 pl-3">
                    {milestone.inputs.map((ref, i) => (
                      <SpanDataItem key={i} dataRef={ref} />
                    ))}
                  </div>
                </div>
              )}

              {milestone.inputs.length > 0 && milestone.outputs.length > 0 && (
                <div className="flex items-center gap-1 text-gray-400 py-0.5">
                  <ArrowRight className="h-3 w-3" />
                </div>
              )}

              {milestone.outputs.length > 0 && (
                <div>
                  <div className="flex items-center gap-1.5 mb-1">
                    <span className="text-xs font-medium text-green-600 dark:text-green-400 uppercase tracking-wide">Output</span>
                  </div>
                  <div className="border-l-2 border-green-200 dark:border-green-800 pl-3">
                    {milestone.outputs.map((ref, i) => (
                      <SpanDataItem key={i} dataRef={ref} />
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
