import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronDown, ChevronRight, AlertTriangle, ArrowUpRight } from 'lucide-react';
import type { Trace } from '@/client';
import type { DiscoveryFeedbackWithUser } from '@/client';

interface Finding {
  text: string;
  evidence_trace_ids: string[];
  priority: string;
}

interface Disagreement {
  trace_id: string;
  summary: string;
  underlying_theme: string;
  followup_questions: string[];
  facilitator_suggestions: string[];
}

export interface PromotePayload {
  key: string;
  text: string;
  source_type: 'finding' | 'disagreement';
  source_trace_ids: string[];
}

interface DiscoveryTraceCardProps {
  trace: Trace;
  feedback: DiscoveryFeedbackWithUser[];
  findings?: Finding[];
  disagreements?: Disagreement[];
  onPromote: (payload: PromotePayload) => void;
  promotedKeys?: Set<string>;
}

function tryParseContent(raw: string): string {
  // Try to extract content from JSON message format, fall back to raw
  try {
    const parsed = JSON.parse(raw);
    if (parsed?.messages?.[0]?.content) return parsed.messages[0].content;
    if (parsed?.choices?.[0]?.message?.content) return parsed.choices[0].message.content;
    if (typeof parsed === 'string') return parsed;
  } catch {
    // not JSON, use raw
  }
  return raw;
}

function FeedbackRow({ fb }: { fb: DiscoveryFeedbackWithUser }) {
  const [qnaOpen, setQnaOpen] = useState(false);
  const qnaCount = fb.followup_qna?.length ?? 0;

  return (
    <div className="py-3 border-b border-slate-100 last:border-0">
      <div className="flex items-center gap-2 mb-1">
        <span className="text-sm font-medium text-slate-800">{fb.user_name}</span>
        <Badge
          className={
            fb.feedback_label === 'good'
              ? 'bg-emerald-100 text-emerald-800 border-emerald-200'
              : 'bg-red-100 text-red-800 border-red-200'
          }
        >
          {fb.feedback_label.toUpperCase()}
        </Badge>
      </div>
      <p className="text-sm text-slate-700">{fb.comment}</p>
      {qnaCount > 0 && (
        <button
          type="button"
          className="flex items-center gap-1 mt-1.5 text-xs text-slate-500 hover:text-slate-700"
          onClick={() => setQnaOpen(!qnaOpen)}
        >
          {qnaOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {qnaCount} follow-up Q&A{qnaCount !== 1 ? 's' : ''}
        </button>
      )}
      {qnaOpen && fb.followup_qna && (
        <div className="mt-1.5 pl-4 border-l-2 border-slate-200 space-y-1.5">
          {fb.followup_qna.map((pair, i) => (
            <div key={i} className="text-xs">
              <span className="font-medium text-slate-600">Q: </span>
              <span className="text-slate-700">{pair.question}</span>
              <br />
              <span className="font-medium text-slate-600">A: </span>
              <span className="text-slate-700">{pair.answer}</span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

export const DiscoveryTraceCard: React.FC<DiscoveryTraceCardProps> = ({
  trace,
  feedback,
  findings,
  disagreements,
  onPromote,
  promotedKeys = new Set(),
}) => {
  const [contentExpanded, setContentExpanded] = useState(false);
  const [findingsOpen, setFindingsOpen] = useState(true);

  const inputText = tryParseContent(trace.input);
  const outputText = tryParseContent(trace.output);
  const truncateAt = 200;

  const hasAnalysis = (findings && findings.length > 0) || (disagreements && disagreements.length > 0);

  return (
    <Card className="overflow-hidden">
      <CardContent className="p-5">
        {/* Trace content */}
        <div className="mb-4 rounded-lg bg-slate-50 p-4 space-y-2">
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">User</span>
            <p className="text-sm text-slate-800 mt-0.5">{inputText}</p>
          </div>
          <div>
            <span className="text-xs font-semibold uppercase tracking-wider text-slate-500">Assistant</span>
            <p className="text-sm text-slate-800 mt-0.5">
              {contentExpanded || outputText.length <= truncateAt
                ? outputText
                : outputText.slice(0, truncateAt) + '...'}
            </p>
            {outputText.length > truncateAt && (
              <button
                type="button"
                className="text-xs text-blue-600 hover:text-blue-800 mt-1"
                onClick={() => setContentExpanded(!contentExpanded)}
              >
                {contentExpanded ? 'Show less' : 'Show more'}
              </button>
            )}
          </div>
        </div>

        {/* Analysis findings — pinned above feedback */}
        {hasAnalysis && (
          <div className="mb-4">
            <button
              type="button"
              className="flex items-center gap-1.5 text-sm font-semibold text-slate-700 mb-2"
              onClick={() => setFindingsOpen(!findingsOpen)}
            >
              {findingsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
              Analysis Findings
            </button>
            {findingsOpen && (
              <div className="space-y-2">
                {disagreements?.map((d, i) => {
                  const key = `disagreement-${trace.id}-${i}`;
                  return (
                    <div key={key} className={`finding-item rounded-lg border border-red-200 bg-red-50 p-3${promotedKeys.has(key) ? ' promoted-collapsing' : ''}`}>
                      <div className="flex items-center gap-2 mb-1">
                        <AlertTriangle className="w-4 h-4 text-red-600" />
                        <span className="text-xs font-semibold uppercase text-red-700">High Disagreement</span>
                      </div>
                      <p className="text-sm text-slate-800 font-medium">{d.summary}</p>
                      <p className="text-xs text-slate-600 mt-1">Theme: {d.underlying_theme}</p>
                      {d.followup_questions?.length > 0 && (
                        <div className="mt-2">
                          <span className="text-xs font-semibold text-slate-600">Follow-up Questions</span>
                          <ul className="mt-0.5 space-y-0.5">
                            {d.followup_questions.map((q, qi) => (
                              <li key={qi} className="text-xs text-slate-700 pl-3 relative before:content-['•'] before:absolute before:left-0 before:text-slate-400">{q}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      {d.facilitator_suggestions?.length > 0 && (
                        <div className="mt-2">
                          <span className="text-xs font-semibold text-blue-700">Facilitator Suggestions</span>
                          <ul className="mt-0.5 space-y-0.5">
                            {d.facilitator_suggestions.map((s, si) => (
                              <li key={si} className="text-xs text-blue-800 pl-3 relative before:content-['→'] before:absolute before:left-0 before:text-blue-400">{s}</li>
                            ))}
                          </ul>
                        </div>
                      )}
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 text-xs"
                        disabled={promotedKeys.has(key)}
                        onClick={() => onPromote({ key, text: d.summary, source_type: 'disagreement', source_trace_ids: [d.trace_id] })}
                      >
                        <ArrowUpRight className="w-3 h-3 mr-1" />
                        {promotedKeys.has(key) ? 'Added' : 'Add to Draft'}
                      </Button>
                    </div>
                  );
                })}
                {findings?.map((f, i) => {
                  const key = `finding-${trace.id}-${i}`;
                  const priorityColor = f.priority === 'high' ? 'border-amber-200 bg-amber-50' : 'border-blue-200 bg-blue-50';
                  return (
                    <div key={key} className={`finding-item rounded-lg border ${priorityColor} p-3${promotedKeys.has(key) ? ' promoted-collapsing' : ''}`}>
                      <p className="text-sm text-slate-800 font-medium">{f.text}</p>
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 text-xs"
                        disabled={promotedKeys.has(key)}
                        onClick={() => onPromote({ key, text: f.text, source_type: 'finding', source_trace_ids: f.evidence_trace_ids })}
                      >
                        <ArrowUpRight className="w-3 h-3 mr-1" />
                        {promotedKeys.has(key) ? 'Added' : 'Add to Draft'}
                      </Button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Participant feedback */}
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-1">
            Feedback ({feedback.length})
          </h4>
          <div className="divide-y divide-slate-100">
            {feedback.map((fb) => (
              <FeedbackRow key={fb.id} fb={fb} />
            ))}
          </div>
          {feedback.length === 0 && (
            <p className="text-sm text-slate-500 italic py-2">No feedback yet</p>
          )}
        </div>
      </CardContent>
    </Card>
  );
};
