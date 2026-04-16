import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, ArrowUpRight, Clock, FileText, Users, AlertTriangle } from 'lucide-react';
import type { DiscoveryAnalysis } from '@/hooks/useWorkshopApi';
import type { PromotePayload } from './DiscoveryTraceCard';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';

interface CrossTraceAnalysisSummaryProps {
  analysis: DiscoveryAnalysis;
  onPromote: (payload: PromotePayload) => void;
  onNavigateToOrigin?: (originRef: string) => void;
  promotedKeys?: Set<string>;
}

export const CrossTraceAnalysisSummary: React.FC<CrossTraceAnalysisSummaryProps> = ({
  analysis,
  onPromote,
  onNavigateToOrigin,
  promotedKeys = new Set(),
}) => {
  const [collapsed, setCollapsed] = useState(false);

  const linkifyOriginRefs = (text: string): string =>
    text.replace(
      /(^|[\s(])(?<!\]\()([A-Za-z0-9_-]+#(?:all|m\d+|q\d+))(?=$|[\s).,;:!?])/gi,
      (match, prefix, ref) => `${prefix}[${ref}](${ref})`
    );

  // Cross-trace findings = those referencing 2+ traces
  const crossTraceFindings = analysis.findings.filter(
    (f) => f.evidence_trace_ids.length >= 2
  );
  const traceSpecificCount = analysis.findings.length - crossTraceFindings.length;

  const highDisagreements = analysis.disagreements?.high ?? [];
  const mediumDisagreements = analysis.disagreements?.medium ?? [];
  const lowerDisagreements = analysis.disagreements?.lower ?? [];
  const totalDisagreements = highDisagreements.length + mediumDisagreements.length + lowerDisagreements.length;

  if (crossTraceFindings.length === 0 && !analysis.analysis_data && totalDisagreements === 0) return null;

  return (
    <Card className="border-slate-200">
      <CardContent className="p-4">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-slate-800">Analysis Summary</h3>
          <div className="flex items-center gap-2">
            <div className="flex items-center gap-3 text-xs text-slate-500">
              <span className="flex items-center gap-1">
                <Users className="w-3 h-3" />
                {analysis.participant_count} participants
              </span>
              <span className="flex items-center gap-1">
                <Clock className="w-3 h-3" />
                {new Date(analysis.created_at).toLocaleString()}
              </span>
              <span className="flex items-center gap-1">
                <FileText className="w-3 h-3" />
                {analysis.template_used === 'evaluation_criteria' ? 'Eval Criteria' : 'Themes & Patterns'}
              </span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 px-2"
              onClick={() => setCollapsed(!collapsed)}
              aria-label={collapsed ? 'Expand' : 'Collapse'}
            >
              {collapsed ? <ChevronDown className="w-4 h-4" /> : <ChevronUp className="w-4 h-4" />}
            </Button>
          </div>
        </div>

        {!collapsed && (
          <div className="space-y-3">
            {analysis.analysis_data && (
              <p className="text-sm text-slate-700">{analysis.analysis_data}</p>
            )}

            {crossTraceFindings.length > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-slate-500">Cross-Trace Findings</h4>
                {crossTraceFindings.map((f, i) => {
                  const key = `cross-finding-${analysis.id}-${i}`;
                  return (
                    <div key={key} className={`finding-item flex items-start justify-between rounded-lg bg-slate-50 p-3${promotedKeys.has(key) ? ' promoted-collapsing' : ''}`}>
                      <div>
                        <div className="text-sm text-slate-800 font-medium">
                          <ReactMarkdown
                            remarkPlugins={[remarkGfm]}
                            components={{
                              p: ({ children }) => <p className="m-0">{children}</p>,
                              a: ({ href, children }) => (
                                <a
                                  href={href}
                                  onClick={(e) => {
                                    if (href && onNavigateToOrigin) {
                                      e.preventDefault();
                                      onNavigateToOrigin(href);
                                    }
                                  }}
                                  className="text-indigo-700 underline hover:text-indigo-900"
                                >
                                  {children}
                                </a>
                              ),
                            }}
                          >
                            {linkifyOriginRefs(f.text)}
                          </ReactMarkdown>
                        </div>
                        <span className="text-xs text-slate-500">
                          Linked to {f.evidence_trace_ids.length} traces
                        </span>
                      </div>
                      <Button
                        variant="outline"
                        size="sm"
                        className="text-xs shrink-0 ml-3"
                        disabled={promotedKeys.has(key)}
                        onClick={() =>
                          onPromote({
                            key,
                            text: f.text,
                            source_type: 'finding',
                            source_trace_ids: f.evidence_trace_ids,
                            source_milestone_refs: f.evidence_milestone_refs ?? [],
                          })
                        }
                      >
                        <ArrowUpRight className="w-3 h-3 mr-1" />
                        {promotedKeys.has(key) ? 'Added' : 'Add to Draft'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}

            {totalDisagreements > 0 && (
              <div className="space-y-2">
                <h4 className="text-xs font-semibold uppercase text-slate-500">
                  Disagreements ({totalDisagreements})
                </h4>
                {highDisagreements.length > 0 && (
                  <div className="space-y-1.5">
                    {highDisagreements.map((d, i) => (
                      <div key={`high-${i}`} className="flex items-start gap-2 rounded-lg bg-red-50 border border-red-200 p-2.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-red-600 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] font-semibold uppercase text-red-700">High</span>
                          <p className="text-sm text-slate-800">{d.summary}</p>
                          <p className="text-xs text-slate-500 mt-0.5">Theme: {d.underlying_theme}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {mediumDisagreements.length > 0 && (
                  <div className="space-y-1.5">
                    {mediumDisagreements.map((d, i) => (
                      <div key={`med-${i}`} className="flex items-start gap-2 rounded-lg bg-amber-50 border border-amber-200 p-2.5">
                        <AlertTriangle className="w-3.5 h-3.5 text-amber-600 mt-0.5 shrink-0" />
                        <div className="min-w-0">
                          <span className="text-[10px] font-semibold uppercase text-amber-700">Medium</span>
                          <p className="text-sm text-slate-800">{d.summary}</p>
                          <p className="text-xs text-slate-500 mt-0.5">Theme: {d.underlying_theme}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
                {lowerDisagreements.length > 0 && (
                  <div className="space-y-1.5">
                    {lowerDisagreements.map((d, i) => (
                      <div key={`low-${i}`} className="flex items-start gap-2 rounded-lg bg-blue-50 border border-blue-200 p-2.5">
                        <div className="min-w-0">
                          <span className="text-[10px] font-semibold uppercase text-blue-700">Lower</span>
                          <p className="text-sm text-slate-800">{d.summary}</p>
                          <p className="text-xs text-slate-500 mt-0.5">Theme: {d.underlying_theme}</p>
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}

            {traceSpecificCount > 0 && (
              <p className="text-xs text-slate-500 italic">
                {traceSpecificCount} trace-specific finding{traceSpecificCount !== 1 ? 's' : ''} shown on trace cards below
              </p>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
};
