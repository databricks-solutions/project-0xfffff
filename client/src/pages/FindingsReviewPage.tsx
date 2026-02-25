/**
 * FindingsReviewPage Component
 *
 * Dedicated page for facilitators to review all discovery feedback in a summary format.
 * Shows feedback organized by trace with filtering capabilities.
 */

import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { FileText, Users, Search, Filter, Eye, ArrowLeft, ChevronDown, ChevronRight } from 'lucide-react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useUser, useRoleCheck } from '@/context/UserContext';
import { useAllTraces } from '@/hooks/useWorkshopApi';
import type { DiscoveryFeedbackWithUser } from '@/client';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { toast } from 'sonner';
import { DiscoveryAnalysisTab } from '@/components/DiscoveryAnalysisTab';

interface FindingsReviewPageProps {
  onBack?: () => void;
}

/** Render a feedback_label badge with appropriate colour. */
function FeedbackLabelBadge({ label }: { label: string }) {
  if (label === 'good') {
    return <Badge className="bg-green-100 text-green-800 border-green-300">GOOD</Badge>;
  }
  return <Badge className="bg-red-100 text-red-800 border-red-300">BAD</Badge>;
}

/** Collapsible follow-up Q&A pairs. */
function FollowUpQnA({ pairs }: { pairs: Array<Record<string, string>> }) {
  const [open, setOpen] = useState(false);

  if (!pairs || pairs.length === 0) return null;

  return (
    <div className="mt-2">
      <button
        type="button"
        className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-700"
        onClick={() => setOpen(!open)}
      >
        {open ? <ChevronDown className="w-3 h-3" /> : <ChevronRight className="w-3 h-3" />}
        {pairs.length} follow-up Q&A{pairs.length !== 1 ? 's' : ''}
      </button>
      {open && (
        <div className="mt-1 space-y-1 pl-4 border-l border-slate-200">
          {pairs.map((pair, i) => (
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

export const FindingsReviewPage: React.FC<FindingsReviewPageProps> = ({ onBack }) => {
  const { workshopId } = useWorkshopContext();
  const { user } = useUser();
  const { isFacilitator } = useRoleCheck();
  const queryClient = useQueryClient();
  const [searchFilter, setSearchFilter] = useState('');
  const [userFilter, setUserFilter] = useState<string>('all');
  const [selectedTraceId, setSelectedTraceId] = useState<string | null>(null);

  // Get all workshop data with user details
  const { data: allFeedbackWithUsers } = useQuery<DiscoveryFeedbackWithUser[]>({
    queryKey: ['facilitator-feedback-with-users', workshopId],
    queryFn: async () => {
      const response = await fetch(`/workshops/${workshopId}/discovery-feedback-with-users`);
      if (!response.ok) throw new Error('Failed to fetch feedback');
      return response.json();
    },
    enabled: !!workshopId,
  });

  // Use all traces for facilitator review (no personalized ordering needed)
  const { data: traces } = useAllTraces(workshopId!);

  // Get discovery completion status
  const { data: completionStatus, refetch: refetchCompletionStatus } = useQuery({
    queryKey: ['discovery-completion-status', workshopId],
    queryFn: async () => {
      const response = await fetch(`/workshops/${workshopId}/discovery-completion-status`);
      if (!response.ok) throw new Error('Failed to fetch completion status');
      return response.json();
    },
    enabled: !!workshopId,
  });

  // Process feedback data
  const feedbackByTrace = React.useMemo(() => {
    if (!allFeedbackWithUsers || !traces) return new Map<string, DiscoveryFeedbackWithUser[]>();

    const map = new Map<string, DiscoveryFeedbackWithUser[]>();
    allFeedbackWithUsers.forEach(fb => {
      if (!map.has(fb.trace_id)) {
        map.set(fb.trace_id, []);
      }
      map.get(fb.trace_id)!.push(fb);
    });
    return map;
  }, [allFeedbackWithUsers, traces]);

  // Get unique users
  const uniqueUsers = React.useMemo(() => {
    if (!allFeedbackWithUsers) return [];
    return Array.from(new Set(allFeedbackWithUsers.map(f => f.user_id)));
  }, [allFeedbackWithUsers]);

  // Filter feedback
  const filteredFeedback = React.useMemo(() => {
    if (!allFeedbackWithUsers) return [];

    let filtered = allFeedbackWithUsers;

    // Filter by user if specified
    if (userFilter !== 'all') {
      filtered = filtered.filter(f => f.user_id === userFilter);
    }

    // Filter by search text
    if (searchFilter) {
      filtered = filtered.filter(f =>
        f.comment.toLowerCase().includes(searchFilter.toLowerCase()) ||
        f.user_name.toLowerCase().includes(searchFilter.toLowerCase()) ||
        f.user_email.toLowerCase().includes(searchFilter.toLowerCase())
      );
    }

    return filtered;
  }, [allFeedbackWithUsers, userFilter, searchFilter]);

  // Get trace for selected finding details
  const getTraceById = (traceId: string) => {
    return traces?.find((t: { id: string }) => t.id === traceId);
  };

  const formatUserId = (userId: string) => {
    if (userId.startsWith('demo_')) {
      return userId.replace('_', ' ').toUpperCase();
    }
    return userId;
  };

  // Redirect non-facilitators
  if (!isFacilitator) {
    return (
      <div className="p-8 flex items-center justify-center h-full">
        <div className="text-center">
          <FileText className="h-12 w-12 text-amber-500 mx-auto mb-4" />
          <div className="text-lg font-medium text-slate-900 mb-2">
            Facilitator Access Required
          </div>
          <div className="text-sm text-slate-600">
            This findings review is only available to workshop facilitators
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="p-6 h-full overflow-auto">
      <div className="max-w-6xl mx-auto space-y-6">
        {/* Header */}
        <div className="flex items-center gap-4 mb-6">
          {onBack && (
            <Button variant="outline" size="sm" onClick={onBack}>
              <ArrowLeft className="w-4 h-4 mr-2" />
              Back to Dashboard
            </Button>
          )}
          <div className="flex items-center gap-3">
            <div className="w-12 h-12 bg-gradient-to-br from-emerald-500 to-green-600 rounded-full flex items-center justify-center">
              <FileText className="w-6 h-6 text-white" />
            </div>
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Discovery Findings Review</h1>
              <p className="text-slate-600">
                Review all participant insights and discoveries from the workshop
              </p>
            </div>
          </div>
        </div>

        {/* Summary Stats */}
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <FileText className="w-5 h-5 text-emerald-600" />
                <div>
                  <div className="text-2xl font-bold text-slate-900">{allFeedbackWithUsers?.length || 0}</div>
                  <div className="text-sm text-slate-600">Total Findings</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Users className="w-5 h-5 text-blue-600" />
                <div>
                  <div className="text-2xl font-bold text-slate-900">{uniqueUsers.length}</div>
                  <div className="text-sm text-slate-600">Active Users</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-purple-600" />
                <div>
                  <div className="text-2xl font-bold text-slate-900">{feedbackByTrace.size}</div>
                  <div className="text-sm text-slate-600">Traces Reviewed</div>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-2">
                <Filter className="w-5 h-5 text-orange-600" />
                <div>
                  <div className="text-2xl font-bold text-slate-900">{filteredFeedback.length}</div>
                  <div className="text-sm text-slate-600">Filtered Results</div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Discovery Completion Status */}
        {completionStatus && (
          <Card className="border-blue-200 bg-blue-50">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-blue-900">
                <Users className="w-5 h-5" />
                Discovery Completion Status
              </CardTitle>
              <CardDescription className="text-blue-700">
                Track participant progress and manage phase progression
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {/* Progress Summary */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-4">
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-900">
                        {completionStatus.completed_participants}/{completionStatus.total_participants}
                      </div>
                      <div className="text-sm text-blue-700">Participants Complete</div>
                    </div>
                    <div className="text-center">
                      <div className="text-2xl font-bold text-blue-900">
                        {Math.round(completionStatus.completion_percentage)}%
                      </div>
                      <div className="text-sm text-blue-700">Completion Rate</div>
                    </div>
                  </div>

                  {/* Progress Bar */}
                  <div className="flex-1 max-w-md">
                    <div className="w-full bg-blue-200 rounded-full h-3">
                      <div
                        className="bg-blue-600 h-3 rounded-full transition-all duration-300"
                        style={{ width: `${completionStatus.completion_percentage}%` }}
                      />
                    </div>
                  </div>
                </div>

                {/* Participant Status */}
                <div className="grid grid-cols-1 md:grid-cols-2 gap-2">
                  {Object.values(completionStatus.participant_status).map((status: any) => (
                    <div key={status.user_id} className="flex items-center justify-between p-2 bg-white rounded border">
                      <div className="flex items-center gap-2">
                        <div className={`w-3 h-3 rounded-full ${status.completed ? 'bg-green-500' : 'bg-gray-300'}`} />
                        <div className="flex flex-col">
                          <span className="text-sm font-medium">{status.user_name}</span>
                          <span className="text-xs text-gray-500">{status.user_email}</span>
                        </div>
                        <Badge variant="outline" className="text-xs">
                          {status.role}
                        </Badge>
                      </div>
                      <Badge className={status.completed ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                        {status.completed ? 'Complete' : 'In Progress'}
                      </Badge>
                    </div>
                  ))}
                </div>

                {/* Facilitator Actions */}
                <div className="flex items-center justify-between pt-4 border-t border-blue-200">
                  <div className="text-sm text-blue-700">
                    {completionStatus.all_completed ? (
                      <span className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-green-500 rounded-full" />
                        All participants have completed discovery
                      </span>
                    ) : (
                      <span className="flex items-center gap-2">
                        <div className="w-2 h-2 bg-yellow-500 rounded-full" />
                        Waiting for {completionStatus.total_participants - completionStatus.completed_participants} participants to complete
                      </span>
                    )}
                  </div>

                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => refetchCompletionStatus()}
                    >
                      Refresh Status
                    </Button>

                    {completionStatus.all_completed && (
                      <Button
                        size="sm"
                        className="bg-green-600 hover:bg-green-700"
                        onClick={async () => {
                          if (!confirm('Are you sure you want to move to Rubric Creation? This will complete the discovery phase.')) {
                            return;
                          }

                          try {


                            // Check workshop state first
                            const workshopResponse = await fetch(`/workshops/${workshopId}`);
                            if (!workshopResponse.ok) {
                              throw new Error(`Failed to fetch workshop: ${workshopResponse.statusText}`);
                            }
                            const workshop = await workshopResponse.json();


                            if (workshop.current_phase !== 'discovery') {
                              throw new Error(`Cannot advance to rubric: workshop is in ${workshop.current_phase} phase, not discovery phase`);
                            }

                            // Check if there are any feedback entries
                            if (!allFeedbackWithUsers || allFeedbackWithUsers.length === 0) {
                              throw new Error('Cannot advance to rubric: No discovery feedback submitted yet');
                            }


                            // First, mark discovery phase as complete
                            const completeResponse = await fetch(`/workshops/${workshopId}/complete-phase/discovery`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json'
                              }
                            });



                            if (!completeResponse.ok) {
                              const errorData = await completeResponse.json().catch(() => ({}));
                              throw new Error(`Failed to complete discovery phase: ${errorData.detail || completeResponse.statusText}`);
                            }



                            // Then, advance to rubric phase
                            const advanceResponse = await fetch(`/workshops/${workshopId}/advance-to-rubric`, {
                              method: 'POST',
                              headers: {
                                'Content-Type': 'application/json'
                              }
                            });



                            if (!advanceResponse.ok) {
                              const errorData = await advanceResponse.json().catch(() => ({}));
                              throw new Error(`Failed to advance to rubric phase: ${errorData.detail || advanceResponse.statusText}`);
                            }

                            toast.success('Discovery phase completed! Moving to Rubric Creation.');

                            // Invalidate queries to refresh the UI
                            queryClient.invalidateQueries({ queryKey: ['workshop', workshopId] });
                            queryClient.invalidateQueries({ queryKey: ['discovery-completion-status', workshopId] });

                            // Navigate to rubric creation
                            if (onBack) {
                              onBack(); // Go back to dashboard
                            }
                          } catch (error) {

                            const errorMessage = error instanceof Error ? error.message : 'Failed to complete discovery phase. Please try again.';
                            toast.error(errorMessage);
                          }
                        }}
                      >
                        Move to Rubric Creation
                      </Button>
                    )}
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card>
          <CardHeader className="pb-4">
            <CardTitle className="flex items-center gap-2">
              <Search className="w-5 h-5" />
              Search & Filter Findings
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="flex gap-4">
              <div className="flex-1">
                <Input
                  placeholder="Search findings by content or user..."
                  value={searchFilter}
                  onChange={(e) => setSearchFilter(e.target.value)}
                  className="w-full"
                />
              </div>
              <Select value={userFilter} onValueChange={setUserFilter}>
                <SelectTrigger className="w-48">
                  <SelectValue placeholder="Filter by user" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All Users</SelectItem>
                  {uniqueUsers.map(userId => {
                    const u = allFeedbackWithUsers?.find(f => f.user_id === userId);
                    return (
                      <SelectItem key={userId} value={userId}>
                        {u ? `${u.user_name} (${u.user_email})` : formatUserId(userId)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Main Content */}
        <Tabs defaultValue="by-finding" className="space-y-4">
          <TabsList>
            <TabsTrigger value="by-finding">All Findings</TabsTrigger>
            <TabsTrigger value="by-trace">By Trace</TabsTrigger>
            <TabsTrigger value="by-user">By User</TabsTrigger>
            <TabsTrigger value="analysis">Analysis</TabsTrigger>
          </TabsList>

          {/* All Findings View */}
          <TabsContent value="by-finding">
            <Card>
              <CardHeader>
                <CardTitle>All Findings ({filteredFeedback.length})</CardTitle>
                <CardDescription>
                  Chronological list of all discovery findings
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {filteredFeedback.length > 0 ? (
                    filteredFeedback.map((fb) => {
                      const trace = getTraceById(fb.trace_id);
                      return (
                        <div key={fb.id} className="border rounded-lg p-4 bg-slate-50">
                          <div className="flex items-start justify-between mb-3">
                            <div className="flex items-center gap-3">
                              <FeedbackLabelBadge label={fb.feedback_label} />
                              <div className="flex flex-col">
                                <Badge variant="outline" className="text-xs">
                                  {fb.user_name}
                                </Badge>
                                <span className="text-xs text-slate-500">
                                  {fb.user_email}
                                </span>
                              </div>
                              <span className="text-xs text-slate-500">
                                Trace: {trace?.id?.slice(0, 8) || 'Unknown'}...
                              </span>
                            </div>
                            <span className="text-xs text-slate-400">
                              {new Date(fb.created_at).toLocaleString()}
                            </span>
                          </div>
                          <div className="prose prose-sm max-w-none">
                            <div className="whitespace-pre-wrap text-slate-700">
                              {fb.comment}
                            </div>
                          </div>
                          <FollowUpQnA pairs={fb.followup_qna ?? []} />
                        </div>
                      );
                    })
                  ) : (
                    <div className="text-center py-8 text-slate-500">
                      <FileText className="w-12 h-12 mx-auto mb-4 opacity-50" />
                      <p>No findings match your current filters</p>
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* By Trace View */}
          <TabsContent value="by-trace">
            <Card>
              <CardHeader>
                <CardTitle>Findings Organized by Trace</CardTitle>
                <CardDescription>
                  See all findings grouped by the traces they analyze
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {Array.from(feedbackByTrace.entries()).map(([traceId, traceFeedback]) => {
                    const trace = getTraceById(traceId);
                    const filteredTraceFeedback = traceFeedback.filter(f =>
                      filteredFeedback.some(ff => ff.id === f.id)
                    );

                    if (filteredTraceFeedback.length === 0) return null;

                    return (
                      <div key={traceId} className="border rounded-lg p-4">
                        <div className="mb-4">
                          <h3 className="font-semibold text-slate-900 mb-2">
                            Trace: {traceId.slice(0, 8)}...
                            <Badge variant="secondary" className="ml-2">
                              {filteredTraceFeedback.length} finding{filteredTraceFeedback.length !== 1 ? 's' : ''}
                            </Badge>
                          </h3>
                          {trace && (
                            <div className="text-xs text-slate-600 mb-3 p-2 bg-slate-100 rounded">
                              <strong>Input:</strong> {trace.input.slice(0, 100)}...
                            </div>
                          )}
                        </div>
                        <div className="space-y-3">
                          {filteredTraceFeedback.map((fb) => (
                            <div key={fb.id} className="pl-4 border-l-2 border-emerald-200 bg-emerald-50 p-3 rounded-r">
                              <div className="flex items-center justify-between mb-2">
                                <div className="flex items-center gap-2">
                                  <FeedbackLabelBadge label={fb.feedback_label} />
                                  <div className="flex flex-col">
                                    <Badge variant="outline" className="text-xs">
                                      {fb.user_name}
                                    </Badge>
                                    <span className="text-xs text-slate-500">
                                      {fb.user_email}
                                    </span>
                                  </div>
                                </div>
                                <span className="text-xs text-slate-400">
                                  {new Date(fb.created_at).toLocaleString()}
                                </span>
                              </div>
                              <div className="whitespace-pre-wrap text-slate-700 text-sm">
                                {fb.comment}
                              </div>
                              <FollowUpQnA pairs={fb.followup_qna ?? []} />
                            </div>
                          ))}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* By User View */}
          <TabsContent value="by-user">
            <Card>
              <CardHeader>
                <CardTitle>Findings Organized by User</CardTitle>
                <CardDescription>
                  See all findings grouped by contributor
                </CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-6">
                  {uniqueUsers.map(userId => {
                    const userFeedback = filteredFeedback.filter(f => f.user_id === userId);
                    if (userFeedback.length === 0) return null;

                    const u = allFeedbackWithUsers?.find(f => f.user_id === userId);

                    return (
                      <div key={userId} className="border rounded-lg p-4">
                        <div className="mb-4">
                          <h3 className="font-semibold text-slate-900 mb-2">
                            {u ? u.user_name : formatUserId(userId)}
                            <Badge variant="secondary" className="ml-2">
                              {userFeedback.length} finding{userFeedback.length !== 1 ? 's' : ''}
                            </Badge>
                          </h3>
                          {u && (
                            <p className="text-sm text-slate-600">{u.user_email}</p>
                          )}
                        </div>
                        <div className="space-y-3">
                          {userFeedback.map((fb) => {
                            const trace = getTraceById(fb.trace_id);
                            return (
                              <div key={fb.id} className="pl-4 border-l-2 border-blue-200 bg-blue-50 p-3 rounded-r">
                                <div className="flex items-center justify-between mb-2">
                                  <div className="flex items-center gap-2">
                                    <FeedbackLabelBadge label={fb.feedback_label} />
                                    <span className="text-xs text-slate-600">
                                      Trace: {trace?.id?.slice(0, 8) || 'Unknown'}...
                                    </span>
                                  </div>
                                  <span className="text-xs text-slate-400">
                                    {new Date(fb.created_at).toLocaleString()}
                                  </span>
                                </div>
                                <div className="whitespace-pre-wrap text-slate-700 text-sm">
                                  {fb.comment}
                                </div>
                                <FollowUpQnA pairs={fb.followup_qna ?? []} />
                              </div>
                            );
                          })}
                        </div>
                      </div>
                    );
                  })}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analysis View */}
          <TabsContent value="analysis">
            <DiscoveryAnalysisTab workshopId={workshopId!} />
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};
