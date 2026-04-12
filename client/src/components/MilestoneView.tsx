import { useState } from 'react';
import { ChevronDown, ChevronRight } from 'lucide-react';

interface MilestoneEvent {
  type: 'tool_call' | 'transfer' | 'result' | 'error';
  label: string;
  span_name: string;
  data: Record<string, unknown>;
}

interface Milestone {
  number: number;
  title: string;
  summary: string;
  events: MilestoneEvent[];
}

interface MilestoneViewProps {
  executiveSummary: string;
  milestones: Milestone[];
}

const EVENT_TYPE_STYLES: Record<string, { bg: string; text: string; label: string }> = {
  tool_call: { bg: 'bg-blue-100 dark:bg-blue-900/30', text: 'text-blue-700 dark:text-blue-300', label: 'tool' },
  transfer: { bg: 'bg-purple-100 dark:bg-purple-900/30', text: 'text-purple-700 dark:text-purple-300', label: 'transfer' },
  result: { bg: 'bg-green-100 dark:bg-green-900/30', text: 'text-green-700 dark:text-green-300', label: 'result' },
  error: { bg: 'bg-red-100 dark:bg-red-900/30', text: 'text-red-700 dark:text-red-300', label: 'error' },
};

function EventBadge({ type }: { type: string }) {
  const style = EVENT_TYPE_STYLES[type] || EVENT_TYPE_STYLES.result;
  return (
    <span className={`inline-flex items-center px-2 py-0.5 rounded text-xs font-medium ${style.bg} ${style.text}`}>
      {style.label}
    </span>
  );
}

function MilestoneEventItem({ event }: { event: MilestoneEvent }) {
  const [expanded, setExpanded] = useState(false);
  const hasData = event.data && Object.keys(event.data).length > 0;

  return (
    <div className="ml-6 border-l-2 border-gray-200 dark:border-gray-700 pl-4 py-2">
      <div className="flex items-start gap-2">
        <EventBadge type={event.type} />
        <div className="flex-1 min-w-0">
          <span className="text-sm text-gray-700 dark:text-gray-300">{event.label}</span>
          {hasData && (
            <button
              onClick={() => setExpanded(!expanded)}
              className="ml-2 text-xs text-gray-500 hover:text-gray-700 dark:hover:text-gray-300"
            >
              {expanded ? 'See less' : 'See more'}
            </button>
          )}
        </div>
      </div>
      {expanded && hasData && (
        <pre className="mt-2 ml-0 p-3 bg-gray-50 dark:bg-gray-800 rounded text-xs overflow-x-auto max-h-64 overflow-y-auto">
          {JSON.stringify(event.data, null, 2)}
        </pre>
      )}
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
          <p className="text-sm text-gray-600 dark:text-gray-400 ml-10 mb-2">
            {milestone.summary}
          </p>
          {milestone.events.length > 0 && (
            <div className="ml-4">
              {milestone.events.map((event, i) => (
                <MilestoneEventItem key={i} event={event} />
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
