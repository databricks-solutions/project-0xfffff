import React, { useState, useEffect } from 'react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useUser } from '@/context/UserContext';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { toast } from 'sonner';
import { Users, Mail, Copy, RefreshCw, UserPlus, AlertCircle, CheckCircle, Clock } from 'lucide-react';

interface Invitation {
  id: string;
  email: string;
  name: string;
  role: string;
  status: string;
  created_at: string;
  expires_at: string;
  invitation_token: string;
}

export const FacilitatorInvitationManager: React.FC = () => {
  const { workshopId } = useWorkshopContext();
  const { user } = useUser();
  const [invitations, setInvitations] = useState<Invitation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [newInvitation, setNewInvitation] = useState({
    email: '',
    name: '',
    role: 'participant' as 'sme' | 'participant',
    message: ''
  });

  // Fetch existing invitations
  const fetchInvitations = async () => {
    try {
      const response = await fetch(`/users/invitations/?workshop_id=${workshopId}`);
      if (response.ok) {
        const data = await response.json();
        setInvitations(data);
      } else {
        
      }
    } catch (error) {
      
    }
  };

  useEffect(() => {
    if (workshopId) {
      fetchInvitations();
    }
  }, [workshopId]);

  const handleCreateInvitation = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch('/users/invitations/', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          ...newInvitation,
          workshop_id: workshopId,
          invited_by: user?.id
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to create invitation');
      }

      const data = await response.json();
      toast.success(`Invitation sent to ${newInvitation.name}!`);
      
      // Reset form
      setNewInvitation({
        email: '',
        name: '',
        role: 'participant',
        message: ''
      });
      
      // Refresh invitations list
      fetchInvitations();
    } catch (error: any) {
      
      setError(error.message || 'Failed to create invitation');
      toast.error(error.message || 'Failed to create invitation');
    } finally {
      setIsLoading(false);
    }
  };

  const handleRefreshInvitations = async () => {
    setIsRefreshing(true);
    await fetchInvitations();
    setIsRefreshing(false);
    toast.success('Invitations refreshed!');
  };

  const getStatusBadge = (status: string) => {
    switch (status) {
      case 'pending':
        return <Badge variant="secondary" className="flex items-center gap-1"><Clock className="w-3 h-3" />Pending</Badge>;
      case 'accepted':
        return <Badge variant="default" className="flex items-center gap-1"><CheckCircle className="w-3 h-3" />Accepted</Badge>;
      case 'expired':
        return <Badge variant="destructive" className="flex items-center gap-1"><AlertCircle className="w-3 h-3" />Expired</Badge>;
      default:
        return <Badge variant="outline">{status}</Badge>;
    }
  };

  const getRoleBadge = (role: string) => {
    switch (role) {
      case 'sme':
        return <Badge variant="default" className="bg-purple-100 text-purple-800 border-purple-200">SME</Badge>;
      case 'participant':
        return <Badge variant="outline" className="bg-blue-50 text-blue-700 border-blue-200">Participant</Badge>;
      default:
        return <Badge variant="outline" className="capitalize">{role}</Badge>;
    }
  };

  const copyInvitationLink = (token: string) => {
    const invitationUrl = `${window.location.origin}/invite/${token}`;
    navigator.clipboard.writeText(invitationUrl);
    toast.success('Invitation link copied to clipboard!');
  };

  const getInvitationStats = () => {
    const total = invitations.length;
    const pending = invitations.filter(inv => inv.status === 'pending').length;
    const accepted = invitations.filter(inv => inv.status === 'accepted').length;
    const expired = invitations.filter(inv => inv.status === 'expired').length;
    
    return { total, pending, accepted, expired };
  };

  const stats = getInvitationStats();

  return (
    <div className="space-y-6">
      {/* Invitation Statistics */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        <Card className="bg-blue-50 border-blue-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Users className="w-4 h-4 text-blue-600" />
              <div>
                <div className="text-2xl font-bold text-blue-900">{stats.total}</div>
                <div className="text-xs text-blue-700">Total Invitations</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-yellow-50 border-yellow-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Clock className="w-4 h-4 text-yellow-600" />
              <div>
                <div className="text-2xl font-bold text-yellow-900">{stats.pending}</div>
                <div className="text-xs text-yellow-700">Pending</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-green-50 border-green-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <CheckCircle className="w-4 h-4 text-green-600" />
              <div>
                <div className="text-2xl font-bold text-green-900">{stats.accepted}</div>
                <div className="text-xs text-green-700">Accepted</div>
              </div>
            </div>
          </CardContent>
        </Card>
        
        <Card className="bg-red-50 border-red-200">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <AlertCircle className="w-4 h-4 text-red-600" />
              <div>
                <div className="text-2xl font-bold text-red-900">{stats.expired}</div>
                <div className="text-xs text-red-700">Expired</div>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Create New Invitation */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <UserPlus className="w-5 h-5" />
            Invite New Participant
          </CardTitle>
          <CardDescription>
            Send invitations to SMEs and participants for this workshop
          </CardDescription>
        </CardHeader>
        <CardContent>
          {error && (
            <Alert className="mb-4">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleCreateInvitation} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="invite-email">Email Address *</Label>
                <Input
                  id="invite-email"
                  data-testid="invite-email"
                  type="email"
                  value={newInvitation.email}
                  onChange={(e) => setNewInvitation({ ...newInvitation, email: e.target.value })}
                  placeholder="participant@company.com"
                  required
                />
              </div>

              <div className="space-y-2">
                <Label htmlFor="invite-name">Full Name *</Label>
                <Input
                  id="invite-name"
                  value={newInvitation.name}
                  onChange={(e) => setNewInvitation({ ...newInvitation, name: e.target.value })}
                  placeholder="John Doe"
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="invite-role">Role *</Label>
                <Select 
                  value={newInvitation.role} 
                  onValueChange={(value: any) => setNewInvitation({ ...newInvitation, role: value })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Select role" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="sme">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-purple-500 rounded-full"></div>
                        Subject Matter Expert (SME)
                      </div>
                    </SelectItem>
                    <SelectItem value="participant">
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 bg-blue-500 rounded-full"></div>
                        Participant
                      </div>
                    </SelectItem>
                  </SelectContent>
                </Select>
                <div className="text-xs text-gray-500">
                  {newInvitation.role === 'sme' 
                    ? 'SMEs can create rubrics and perform annotations' 
                    : 'Participants can view traces and provide insights'}
                </div>
              </div>

              <div className="space-y-2">
                <Label htmlFor="invite-message">Personal Message (Optional)</Label>
                <Textarea
                  id="invite-message"
                  value={newInvitation.message}
                  onChange={(e) => setNewInvitation({ ...newInvitation, message: e.target.value })}
                  placeholder="Add a personal message to the invitation..."
                  rows={3}
                />
              </div>
            </div>

            <Button type="submit" disabled={isLoading} className="w-full md:w-auto">
              {isLoading ? (
                <>
                  <div className="w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin mr-2" />
                  Sending Invitation...
                </>
              ) : (
                <>
                  <Mail className="w-4 h-4 mr-2" />
                  Send Invitation
                </>
              )}
            </Button>
          </form>
        </CardContent>
      </Card>

      {/* Invitations List */}
      <Card>
        <CardHeader>
          <div className="flex items-center justify-between">
            <div>
              <CardTitle className="flex items-center gap-2">
                <Users className="w-5 h-5" />
                Invitations ({invitations.length})
              </CardTitle>
              <CardDescription>
                Manage pending and sent invitations
              </CardDescription>
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleRefreshInvitations}
              disabled={isRefreshing}
            >
              <RefreshCw className={`w-4 h-4 mr-2 ${isRefreshing ? 'animate-spin' : ''}`} />
              Refresh
            </Button>
          </div>
        </CardHeader>
        <CardContent>
          {invitations.length === 0 ? (
            <div className="text-center py-12 text-gray-500">
              <Users className="w-12 h-12 mx-auto mb-4 text-gray-300" />
              <h3 className="text-lg font-medium mb-2">No invitations sent yet</h3>
              <p className="text-sm">Start by inviting participants to your workshop</p>
            </div>
          ) : (
            <div className="space-y-4">
              {invitations.map((invitation) => (
                <div key={invitation.id} className="flex items-center justify-between p-4 border rounded-lg hover:bg-gray-50 transition-colors">
                  <div className="flex-1">
                    <div className="flex items-center gap-3 mb-2">
                      <h4 className="font-medium">{invitation.name}</h4>
                      {getRoleBadge(invitation.role)}
                      {getStatusBadge(invitation.status)}
                    </div>
                    <div className="flex items-center gap-4 text-sm text-gray-600">
                      <span className="flex items-center gap-1">
                        <Mail className="w-3 h-3" />
                        {invitation.email}
                      </span>
                      <span>Invited {new Date(invitation.created_at).toLocaleDateString()}</span>
                      {invitation.status === 'pending' && (
                        <span className="text-yellow-600">
                          Expires {new Date(invitation.expires_at).toLocaleDateString()}
                        </span>
                      )}
                    </div>
                  </div>
                  
                  <div className="flex items-center gap-2">
                    {invitation.status === 'pending' && (
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => copyInvitationLink(invitation.invitation_token)}
                        className="flex items-center gap-1"
                      >
                        <Copy className="w-3 h-3" />
                        Copy Link
                      </Button>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
