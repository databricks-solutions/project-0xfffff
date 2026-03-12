import React, { useState, useEffect, useCallback } from 'react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useUser, useRoleCheck } from '@/context/UserContext';
import { UsersService, WorkshopsService, UserRole, type User, type WorkshopParticipant, type Trace } from '@/client';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Progress } from '@/components/ui/progress';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { 
  Users, 
  UserCheck, 
  Settings, 
  RefreshCw, 
  CheckCircle,
  AlertCircle,
  BarChart3
} from 'lucide-react';
import { toast } from 'sonner';

export const AnnotationAssignmentManager: React.FC = () => {
  const { workshopId } = useWorkshopContext();
  const { user } = useUser();
  const { isFacilitator, canAssignAnnotations } = useRoleCheck();
  
  const [participants, setParticipants] = useState<WorkshopParticipant[]>([]);
  const [users, setUsers] = useState<User[]>([]);
  const [traces, setTraces] = useState<Trace[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [assigning, setAssigning] = useState(false);

  const loadData = useCallback(async () => {
    if (!workshopId) return;
    try {
      setLoading(true);
      setError(null);

      const [participantsRes, usersRes, tracesRes] = await Promise.all([
        UsersService.getWorkshopParticipantsUsersWorkshopsWorkshopIdParticipantsGet(workshopId),
        UsersService.listUsersUsersGet(workshopId),
        WorkshopsService.getTracesWorkshopsWorkshopIdTracesGet(workshopId, 'all')
      ]);

      setParticipants(participantsRes);
      setUsers(usersRes);
      setTraces(tracesRes);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to load data';
      setError(message);
    } finally {
      setLoading(false);
    }
  }, [workshopId]);

  useEffect(() => {
    if (workshopId && canAssignAnnotations) {
      loadData();
    }
  }, [workshopId, canAssignAnnotations, loadData]);

  const handleAutoAssign = async () => {
    try {
      setAssigning(true);
      setError(null);

              const response = await UsersService.autoAssignAnnotationsUsersWorkshopsWorkshopIdAutoAssignAnnotationsPost(workshopId!);
      
      // Reload data to show updated assignments
      await loadData();
      
      toast.success(`Successfully assigned annotations to ${response.total_annotators} users across ${response.total_traces} traces`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to auto-assign annotations';
      setError(message);
    } finally {
      setAssigning(false);
    }
  };

  const handleManualAssign = async (userId: string, traceIds: string[]) => {
    try {
      setAssigning(true);
      setError(null);

      await UsersService.assignTracesToUserUsersWorkshopsWorkshopIdParticipantsUserIdAssignTracesPost( 
        workshopId!, 
        userId, 
        traceIds
      );
      
      await loadData();
      toast.success(`Successfully assigned ${traceIds.length} traces`);
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to assign traces';
      setError(message);
    } finally {
      setAssigning(false);
    }
  };

  if (!canAssignAnnotations) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center text-gray-500">
            <AlertCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
            <h3 className="text-lg font-medium mb-2">Access Denied</h3>
            <p>You don't have permission to manage annotation assignments.</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  if (loading) {
    return (
      <Card>
        <CardContent className="pt-6">
          <div className="text-center">
            <RefreshCw className="h-8 w-8 mx-auto mb-4 animate-spin text-blue-500" />
            <p className="text-gray-600">Loading assignment data...</p>
          </div>
        </CardContent>
      </Card>
    );
  }

  const annotators = participants.filter((p) => p.role === UserRole.SME || p.role === UserRole.PARTICIPANT);
  const getUserById = (userId: string) => users.find(u => u.id === userId);
  
  const getAssignmentStats = () => {
    const totalTraces = traces.length;
    const assignedTraces = new Set();
    
    annotators.forEach(participant => {
      (participant.assigned_traces ?? []).forEach(traceId => {
        assignedTraces.add(traceId);
      });
    });

    return {
      totalTraces,
      assignedTraces: assignedTraces.size,
      unassignedTraces: totalTraces - assignedTraces.size,
      totalAnnotators: annotators.length
    };
  };

  const stats = getAssignmentStats();

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Settings className="h-5 w-5" />
            Annotation Assignment Manager
          </CardTitle>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <div className="grid grid-cols-1 md:grid-cols-4 gap-4 mb-6">
            <div className="text-center p-4 bg-blue-50 rounded-lg">
              <div className="text-2xl font-bold text-blue-600">{stats.totalTraces}</div>
              <div className="text-sm text-gray-600">Total Traces</div>
            </div>
            <div className="text-center p-4 bg-green-50 rounded-lg">
              <div className="text-2xl font-bold text-green-600">{stats.assignedTraces}</div>
              <div className="text-sm text-gray-600">Assigned</div>
            </div>
            <div className="text-center p-4 bg-orange-50 rounded-lg">
              <div className="text-2xl font-bold text-orange-600">{stats.unassignedTraces}</div>
              <div className="text-sm text-gray-600">Unassigned</div>
            </div>
            <div className="text-center p-4 bg-purple-50 rounded-lg">
              <div className="text-2xl font-bold text-purple-600">{stats.totalAnnotators}</div>
              <div className="text-sm text-gray-600">Annotators</div>
            </div>
          </div>

          <div className="mb-6">
            <div className="flex justify-between items-center mb-2">
              <span className="text-sm font-medium">Assignment Progress</span>
              <span className="text-sm text-gray-600">
                {stats.assignedTraces} / {stats.totalTraces} traces assigned
              </span>
            </div>
            <Progress 
              value={stats.totalTraces > 0 ? (stats.assignedTraces / stats.totalTraces) * 100 : 0} 
              className="h-2"
            />
          </div>

          <div className="flex gap-2">
            <Button
              onClick={handleAutoAssign}
              disabled={assigning}
              className="flex items-center gap-2"
            >
              {assigning ? (
                <RefreshCw className="h-4 w-4 animate-spin" />
              ) : (
                <BarChart3 className="h-4 w-4" />
              )}
              Auto-Assign Annotations
            </Button>
            <Button
              variant="outline"
              onClick={loadData}
              disabled={loading}
            >
              <RefreshCw className="h-4 w-4 mr-2" />
              Refresh
            </Button>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="participants" className="w-full">
        <TabsList>
          <TabsTrigger value="participants">Participants</TabsTrigger>
          <TabsTrigger value="traces">Traces</TabsTrigger>
        </TabsList>

        <TabsContent value="participants" className="space-y-4">
          {annotators.map(participant => {
            const userInfo = getUserById(participant.user_id);
            return (
              <Card key={participant.user_id}>
                <CardHeader>
                  <CardTitle className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      {participant.role === UserRole.SME ? (
                        <UserCheck className="h-4 w-4 text-blue-500" />
                      ) : (
                        <Users className="h-4 w-4 text-gray-500" />
                      )}
                      <span>{userInfo?.name || 'Unknown User'}</span>
                      <Badge variant="outline" className="capitalize">
                        {participant.role}
                      </Badge>
                    </div>
                    <Badge variant="secondary">
                      {(participant.assigned_traces ?? []).length} traces assigned
                    </Badge>
                  </CardTitle>
                </CardHeader>
                <CardContent>
                  <div className="text-sm text-gray-600 mb-2">
                    Email: {userInfo?.email || 'Unknown'}
                  </div>
                  <div className="text-sm text-gray-600 mb-4">
                    Joined: {new Date(participant.joined_at ?? '').toLocaleDateString()}
                  </div>
                  
                  {(participant.assigned_traces ?? []).length > 0 && (
                    <div>
                      <div className="text-sm font-medium mb-2">Assigned Traces:</div>
                      <div className="flex flex-wrap gap-1">
                        {(participant.assigned_traces ?? []).slice(0, 10).map(traceId => (
                          <Badge key={traceId} variant="outline" className="text-xs">
                            {traceId.slice(0, 8)}...
                          </Badge>
                        ))}
                        {(participant.assigned_traces ?? []).length > 10 && (
                          <Badge variant="outline" className="text-xs">
                            +{(participant.assigned_traces ?? []).length - 10} more
                          </Badge>
                        )}
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            );
          })}
        </TabsContent>

        <TabsContent value="traces" className="space-y-4">
          <Card>
            <CardHeader>
              <CardTitle>Trace Assignment Status</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                {traces.slice(0, 20).map(trace => {
                  const assignedTo = annotators.filter(p => 
                    (p.assigned_traces ?? []).includes(trace.id)
                  );
                  
                  return (
                    <div key={trace.id} className="flex items-center justify-between p-3 border rounded-lg">
                      <div className="flex-1">
                        <div className="font-medium text-sm">
                          Trace {trace.id.slice(0, 8)}...
                        </div>
                        <div className="text-xs text-gray-500">
                          {trace.input.slice(0, 100)}...
                        </div>
                      </div>
                      <div className="flex items-center gap-2">
                        {assignedTo.length > 0 ? (
                          <Badge variant="default" className="text-xs">
                            {assignedTo.length} annotator{assignedTo.length > 1 ? 's' : ''}
                          </Badge>
                        ) : (
                          <Badge variant="outline" className="text-xs">
                            Unassigned
                          </Badge>
                        )}
                      </div>
                    </div>
                  );
                })}
                {traces.length > 20 && (
                  <div className="text-center text-sm text-gray-500 pt-4">
                    ... and {traces.length - 20} more traces
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};