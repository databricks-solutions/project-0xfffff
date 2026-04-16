import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { ChevronDown, ChevronRight, AlertTriangle, ArrowUpRight, Sparkles, ThumbsUp, ThumbsDown, Send, Trash2, MessageSquare, MoreHorizontal, CornerDownRight } from 'lucide-react';
import { MilestoneView } from '@/components/MilestoneView';
import type { Trace } from '@/client';
import type { DiscoveryFeedbackWithUser } from '@/client';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import {
  useCreateDiscoveryComment,
  useDeleteDiscoveryComment,
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
  canModerateComments?: boolean;
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
  canModerateComments,
}: {
  workshopId: string;
  trace: Trace;
  currentUserId: string;
  canModerateComments: boolean;
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
  const deleteComment = useDeleteDiscoveryComment(workshopId);
  const { data: activeRun } = useDiscoveryAgentRun(workshopId, activeRunId);
  const pendingCommentOpsRef = useRef(0);

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
      if (pendingCommentOpsRef.current > 0) return;
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
    // Keep a local copy to allow instant optimistic vote/delete updates.
    if (streamedComments === null) {
      setStreamedComments(comments);
    }
  }, [comments, streamedComments]);

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

  const applyOptimisticVote = (commentId: string, value: 1 | -1): DiscoveryCommentData[] => {
    const previous = (streamedComments ?? comments).slice();
    const next = previous.map((comment) => {
      if (comment.id !== commentId) return comment;
      const prior = comment.viewer_vote;
      const nextVote = prior === value ? 0 : value;
      const upvotes = comment.upvotes - (prior === 1 ? 1 : 0) + (nextVote === 1 ? 1 : 0);
      const downvotes = comment.downvotes - (prior === -1 ? 1 : 0) + (nextVote === -1 ? 1 : 0);
      return {
        ...comment,
        viewer_vote: nextVote,
        upvotes,
        downvotes,
        score: upvotes - downvotes,
      };
    });
    setStreamedComments(next);
    return previous;
  };

  const removeCommentTree = (allComments: DiscoveryCommentData[], rootId: string): DiscoveryCommentData[] => {
    const removed = new Set<string>([rootId]);
    let changed = true;
    while (changed) {
      changed = false;
      for (const c of allComments) {
        if (c.parent_comment_id && removed.has(c.parent_comment_id) && !removed.has(c.id)) {
          removed.add(c.id);
          changed = true;
        }
      }
    }
    return allComments.filter((c) => !removed.has(c.id));
  };

  const deleteCommentOptimistically = async (commentId: string) => {
    const previous = (streamedComments ?? comments).slice();
    setStreamedComments(removeCommentTree(previous, commentId));
    pendingCommentOpsRef.current += 1;
    try {
      await deleteComment.mutateAsync({
        commentId,
        traceId: trace.id,
        userId: currentUserId,
        milestoneRef,
      });
      void refetch();
    } catch {
      setStreamedComments(previous);
    } finally {
      pendingCommentOpsRef.current = Math.max(0, pendingCommentOpsRef.current - 1);
    }
  };

  return (
    <div className="mt-6 rounded-xl border border-slate-200 bg-white shadow-sm overflow-hidden">
      <div className="bg-slate-50 border-b border-slate-200 px-4 py-3 flex flex-wrap items-center gap-3">
        <div className="flex items-center gap-1.5 p-1 rounded-lg bg-slate-200/50">
          <button
            type="button"
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              threadScope === 'trace'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
            onClick={() => setThreadScope('trace')}
          >
            Trace Discussion
          </button>
          <button
            type="button"
            className={`px-3 py-1.5 rounded-md text-xs font-medium transition-all ${
              threadScope === 'milestone'
                ? 'bg-white text-slate-900 shadow-sm'
                : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
            }`}
            onClick={() => setThreadScope('milestone')}
          >
            Milestone Focus
          </button>
        </div>
        
        {threadScope === 'milestone' && (
          <div className="relative">
            <select
              value={selectedMilestone}
              onChange={(e) => setSelectedMilestone(e.target.value)}
              className="appearance-none h-8 rounded-md border border-slate-300 bg-white pl-3 pr-8 text-xs font-medium text-slate-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500 transition-shadow"
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
            <ChevronDown className="absolute right-2.5 top-1/2 -translate-y-1/2 h-3.5 w-3.5 text-slate-500 pointer-events-none" />
          </div>
        )}
      </div>

      <div className="px-4 pb-4">

      <div className="mt-4 space-y-3 max-h-96 overflow-y-auto pr-2 custom-scrollbar">
        {orderedComments.length === 0 && (
          <div className="py-8 text-center text-slate-400">
            <MessageSquare className="mx-auto h-8 w-8 mb-2 opacity-50" />
            <p className="text-sm">No comments yet. Start the discussion.</p>
          </div>
        )}
        {orderedComments.map((comment) => (
          <div
            key={comment.id}
            className="relative group transition-all duration-200"
            style={{ marginLeft: `${Math.min(comment.depth, 3) * 24}px` }}
          >
            {/* Thread connection line */}
            {comment.depth > 0 && (
              <div className="absolute -left-6 top-0 bottom-0 w-px bg-slate-200" />
            )}
            
            <div className="rounded-lg border border-slate-200 bg-white p-3 shadow-sm hover:shadow-md transition-shadow">
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-2">
                  <Avatar className="h-8 w-8 border border-slate-100">
                    <AvatarFallback className="bg-indigo-50 text-indigo-700 text-xs font-semibold">
                      {comment.user_name.substring(0, 2).toUpperCase()}
                    </AvatarFallback>
                  </Avatar>
                  <div className="flex flex-col">
                    <div className="flex items-center gap-2">
                      <span className="text-sm font-semibold text-slate-900">{comment.user_name}</span>
                      {comment.author_type === 'agent' && (
                        <Badge variant="secondary" className="bg-indigo-100 text-indigo-800 hover:bg-indigo-200 text-[10px] px-1.5 py-0 h-4">
                          <Sparkles className="w-2.5 h-2.5 mr-1" />
                          AGENT
                        </Badge>
                      )}
                    </div>
                    <span className="text-[11px] text-slate-500">Just now</span>
                  </div>
                </div>
                
                <div className="flex items-center gap-1">
                  {canModerateComments && (
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      className="h-7 w-7 text-slate-400 hover:text-red-600 hover:bg-red-50"
                      onClick={() => {
                        if (!window.confirm('Delete this comment and all replies?')) return;
                        void deleteCommentOptimistically(comment.id);
                      }}
                      title="Delete comment"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </Button>
                  )}
                </div>
              </div>
              
              <div className="mt-2 pl-10">
                <p className="whitespace-pre-wrap text-sm text-slate-800 leading-relaxed">{comment.body}</p>
                
                <div className="mt-3 flex items-center gap-4">
                  <div className="flex items-center rounded-full bg-slate-50 border border-slate-200 p-0.5">
                    <button
                      type="button"
                      className={`flex items-center justify-center h-6 px-2 rounded-full text-xs font-medium transition-colors ${
                        comment.viewer_vote === 1 
                          ? 'bg-indigo-100 text-indigo-700' 
                          : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                      }`}
                      onClick={() => {
                        pendingCommentOpsRef.current += 1;
                        const previous = applyOptimisticVote(comment.id, 1);
                        voteComment.mutate(
                          { commentId: comment.id, traceId: trace.id, userId: currentUserId, value: 1, milestoneRef },
                          {
                            onError: () => {
                              setStreamedComments(previous);
                            },
                            onSettled: () => {
                              pendingCommentOpsRef.current = Math.max(0, pendingCommentOpsRef.current - 1);
                            },
                          },
                        );
                      }}
                    >
                      <ThumbsUp className="mr-1.5 h-3 w-3" /> 
                      {comment.upvotes > 0 ? comment.upvotes : ''}
                    </button>
                    <div className="w-px h-3 bg-slate-300 mx-0.5" />
                    <button
                      type="button"
                      className={`flex items-center justify-center h-6 px-2 rounded-full text-xs font-medium transition-colors ${
                        comment.viewer_vote === -1 
                          ? 'bg-red-100 text-red-700' 
                          : 'text-slate-500 hover:bg-slate-200 hover:text-slate-700'
                      }`}
                      onClick={() => {
                        pendingCommentOpsRef.current += 1;
                        const previous = applyOptimisticVote(comment.id, -1);
                        voteComment.mutate(
                          { commentId: comment.id, traceId: trace.id, userId: currentUserId, value: -1, milestoneRef },
                          {
                            onError: () => {
                              setStreamedComments(previous);
                            },
                            onSettled: () => {
                              pendingCommentOpsRef.current = Math.max(0, pendingCommentOpsRef.current - 1);
                            },
                          },
                        );
                      }}
                    >
                      <ThumbsDown className="mr-1.5 h-3 w-3" />
                      {comment.downvotes > 0 ? comment.downvotes : ''}
                    </button>
                  </div>
                  
                  <button
                    type="button"
                    className="flex items-center text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors"
                    onClick={() => setReplyToId(comment.id)}
                  >
                    <CornerDownRight className="mr-1.5 h-3.5 w-3.5" />
                    Reply
                  </button>
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {streamStatus === 'running' && (
        <div className="mt-4 rounded-lg border border-indigo-100 bg-indigo-50/50 p-4 shadow-sm animate-in fade-in slide-in-from-bottom-2">
          <div className="flex items-center gap-2 mb-2">
            <Sparkles className="w-4 h-4 text-indigo-600 animate-pulse" />
            <p className="text-xs font-semibold uppercase tracking-wider text-indigo-700">
              Agent Analyzing {activeRun ? `(${activeRun.tool_calls_count} tools)` : ''}
            </p>
          </div>
          <p className="text-sm text-indigo-900 leading-relaxed font-medium">{streamedAgentText || 'Streaming response...'}</p>
        </div>
      )}

      <div className="mt-4 pt-4 border-t border-slate-100 relative">
        {replyToId && (
          <div className="absolute -top-3 left-4 flex items-center justify-between rounded-full border border-indigo-100 bg-indigo-50 px-3 py-1 text-[11px] font-medium text-indigo-700 shadow-sm">
            <span className="flex items-center gap-1.5">
              <CornerDownRight className="w-3 h-3" />
              Replying to comment
            </span>
            <button type="button" onClick={() => setReplyToId(null)} className="ml-3 text-indigo-400 hover:text-indigo-800 transition-colors">
              Cancel
            </button>
          </div>
        )}
        <div className="relative group">
          <textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            placeholder="Comment on this trace. Use @assistant to summarize or @agent to investigate..."
            className="min-h-[100px] w-full resize-none rounded-xl border border-slate-200 bg-slate-50/50 px-4 py-3 text-sm text-slate-900 placeholder:text-slate-400 focus:border-indigo-500 focus:bg-white focus:outline-none focus:ring-4 focus:ring-indigo-500/10 transition-all"
            onKeyDown={(e) => {
              if (e.key === 'Enter' && (e.metaKey || e.ctrlKey)) {
                e.preventDefault();
                void submitComment();
              }
            }}
          />
          <div className="absolute bottom-3 right-3 flex items-center gap-2">
            <span className="text-[10px] text-slate-400 font-medium hidden sm:inline-block pointer-events-none">
              Cmd ↵ to send
            </span>
            <Button 
              onClick={() => { void submitComment(); }} 
              disabled={createComment.isPending || !body.trim()}
              className="h-8 rounded-lg bg-indigo-600 hover:bg-indigo-700 text-white shadow-sm transition-all shadow-indigo-600/20 px-3"
            >
              <Send className="mr-1.5 h-3.5 w-3.5" />
              Post
            </Button>
          </div>
        </div>
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
    <div className="py-4 border-b border-slate-100 last:border-0 transition-colors hover:bg-slate-50/50 px-2 -mx-2 rounded-lg">
      <div className="flex items-start gap-3">
        <Avatar className="h-8 w-8 border border-slate-100 mt-0.5">
          <AvatarFallback className="bg-slate-100 text-slate-600 text-xs font-semibold">
            {fb.user_name.substring(0, 2).toUpperCase()}
          </AvatarFallback>
        </Avatar>
        <div className="flex-1 min-w-0">
          <div className="flex items-center justify-between gap-2 mb-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold text-slate-900">{fb.user_name}</span>
              <span className="text-[11px] text-slate-500">Participant</span>
            </div>
            <Badge
              variant="outline"
              className={
                fb.feedback_label === 'good'
                  ? 'bg-emerald-50 text-emerald-700 border-emerald-200/60 font-semibold px-2 py-0 h-5 text-[10px]'
                  : 'bg-rose-50 text-rose-700 border-rose-200/60 font-semibold px-2 py-0 h-5 text-[10px]'
              }
            >
              {fb.feedback_label.toUpperCase()}
            </Badge>
          </div>
          <p className="text-sm text-slate-700 leading-relaxed bg-white border border-slate-100 rounded-lg p-3 shadow-sm">{fb.comment}</p>
          
          {showFollowups && qnaCount > 0 && (
            <div className="mt-3">
              <button
                type="button"
                className="flex items-center gap-1.5 text-xs font-medium text-slate-500 hover:text-indigo-600 transition-colors bg-slate-100/50 hover:bg-indigo-50 px-2 py-1 rounded-md"
                onClick={() => setQnaOpen(!qnaOpen)}
              >
                {qnaOpen ? <ChevronDown className="w-3.5 h-3.5" /> : <ChevronRight className="w-3.5 h-3.5" />}
                {qnaCount} Follow-up Q&A{qnaCount !== 1 ? 's' : ''}
              </button>
            </div>
          )}
          
          {showFollowups && qnaOpen && fb.followup_qna && (
            <div className="mt-3 pl-4 border-l-[3px] border-indigo-100 space-y-3 animate-in fade-in slide-in-from-top-1">
              {fb.followup_qna.map((pair, i) => (
                <div key={i} className="text-sm bg-white border border-slate-100 rounded-lg p-3 shadow-sm">
                  <div className="flex gap-2 mb-2">
                    <span className="font-bold text-indigo-600 shrink-0">Q:</span>
                    <span className="text-slate-800 font-medium">{pair.question}</span>
                  </div>
                  <div className="flex gap-2">
                    <span className="font-bold text-emerald-600 shrink-0">A:</span>
                    <span className="text-slate-700">{pair.answer}</span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

export const DiscoveryTraceCard: React.FC<DiscoveryTraceCardProps> = ({
  workshopId = '',
  currentUserId = '',
  canModerateComments = false,
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
    <Card id={`discovery-trace-${trace.id}`} className="overflow-hidden border-slate-200 shadow-sm hover:shadow-md transition-all duration-300 bg-white/50 backdrop-blur-sm">
      <CardHeader className="bg-slate-50/80 border-b border-slate-100 px-5 py-4 flex flex-row items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-8 w-8 rounded-lg bg-indigo-100 text-indigo-700 flex items-center justify-center font-bold text-sm shadow-sm">
            T{trace.id.substring(0, 3).toUpperCase()}
          </div>
          <div>
            <CardTitle className="text-base font-semibold text-slate-900">Discovery Trace</CardTitle>
            <p className="text-xs text-slate-500 font-medium">{new Date(trace.created_at || Date.now()).toLocaleDateString()} • {trace.id.substring(0, 8)}</p>
          </div>
        </div>
        
        {hasSummary && (
          <div className="flex items-center gap-1 bg-slate-200/50 p-1 rounded-lg">
            <button
              type="button"
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                showSummary
                  ? 'bg-white text-indigo-700 shadow-sm ring-1 ring-slate-200/50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
              onClick={() => setShowSummary(true)}
            >
              <Sparkles className="w-3.5 h-3.5 inline mr-1.5" />
              Summary
            </button>
            <button
              type="button"
              className={`px-3 py-1.5 rounded-md text-xs font-semibold transition-all ${
                !showSummary
                  ? 'bg-white text-slate-900 shadow-sm ring-1 ring-slate-200/50'
                  : 'text-slate-600 hover:text-slate-900 hover:bg-slate-200/50'
              }`}
              onClick={() => setShowSummary(false)}
            >
              Raw Data
            </button>
          </div>
        )}
      </CardHeader>
      
      <CardContent className="p-6">
        {/* Summary view */}
        {showSummary && hasSummary ? (
          <div className="mb-6 bg-white rounded-xl border border-slate-100 shadow-sm p-1">
            <MilestoneView
              executiveSummary={trace.summary!.executive_summary}
              milestones={trace.summary!.milestones}
              showPaths={false}
              anchorPrefix={`discovery-trace-${trace.id}`}
            />
          </div>
        ) : (
          /* Raw user/assistant content */
          <div className="mb-6 space-y-4">
            <div className="rounded-xl bg-slate-50 border border-slate-100 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-6 w-6 rounded-full bg-slate-200 flex items-center justify-center text-[10px] font-bold text-slate-600">U</div>
                <span className="text-xs font-bold uppercase tracking-wider text-slate-600">User Input</span>
              </div>
              <p className="text-sm text-slate-800 leading-relaxed pl-8">{inputText}</p>
            </div>
            <div className="rounded-xl bg-indigo-50/50 border border-indigo-100/50 p-5 shadow-sm">
              <div className="flex items-center gap-2 mb-2">
                <div className="h-6 w-6 rounded-full bg-indigo-200 flex items-center justify-center text-[10px] font-bold text-indigo-700">A</div>
                <span className="text-xs font-bold uppercase tracking-wider text-indigo-700">Assistant Response</span>
              </div>
              <p className="text-sm text-slate-800 leading-relaxed pl-8">
                {contentExpanded || outputText.length <= truncateAt
                  ? outputText
                  : outputText.slice(0, truncateAt) + '...'}
              </p>
              {outputText.length > truncateAt && (
                <div className="pl-8 mt-2">
                  <button
                    type="button"
                    className="text-xs font-semibold text-indigo-600 hover:text-indigo-800 transition-colors bg-indigo-100/50 hover:bg-indigo-100 px-2 py-1 rounded"
                    onClick={() => setContentExpanded(!contentExpanded)}
                  >
                    {contentExpanded ? 'Show less' : 'Read full response'}
                  </button>
                </div>
              )}
            </div>
          </div>
        )}

        {/* Analysis findings — pinned above feedback */}
        {mode === 'analysis' && hasAnalysis && (
          <div className="mb-8">
            <div className="flex items-center justify-between mb-3">
              <button
                type="button"
                className="flex items-center gap-2 text-sm font-bold text-slate-800 hover:text-indigo-600 transition-colors"
                onClick={() => setFindingsOpen(!findingsOpen)}
              >
                <div className="h-6 w-6 rounded bg-slate-100 flex items-center justify-center text-slate-500">
                  {findingsOpen ? <ChevronDown className="w-4 h-4" /> : <ChevronRight className="w-4 h-4" />}
                </div>
                AI Analysis Findings
              </button>
              <Badge variant="secondary" className="bg-indigo-50 text-indigo-700 hover:bg-indigo-100 font-semibold">
                {(disagreements?.length || 0) + (findings?.length || 0)} Items
              </Badge>
            </div>
            
            {findingsOpen && (
              <div className="space-y-3 pl-2 border-l-2 border-slate-100 ml-3">
                {disagreements?.map((d, i) => {
                  const key = `disagreement-${trace.id}-${i}`;
                  return (
                    <div key={key} className={`group relative rounded-xl border border-rose-200 bg-rose-50/50 p-4 shadow-sm transition-all hover:shadow-md hover:bg-rose-50 ${promotedKeys.has(key) ? ' promoted-collapsing opacity-50' : ''}`}>
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex items-center gap-2">
                          <div className="h-6 w-6 rounded-full bg-rose-200 flex items-center justify-center">
                            <AlertTriangle className="w-3.5 h-3.5 text-rose-700" />
                          </div>
                          <span className="text-xs font-bold uppercase tracking-wider text-rose-800">High Disagreement</span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className="h-7 text-[10px] font-semibold uppercase tracking-wider bg-white border-rose-200 text-rose-700 hover:bg-rose-100 hover:text-rose-800 transition-colors shadow-sm"
                          disabled={promotedKeys.has(key)}
                          onClick={() => onPromote({ key, text: d.summary, source_type: 'disagreement', source_trace_ids: [d.trace_id] })}
                        >
                          <ArrowUpRight className="w-3 h-3 mr-1" />
                          {promotedKeys.has(key) ? 'Added' : 'Draft'}
                        </Button>
                      </div>
                      <div className="text-sm text-slate-900 font-medium leading-relaxed pl-8">
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
                                className="text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-800 hover:decoration-indigo-500 transition-colors font-semibold"
                              >
                                {children}
                              </a>
                            ),
                          }}
                        >
                          {linkifyOriginRefs(d.summary)}
                        </ReactMarkdown>
                      </div>
                      <div className="pl-8 mt-3 space-y-3">
                        <p className="text-xs font-medium text-rose-800 bg-rose-100/50 inline-block px-2 py-1 rounded">Theme: {d.underlying_theme}</p>
                        {d.followup_questions?.length > 0 && (
                          <div className="bg-white rounded-lg border border-rose-100 p-3 shadow-sm">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-slate-500 mb-1.5 block">Follow-up Questions</span>
                            <ul className="space-y-1.5">
                              {d.followup_questions.map((q, qi) => (
                                <li key={qi} className="text-xs text-slate-700 flex items-start gap-2">
                                  <span className="text-rose-400 mt-0.5">•</span>
                                  <span className="leading-relaxed">{q}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                        {d.facilitator_suggestions?.length > 0 && (
                          <div className="bg-indigo-50/50 rounded-lg border border-indigo-100 p-3 shadow-sm">
                            <span className="text-[10px] font-bold uppercase tracking-wider text-indigo-600 mb-1.5 block">Facilitator Suggestions</span>
                            <ul className="space-y-1.5">
                              {d.facilitator_suggestions.map((s, si) => (
                                <li key={si} className="text-xs text-indigo-900 flex items-start gap-2">
                                  <ArrowUpRight className="w-3 h-3 text-indigo-500 mt-0.5 shrink-0" />
                                  <span className="leading-relaxed font-medium">{s}</span>
                                </li>
                              ))}
                            </ul>
                          </div>
                        )}
                      </div>
                    </div>
                  );
                })}
                {findings?.map((f, i) => {
                  const key = `finding-${trace.id}-${i}`;
                  const isHigh = f.priority === 'high';
                  const priorityColor = isHigh 
                    ? 'border-amber-200 bg-amber-50/50 hover:bg-amber-50' 
                    : 'border-blue-200 bg-blue-50/50 hover:bg-blue-50';
                  const iconColor = isHigh ? 'text-amber-600 bg-amber-200' : 'text-blue-600 bg-blue-200';
                  const textColor = isHigh ? 'text-amber-800' : 'text-blue-800';
                  
                  return (
                    <div key={key} className={`group relative rounded-xl border ${priorityColor} p-4 shadow-sm transition-all hover:shadow-md ${promotedKeys.has(key) ? ' promoted-collapsing opacity-50' : ''}`}>
                      <div className="flex items-start justify-between gap-4 mb-2">
                        <div className="flex items-center gap-2">
                          <div className={`h-6 w-6 rounded-full flex items-center justify-center ${iconColor}`}>
                            <Sparkles className="w-3 h-3" />
                          </div>
                          <span className={`text-xs font-bold uppercase tracking-wider ${textColor}`}>
                            {isHigh ? 'High Priority Finding' : 'Finding'}
                          </span>
                        </div>
                        <Button
                          variant="outline"
                          size="sm"
                          className={`h-7 text-[10px] font-semibold uppercase tracking-wider bg-white shadow-sm transition-colors ${
                            isHigh 
                              ? 'border-amber-200 text-amber-700 hover:bg-amber-100 hover:text-amber-800' 
                              : 'border-blue-200 text-blue-700 hover:bg-blue-100 hover:text-blue-800'
                          }`}
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
                          {promotedKeys.has(key) ? 'Added' : 'Draft'}
                        </Button>
                      </div>
                      <div className="text-sm text-slate-900 font-medium leading-relaxed pl-8">
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
                                className="text-indigo-600 underline decoration-indigo-300 underline-offset-2 hover:text-indigo-800 hover:decoration-indigo-500 transition-colors font-semibold"
                              >
                                {children}
                              </a>
                            ),
                          }}
                        >
                          {linkifyOriginRefs(f.text)}
                        </ReactMarkdown>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        )}

        {/* Participant feedback */}
        <div className="bg-slate-50/50 rounded-xl border border-slate-200 p-5 shadow-sm">
          <div className="flex items-center justify-between mb-4">
            <h4 className="text-sm font-bold text-slate-800 flex items-center gap-2">
              <MessageSquare className="w-4 h-4 text-slate-500" />
              Participant Feedback
              <Badge variant="secondary" className="bg-white border-slate-200 text-slate-700 font-bold ml-1">
                {feedback.length}
              </Badge>
            </h4>
          </div>
          <div className="divide-y divide-slate-100/80">
            {feedback.map((fb) => (
              <FeedbackRow key={fb.id} fb={fb} showFollowups={followupsEnabled} />
            ))}
          </div>
          {feedback.length === 0 && (
            <div className="text-center py-8 bg-white rounded-lg border border-slate-100 border-dashed">
              <p className="text-sm text-slate-400 font-medium">No feedback collected yet</p>
            </div>
          )}
        </div>

        {mode === 'social' && (
          <DiscoverySocialThread
            workshopId={workshopId}
            trace={trace}
            currentUserId={currentUserId}
            canModerateComments={canModerateComments}
          />
        )}
      </CardContent>
    </Card>
  );
};
