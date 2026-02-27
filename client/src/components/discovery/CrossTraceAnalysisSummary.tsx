import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronUp, ArrowUpRight, Clock, FileText, Users } from 'lucide-react';
import type { DiscoveryAnalysis } from '@/hooks/useWorkshopApi';
import type { PromotePayload } from './DiscoveryTraceCard';

interface CrossTraceAnalysisSummaryProps {
  analysis: DiscoveryAnalysis;
  onPromote: (payload: PromotePayload) => void;
  promotedKeys?: Set<string>;
}

export const CrossTraceAnalysisSummary: React.FC<CrossTraceAnalysisSummaryProps> = ({
  analysis,
  onPromote,
  promotedKeys = new Set(),
}) => {
  const [collapsed, setCollapsed] = useState(false);

  // Cross-trace findings = those referencing 2+ traces
  const crossTraceFindings = analysis.findings.filter(
    (f) => f.evidence_trace_ids.length >= 2
  );
  const traceSpecificCount = analysis.findings.length - crossTraceFindings.length;

  if (crossTraceFindings.length === 0 && !analysis.analysis_data) return null;

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
                    <div key={key} className="flex items-start justify-between rounded-lg bg-slate-50 p-3">
                      <div>
                        <p className="text-sm text-slate-800 font-medium">{f.text}</p>
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
                          onPromote({ text: f.text, source_type: 'finding', source_trace_ids: f.evidence_trace_ids })
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
