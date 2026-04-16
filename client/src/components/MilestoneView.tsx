import { useState, useEffect, useRef } from 'react';
import { ChevronDown, ChevronRight, ArrowDown, Database, Code2, FileJson, MessageSquare } from 'lucide-react';
import { GenerativeBlob, getHash, MILESTONE_THEMES } from './GenerativeBlob';

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
  /** Show span path labels (span_name → jsonpath). Useful for facilitators, noisy for SMEs. */
  showPaths?: boolean;
  /** Optional prefix used to create stable anchor IDs for milestone scrolling. */
  anchorPrefix?: string;
  /** Optional callback when a milestone becomes active (e.g. via scroll or click) */
  onActiveMilestoneChange?: (milestoneRef: string | null) => void;
  /** Currently active milestone ref */
  activeMilestoneRef?: string | null;
  /** Comments to show user blobs on milestones */
  comments?: any[];
  /** Optional callback to explicitly open the chat drawer */
  onOpenChat?: () => void;
  /** Currently hovered milestone ref from grading panel */
  hoveredMilestoneRef?: string | null;
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
    <div className="flex items-center gap-2 mb-3 bg-white/60 backdrop-blur-md border border-white/60 px-3 py-1.5 rounded-full shadow-sm w-fit">
      <GenerativeBlob hash={getHash(dataRef.span_name)} sizeClassName="w-3.5 h-3.5" subtle />
      <span className="text-[10px] font-bold text-slate-600">
        {path}
      </span>
    </div>
  );
}

function SpanDataItem({ dataRef, showPath = true, type }: { dataRef: SpanDataRef; showPath?: boolean; type: 'input' | 'output' }) {
  const [expanded, setExpanded] = useState(false);
  const valueStr = formatValue(dataRef.value);
  const isLong = valueStr.length > 150;
  const displayValue = isLong && !expanded ? valueStr.slice(0, 150) + '...' : valueStr;

  const isInput = type === 'input';
  const themeColor = isInput ? 'blue' : 'emerald';

  return (
    <div className="relative group mb-0">
      {showPath && <RefLabel dataRef={dataRef} />}
      <div className="relative">
        {dataRef.value === null || dataRef.value === undefined ? (
          <span className="text-sm text-slate-400 italic px-4 py-2 block bg-white/50 backdrop-blur-md rounded-full border border-white/60 shadow-sm w-fit">Data not resolved</span>
        ) : (
          <div className="rounded-[24px] border border-white/60 bg-white/40 backdrop-blur-xl shadow-[0_8px_30px_rgb(0,0,0,0.04)] overflow-hidden relative">
            {/* Soft background glow */}
            <div className={`absolute -top-24 -right-24 w-48 h-48 bg-${themeColor}-400/20 rounded-full blur-3xl pointer-events-none`} />
            <div className={`absolute -bottom-24 -left-24 w-48 h-48 bg-${themeColor}-400/20 rounded-full blur-3xl pointer-events-none`} />
            
            <div className="p-5 overflow-x-auto relative z-10">
              <pre className="text-[13px] leading-relaxed text-slate-700 font-mono whitespace-pre-wrap break-words">
                {displayValue}
              </pre>
            </div>
            {isLong && (
              <div className="px-5 py-3 bg-white/30 border-t border-white/40 flex justify-center backdrop-blur-md relative z-10">
                <button
                  onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
                  className={`text-xs font-bold text-${themeColor}-700 hover:text-${themeColor}-900 transition-colors bg-white/60 hover:bg-white/80 px-4 py-1.5 rounded-full shadow-sm`}
                >
                  {expanded ? 'Collapse Payload' : 'Explore Full Payload'}
                </button>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

export function MilestoneView({ executiveSummary, milestones, showPaths = true, anchorPrefix, onActiveMilestoneChange, activeMilestoneRef, comments = [], onOpenChat, hoveredMilestoneRef }: MilestoneViewProps) {
  const containerRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!onActiveMilestoneChange || !containerRef.current) return;

    const observer = new IntersectionObserver(
      (entries) => {
        // Find the most visible entry
        let maxRatio = 0;
        let mostVisibleId: string | null = null;

        entries.forEach((entry) => {
          if (entry.isIntersecting && entry.intersectionRatio > maxRatio) {
            maxRatio = entry.intersectionRatio;
            mostVisibleId = entry.target.getAttribute('data-milestone-ref');
          }
        });

        if (mostVisibleId !== null) {
          onActiveMilestoneChange(mostVisibleId === 'trace' ? null : mostVisibleId);
        }
      },
      {
        // Root is the viewport by default.
        // We want to trigger when the element is roughly in the top/middle of the screen.
        rootMargin: '-10% 0px -50% 0px',
        threshold: [0, 0.25, 0.5, 0.75, 1.0],
      }
    );

    const elements = containerRef.current.querySelectorAll('[data-milestone-ref]');
    elements.forEach((el) => observer.observe(el));

    return () => observer.disconnect();
  }, [onActiveMilestoneChange]);

  const traceComments = comments.filter(c => !c.milestone_ref);
  const uniqueTraceUsers = Array.from(new Map(traceComments.map(c => [c.user_name, c])).values());

  return (
    <div className="bg-slate-50/30 rounded-xl p-5 md:p-6" ref={containerRef}>
      {/* Executive Summary */}
      <div 
        data-milestone-ref="trace"
        className={`mb-8 relative overflow-hidden rounded-xl bg-gradient-to-br from-indigo-500 to-purple-600 p-[1px] shadow-sm transition-all cursor-pointer pr-8 ${activeMilestoneRef === null ? 'ring-2 ring-indigo-500 ring-offset-2' : 'hover:ring-2 hover:ring-indigo-500/50 hover:ring-offset-1'}`}
        onClick={() => {
          onActiveMilestoneChange?.(null);
          onOpenChat?.();
        }}
      >
        <div className="bg-white rounded-[11px] p-5 h-full relative z-10">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-3">
              <GenerativeBlob hash={getHash('synthesis')} sizeClassName="w-6 h-6" subtle />
              <h3 className="text-sm font-bold uppercase tracking-wider text-indigo-900">Agent Synthesis</h3>
            </div>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed font-medium">
            {executiveSummary}
          </p>
        </div>
        
        {/* Vertical Comment Avatars */}
        {traceComments.length > 0 && (
          <div className="absolute right-0 top-4 bottom-4 flex flex-col items-center justify-between z-20 pointer-events-none opacity-60 hover:opacity-100 transition-opacity">
            {traceComments.map((c) => (
              <div 
                key={c.id} 
                className="pointer-events-auto cursor-pointer hover:scale-125 transition-transform shadow-sm rounded-full border-2 border-white"
                onClick={(e) => {
                  e.stopPropagation();
                  onActiveMilestoneChange?.(null);
                  onOpenChat?.();
                }}
              >
                <GenerativeBlob 
                  hash={getHash(c.user_name)} 
                  sizeClassName="w-6 h-6"
                  centerContent={
                    <span className="text-[8px] font-bold text-white drop-shadow-sm">
                      {c.user_name.substring(0, 2).toUpperCase()}
                    </span>
                  }
                />
              </div>
            ))}
          </div>
        )}
      </div>

      {/* Trajectory Timeline */}
      <div className="relative pl-12 z-10">
        <div className="space-y-0">
          {milestones.map((milestone, index) => {
            const nextMilestone = milestones[index + 1];
            const nextHash = nextMilestone 
              ? getHash(nextMilestone.title, nextMilestone.number)
              : null;

            return (
              <MilestoneCard
                key={milestone.number}
                milestone={milestone}
                showPaths={showPaths}
                anchorId={anchorPrefix ? `${anchorPrefix}-m${milestone.number}` : undefined}
                isLast={index === milestones.length - 1}
                nextHash={nextHash}
                isActive={activeMilestoneRef === `m${milestone.number}`}
                isHovered={hoveredMilestoneRef === `m${milestone.number}`}
                onClick={() => onActiveMilestoneChange?.(`m${milestone.number}`)}
                comments={comments}
                onOpenChat={onOpenChat}
              />
            );
          })}
        </div>
      </div>
    </div>
  );
}

function MilestoneCard({
  milestone,
  showPaths = true,
  anchorId,
  isLast,
  nextHash,
  isActive,
  isHovered,
  onClick,
  comments = [],
  onOpenChat,
}: {
  milestone: Milestone;
  showPaths?: boolean;
  anchorId?: string;
  isLast?: boolean;
  nextHash?: number | null;
  isActive?: boolean;
  isHovered?: boolean;
  onClick?: () => void;
  comments?: any[];
  onOpenChat?: () => void;
}) {
  const [expanded, setExpanded] = useState(true);
  const hasInputs = milestone.inputs.length > 0;
  const hasOutputs = milestone.outputs.length > 0;
  const hasData = hasInputs || hasOutputs;

  const hash = getHash(milestone.title, milestone.number);
  const theme = MILESTONE_THEMES[hash % MILESTONE_THEMES.length];
  const nextTheme = nextHash !== null && nextHash !== undefined 
    ? MILESTONE_THEMES[nextHash % MILESTONE_THEMES.length]
    : theme;

  const topArrowColor = theme.textStart;
  const bottomArrowColor = nextTheme.textEnd;

  const milestoneComments = comments.filter(c => c.milestone_ref === `m${milestone.number}`);

  return (
    <div 
      id={anchorId} 
      data-milestone-ref={`m${milestone.number}`}
      className={`relative group cursor-pointer transition-all duration-300 rounded-2xl p-2 -ml-2 pr-8 ${
        isHovered 
          ? 'bg-indigo-50/30 shadow-md ring-2 ring-indigo-400 ring-offset-1' 
          : isActive 
            ? 'bg-white/60 shadow-sm ring-1 ring-slate-200' 
            : 'hover:bg-white/40'
      }`}
      onClick={() => {
        onClick?.();
      }}
    >
      {/* Minimalist Generative Timeline Node - Sticky Container */}
      <div className="absolute -left-[46px] top-0 bottom-0 w-8 z-10">
        <div className="sticky top-6 w-8 h-8 flex items-center justify-center group-hover:scale-110 transition-transform duration-500">
          <GenerativeBlob 
            hash={hash} 
            sizeClassName="w-8 h-8"
            centerContent={
              <div className="relative w-5 h-5 bg-white/20 backdrop-blur-md rounded-full shadow-sm border border-white/40 flex items-center justify-center text-[10px] font-bold text-white z-10">
                {milestone.number}
              </div>
            }
          />
        </div>
      </div>

      {/* Vertical Comment Avatars */}
      {milestoneComments.length > 0 && (
        <div className="absolute right-0 top-12 bottom-12 flex flex-col items-center justify-between z-20 pointer-events-none opacity-60 group-hover:opacity-100 transition-opacity">
          {milestoneComments.map((c) => (
            <div 
              key={c.id} 
              className="pointer-events-auto cursor-pointer hover:scale-125 transition-transform shadow-sm rounded-full border-2 border-white"
              onClick={(e) => {
                e.stopPropagation();
                onClick?.();
                onOpenChat?.();
              }}
            >
              <GenerativeBlob 
                hash={getHash(c.user_name)} 
                sizeClassName="w-6 h-6"
                centerContent={
                  <span className="text-[8px] font-bold text-white drop-shadow-sm">
                    {c.user_name.substring(0, 2).toUpperCase()}
                  </span>
                }
              />
            </div>
          ))}
        </div>
      )}

      <div className="flex flex-col w-full">
        {/* Title */}
        <div className="pt-2 pb-6">
          <div className="flex items-center justify-between w-full">
            <div className="flex items-center gap-3">
              <div className="relative inline-block">
                <h3 className="text-base font-bold text-slate-900 tracking-tight relative z-10 px-1">
                  {milestone.title}
                </h3>
                <div className={`absolute bottom-0.5 left-0 right-0 h-2.5 bg-gradient-to-r ${theme.grad} opacity-30 rounded-full -rotate-1`} />
              </div>
            </div>
          </div>
        </div>

        {/* Inputs */}
        {hasInputs && (
          <div className="flex flex-col gap-4">
            {milestone.inputs.map((ref, i) => (
              <SpanDataItem key={i} dataRef={ref} showPath={showPaths} type="input" />
            ))}
            <div className="flex justify-center -my-6 relative z-20 pointer-events-none">
              <div className="w-8 h-8 rounded-full bg-white/60 backdrop-blur-md border border-white/80 shadow-sm flex items-center justify-center">
                <ArrowDown className={`w-4 h-4 ${topArrowColor} opacity-80`} strokeWidth={3} />
              </div>
            </div>
          </div>
        )}

        {/* Summary (The Process) */}
        <div className="py-2 flex justify-center relative z-10">
          <p className="text-sm text-slate-700 leading-relaxed font-medium bg-white/40 backdrop-blur-md border border-white/60 rounded-3xl shadow-sm px-6 py-5 max-w-2xl text-center w-full">
            {milestone.summary}
          </p>
        </div>

        {/* Outputs */}
        {hasOutputs && (
          <div className="flex flex-col gap-4 mt-0">
            <div className="flex justify-center -my-6 relative z-20 pointer-events-none">
              <div className="w-8 h-8 rounded-full bg-white/60 backdrop-blur-md border border-white/80 shadow-sm flex items-center justify-center">
                <ArrowDown className={`w-4 h-4 ${bottomArrowColor} opacity-80`} strokeWidth={3} />
              </div>
            </div>
            {milestone.outputs.map((ref, i) => (
              <SpanDataItem key={i} dataRef={ref} showPath={showPaths} type="output" />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
