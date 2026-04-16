import React, { useEffect, useMemo, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { ChevronDown, ChevronRight, AlertTriangle, ArrowUpRight, Sparkles, ThumbsUp, ThumbsDown, Send } from 'lucide-react';
import { MilestoneView } from '@/components/MilestoneView';
import type { Trace } from '@/client';
import type { DiscoveryFeedbackWithUser } from '@/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  useCreateDiscoveryComment,
  useDiscoveryAgentRun,
  useDiscoveryComments,
  useVoteDiscoveryComment,
  type DiscoveryCommentData,
} from '@/hooks/useWorkshopApi';

interface Finding {
  text: string;
  evidence_trace_ids: string[];
  evidence_milestone_refs?: string[];
  evidence_question_refs?: string[];
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
  source_milestone_refs?: string[];
}

interface DiscoveryTraceCardProps {
  workshopId?: string;
  currentUserId?: string;
  mode?: 'analysis' | 'social';
  trace: Trace;
  feedback: DiscoveryFeedbackWithUser[];
  findings?: Finding[];
  disagreements?: Disagreement[];
  onPromote: (payload: PromotePayload) => void;
  onNavigateToOrigin?: (originRef: string) => void;
  promotedKeys?: Set<string>;
  followupsEnabled?: boolean;
}

function DiscoverySocialThread({
  workshopId,
  trace,
  currentUserId,
}: {
  workshopId: string;
  trace: Trace;
  currentUserId: string;
}) {
  const [threadScope, setThreadScope] = useState<'trace' | 'milestone'>('trace');
  const [selectedMilestone, setSelectedMilestone] = useState<string>(() => {
    const first = trace.summary?.milestones?.[0];
    return first ? `m${first.number || 1}` : 'm1';
  });
  const [body, setBody] = useState('');
  const [replyToId, setReplyToId] = useState<string | null>(null);
  const [streamedComments, setStreamedComments] = useState<DiscoveryCommentData[] | null>(null);
  const [activeRunId, setActiveRunId] = useState<string | null>(null);
  const [streamedAgentText, setStreamedAgentText] = useState('');
  const [streamStatus, setStreamStatus] = useState<'running' | 'completed' | 'failed' | null>(null);

  const milestoneRef = threadScope === 'milestone' ? selectedMilestone : null;
  const { data: comments = [], refetch } = useDiscoveryComments(workshopId, trace.id, milestoneRef, currentUserId);
  const createComment = useCreateDiscoveryComment(workshopId);
  const voteComment = useVoteDiscoveryComment(workshopId);
  const { data: activeRun } = useDiscoveryAgentRun(workshopId, activeRunId);

  const displayedComments = streamedComments ?? comments;
  const milestoneOptions = useMemo(
    () =>
      (trace.summary?.milestones || []).map(
        (m: { number?: number; title?: string }, i: number) => ({
          value: `m${m.number || i + 1}`,
          label: `Milestone ${m.number || i + 1}: ${m.title || 'Untitled'}`,
        }),
      ),
    [trace.summary?.milestones],
  );

  useEffect(() => {
    setStreamedComments(null);
    const params = new URLSearchParams({
      trace_id: trace.id,
      user_id: currentUserId,
    });
    if (milestoneRef) params.append('milestone_ref', milestoneRef);

    const source = new EventSource(`/workshops/${workshopId}/discovery-comments/stream?${params.toString()}`);
    const onSnapshot = (evt: Event) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data);
        if (Array.isArray(payload?.comments)) {
          setStreamedComments(payload.comments);
        }
      } catch {
        // Ignore malformed stream payloads
      }
    };
    source.addEventListener('comments_snapshot', onSnapshot);
    source.onerror = () => {
      source.close();
    };
    return () => source.close();
  }, [workshopId, trace.id, currentUserId, milestoneRef]);

  useEffect(() => {
    if (!activeRunId) return;
    setStreamedAgentText('');
    setStreamStatus('running');
    const source = new EventSource(`/workshops/${workshopId}/discovery-agent-runs/${activeRunId}/stream`);
    const onDelta = (evt: Event) => {
      try {
        const payload = JSON.parse((evt as MessageEvent).data);
        setStreamedAgentText((prev) => `${prev}${payload.delta || ''}`);
      } catch {
        // Ignore malformed deltas
      }
    };
    const onCompleted = () => {
      setStreamStatus('completed');
      void refetch();
      source.close();
    };
    const onFailed = () => {
      setStreamStatus('failed');
      source.close();
    };
    source.addEventListener('token_delta', onDelta);
    source.addEventListener('run_completed', onCompleted);
    source.addEventListener('run_failed', onFailed);
    source.onerror = () => {
      source.close();
    };
    return () => source.close();
  }, [activeRunId, workshopId, refetch]);

  const byParent = useMemo(() => {
    const map = new Map<string | null, DiscoveryCommentData[]>();
    for (const c of displayedComments) {
      const key = c.parent_comment_id || null;
      if (!map.has(key)) map.set(key, []);
      map.get(key)!.push(c);
    }
    return map;
  }, [displayedComments]);

  const orderedComments = useMemo(() => {
    const roots = (byParent.get(null) || []).slice();
    const out: Array<DiscoveryCommentData & { depth: number }> = [];
    const visit = (comment: DiscoveryCommentData, depth: number) => {
      out.push({ ...comment, depth });
      const children = byParent.get(comment.id) || [];
      children.forEach((child) => visit(child, depth + 1));
    };
    roots.forEach((root) => visit(root, 0));
    return out;
  }, [byParent]);

  const submitComment = async () => {
    const trimmed = body.trim();
    if (!trimmed) return;
    const result = await createComment.mutateAsync({
      trace_id: trace.id,
      user_id: currentUserId,
      body: trimmed,
      milestone_ref: milestoneRef || undefined,
      parent_comment_id: replyToId || undefined,
    });
    setBody('');
    setReplyToId(null);
    if (result.agent_run?.id) {
      setActiveRunId(result.agent_run.id);
    }
    void refetch();
  };

  return (
    <div className="mt-4 rounded-lg border border-slate-200 bg-white p-3">
      <div className="flex flex-wrap items-center gap-2">
        <Button size="sm" variant={threadScope === 'trace' ? 'default' : 'outline'} onClick={() => setThreadScope('trace')}>
          Trace Thread
        </Button>
        <Button size="sm" variant={threadScope === 'milestone' ? 'default' : 'outline'} onClick={() => setThreadScope('milestone')}>
          Milestone Thread
        </Button>
        {threadScope === 'milestone' && (
          <select
            value={selectedMilestone}
            onChange={(e) => setSelectedMilestone(e.target.value)}
            className="h-8 rounded border border-slate-300 bg-white px-2 text-xs"
          >
            {milestoneOptions.length === 0 ? (
              <option value="m1">No milestones available</option>
            ) : (
              milestoneOptions.map((m: { value: string; label: string }) => (
                <option key={m.value} value={m.value}>
                  {m.label}
                </option>
              ))
            )}
          </select>
        )}
      </div>

      <div className="mt-3 space-y-2 max-h-96 overflow-y-auto pr-1">
        {orderedComments.length === 0 && (
          <p className="text-xs text-slate-500">No comments yet. Start the discussion.</p>
        )}
        {orderedComments.map((comment) => (
          <div
            key={comment.id}
            className="rounded border border-slate-200 bg-slate-50 p-2"
            style={{ marginLeft: `${Math.min(comment.depth, 2) * 16}px` }}
          >
            <div className="flex items-center justify-between gap-2">
              <div className="text-xs text-slate-600">
                <span className="font-semibold text-slate-800">{comment.user_name}</span>
                <span className="ml-2 uppercase tracking-wide">{comment.author_type}</span>
              </div>
              <div className="flex items-center gap-1">
                <Button
                  variant={comment.viewer_vote === 1 ? 'default' : 'ghost'}
                  size="sm"
                  className="h-6 px-1.5 text-xs"
                  onClick={() => voteComment.mutate({ commentId: comment.id, traceId: trace.id, userId: currentUserId, value: 1, milestoneRef })}
                >
                  <ThumbsUp className="mr-1 h-3 w-3" /> {comment.upvotes}
                </Button>
                <Button
                  variant={comment.viewer_vote === -1 ? 'default' : 'ghost'}
                  size="sm"
                  className="h-6 px-1.5 text-xs"
                  onClick={() => voteComment.mutate({ commentId: comment.id, traceId: trace.id, userId: currentUserId, value: -1, milestoneRef })}
                >
                  <ThumbsDown className="mr-1 h-3 w-3" /> {comment.downvotes}
                </Button>
              </div>
            </div>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{comment.body}</p>
            <button
              type="button"
              className="mt-1 text-xs text-indigo-600 hover:text-indigo-800"
              onClick={() => setReplyToId(comment.id)}
            >
              Reply
            </button>
          </div>
        ))}
      </div>

      {streamStatus === 'running' && (
        <div className="mt-3 rounded border border-indigo-200 bg-indigo-50 p-2">
          <p className="text-[11px] uppercase tracking-wide text-indigo-700">
            @agent running {activeRun ? `(${activeRun.tool_calls_count} tools)` : ''}
          </p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-indigo-900">{streamedAgentText || 'Streaming response...'}</p>
        </div>
      )}

      <div className="mt-3">
        {replyToId && (
          <div className="mb-1 flex items-center justify-between rounded bg-slate-100 px-2 py-1 text-xs text-slate-600">
            <span>Replying to comment</span>
            <button type="button" onClick={() => setReplyToId(null)} className="text-slate-500 hover:text-slate-800">
              Cancel
            </button>
          </div>
        )}
        <textarea
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Comment on this trace. Use @assistant summarize this thread or @agent investigate this discussion..."
          className="min-h-[88px] w-full rounded border border-slate-300 px-2 py-1.5 text-sm"
        />
        <div className="mt-2 flex justify-end">
          <Button onClick={() => { void submitComment(); }} disabled={createComment.isPending || !body.trim()}>
            <Send className="mr-1 h-3.5 w-3.5" />
            Post
          </Button>
        </div>
      </div>
    </div>
  );
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

function linkifyOriginRefs(text: string): string {
  // Tolerate model outputs that include bare refs like `trace-1#q2` or `trace-1#m3`.
  return text.replace(
    /(^|[\s(])(?<!\]\()([A-Za-z0-9_-]+#(?:all|m\d+|q\d+))(?=$|[\s).,;:!?])/gi,
    (match, prefix, ref) => `${prefix}[${ref}](${ref})`
  );
}

function FeedbackRow({ fb, showFollowups }: { fb: DiscoveryFeedbackWithUser; showFollowups: boolean }) {
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
      {showFollowups && qnaCount > 0 && (
        <button
          type="button"
          className="flex items-center gap-1 mt-1.5 text-xs text-slate-500 hover:text-slate-700"
          onClick={() => setQnaOpen(!qnaOpen)}
        >
          {qnaOpen ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
          {qnaCount} follow-up Q&A{qnaCount !== 1 ? 's' : ''}
        </button>
      )}
      {showFollowups && qnaOpen && fb.followup_qna && (
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
  workshopId = '',
  currentUserId = '',
  mode = 'analysis',
  trace,
  feedback,
  findings,
  disagreements,
  onPromote,
  onNavigateToOrigin,
  promotedKeys = new Set(),
  followupsEnabled = true,
}) => {
  const [contentExpanded, setContentExpanded] = useState(false);
  const [findingsOpen, setFindingsOpen] = useState(true);
  const hasSummary = !!trace.summary?.executive_summary;
  const [showSummary, setShowSummary] = useState(hasSummary);

  const inputText = tryParseContent(trace.input);
  const outputText = tryParseContent(trace.output);
  const truncateAt = 200;

  const hasAnalysis = (findings && findings.length > 0) || (disagreements && disagreements.length > 0);

  return (
    <Card id={`discovery-trace-${trace.id}`} className="overflow-hidden">
      <CardContent className="p-5">
        {/* Toggle between summary and raw content */}
        {hasSummary && (
          <div className="flex items-center gap-1 mb-2">
            <button
              type="button"
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                showSummary
                  ? 'bg-indigo-100 text-indigo-800'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
              onClick={() => setShowSummary(true)}
            >
              <Sparkles className="w-3 h-3 inline mr-1" />
              Summary
            </button>
            <button
              type="button"
              className={`px-2.5 py-1 rounded-md text-xs font-medium transition-colors ${
                !showSummary
                  ? 'bg-slate-200 text-slate-800'
                  : 'text-slate-500 hover:text-slate-700 hover:bg-slate-100'
              }`}
              onClick={() => setShowSummary(false)}
            >
              Raw
            </button>
          </div>
        )}

        {/* Summary view */}
        {showSummary && hasSummary ? (
          <div className="mb-4">
            <MilestoneView
              executiveSummary={trace.summary!.executive_summary}
              milestones={trace.summary!.milestones}
              showPaths={false}
              anchorPrefix={`discovery-trace-${trace.id}`}
            />
          </div>
        ) : (
          /* Raw user/assistant content */
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
        )}

        {/* Analysis findings — pinned above feedback */}
        {mode === 'analysis' && hasAnalysis && (
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
                          {linkifyOriginRefs(d.summary)}
                        </ReactMarkdown>
                      </div>
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
                      <Button
                        variant="outline"
                        size="sm"
                        className="mt-2 text-xs"
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
          </div>
        )}

        {/* Participant feedback */}
        <div>
          <h4 className="text-sm font-semibold text-slate-700 mb-1">
            Feedback ({feedback.length})
          </h4>
          <div className="divide-y divide-slate-100">
            {feedback.map((fb) => (
              <FeedbackRow key={fb.id} fb={fb} showFollowups={followupsEnabled} />
            ))}
          </div>
          {feedback.length === 0 && (
            <p className="text-sm text-slate-500 italic py-2">No feedback yet</p>
          )}
        </div>

        {mode === 'social' && (
          <DiscoverySocialThread
            workshopId={workshopId}
            trace={trace}
            currentUserId={currentUserId}
          />
        )}
      </CardContent>
    </Card>
  );
};
