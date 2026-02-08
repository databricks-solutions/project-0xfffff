import React, { useState, useEffect } from 'react';
import { useUser } from '@/context/UserContext';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { UsersService } from '@/client';
import { useWorkshop } from '@/hooks/useWorkshopApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, RefreshCw, UserPlus, Users, Info } from 'lucide-react';
import { toast } from 'sonner';

interface User {
  id: string;
  email: string;
  name: string;
  role: 'facilitator' | 'sme' | 'participant';
  status: string;
  created_at: string;
}

export const FacilitatorUserManager: React.FC = () => {
  const { user } = useUser();
  const { workshopId } = useWorkshopContext();
  const { data: workshop } = useWorkshop(workshopId!);
  const [users, setUsers] = useState<User[]>([]);
  const [isLoadingUsers, setIsLoadingUsers] = useState(false);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  // New user form state
  const [newUser, setNewUser] = useState({
    email: '',
    name: '',
    role: 'participant' as 'sme' | 'participant'
  });

  useEffect(() => {
    if (workshopId) {
      loadUsers();
    }
  }, [workshopId]);


  const loadUsers = async () => {
    if (!workshopId) return;
    
    setIsLoadingUsers(true);
    setError(null);
    try {
      const response = await UsersService.listWorkshopUsersUsersWorkshopsWorkshopIdUsersGet(workshopId);
      // The API returns { workshop_id, users: [], total_users }
      setUsers(response.users || []);
    } catch (error: any) {
      setError(`Failed to load users: ${error.message || 'Unknown error'}`);
    } finally {
      setIsLoadingUsers(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workshopId) return;

    setIsSubmitting(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await UsersService.addUserToWorkshopUsersWorkshopsWorkshopIdUsersPost(
        workshopId,
        {
          email: newUser.email,
          name: newUser.name,
          role: newUser.role,
          workshop_id: workshopId
        }
      );

      setSuccess(`User ${newUser.email} added successfully.`);
      setNewUser({ email: '', name: '', role: 'participant' });
      loadUsers(); // Refresh the user list
    } catch (error: any) {
      setError(error.response?.data?.detail || 'Failed to add user');
    } finally {
      setIsSubmitting(false);
    }
  };

  const [updatingRoleUserId, setUpdatingRoleUserId] = useState<string | null>(null);

  const getRoleBadgeColor = (role: string) => {
    switch (role) {
      case 'facilitator':
        return 'bg-blue-100 text-blue-800';
      case 'sme':
        return 'bg-green-100 text-green-800';
      case 'participant':
        return 'bg-gray-100 text-gray-800';
      default:
        return 'bg-gray-100 text-gray-800';
    }
  };

  const handleRoleChange = async (userId: string, newRole: 'sme' | 'participant') => {
    if (!workshopId) return;
    
    setUpdatingRoleUserId(userId);
    try {
      const response = await fetch(`/users/workshops/${workshopId}/users/${userId}/role`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      
      if (response.ok) {
        toast.success(`Role updated to ${newRole.toUpperCase()}`);
        loadUsers(); // Refresh the user list
      } else {
        const errorData = await response.json().catch(() => ({}));
        toast.error(errorData.detail || 'Failed to update role');
      }
    } catch (error: any) {
      toast.error('Failed to update role');
    } finally {
      setUpdatingRoleUserId(null);
    }
  };

  if (!user || user.role !== 'facilitator') {
    return (
      <div className="min-h-screen bg-gray-50 p-6 flex items-center justify-center">
        <div className="text-center max-w-md">
          <AlertCircle className="h-12 w-12 text-red-500 mx-auto mb-4" />
          <div className="text-lg font-medium text-gray-900 mb-2">
            Access Denied
          </div>
          <div className="text-sm text-gray-500">
            Only facilitators can access this dashboard.
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-5xl mx-auto space-y-5">
        {/* Header */}
        <div className="flex items-center gap-3 pb-1">
          <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-violet-100">
            <Users className="w-5 h-5 text-violet-600" />
          </div>
          <div>
            <h1 className="text-xl font-semibold text-gray-900">Invite Participants</h1>
            <p className="text-sm text-gray-500">Manage workshop users and roles</p>
          </div>
          <div className="ml-auto flex items-center gap-2">
            <Badge className="bg-blue-50 text-blue-700 border border-blue-200">
              {users.length} user{users.length !== 1 ? 's' : ''}
            </Badge>
            <Badge className="bg-green-50 text-green-700 border border-green-200">
              {users.filter(u => u.role === 'sme').length} SMEs
            </Badge>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-5">
          {/* Add User Form */}
          <Card className="border-l-4 border-indigo-500 lg:col-span-2">
            <CardContent className="p-4">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-3">
                <UserPlus className="w-4 h-4 text-indigo-600" />
                Add New User
              </h3>
              <form onSubmit={handleAddUser} className="space-y-3">
                <div className="space-y-1.5">
                  <Label htmlFor="email" className="text-xs font-medium text-gray-600">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@example.com"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    required
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="name" className="text-xs font-medium text-gray-600">Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Full Name"
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    required
                    className="h-9"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label htmlFor="role" className="text-xs font-medium text-gray-600">Role</Label>
                  <Select
                    value={newUser.role}
                    onValueChange={(value: 'sme' | 'participant') => setNewUser({ ...newUser, role: value })}
                  >
                    <SelectTrigger className="h-9">
                      <SelectValue placeholder="Select role" />
                    </SelectTrigger>
                    <SelectContent>
                      <SelectItem value="sme">Subject Matter Expert (SME)</SelectItem>
                      <SelectItem value="participant">Participant</SelectItem>
                    </SelectContent>
                  </Select>
                </div>

                {error && (
                  <Alert variant="destructive">
                    <AlertDescription className="text-xs">{error}</AlertDescription>
                  </Alert>
                )}

                {success && (
                  <Alert>
                    <AlertDescription className="text-xs">{success}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" size="sm" className="w-full" disabled={isSubmitting}>
                  {isSubmitting ? 'Adding...' : 'Add User'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Workshop Info */}
          <Card className="border-l-4 border-blue-500 lg:col-span-3">
            <CardContent className="p-4">
              <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-3">
                <Info className="w-4 h-4 text-blue-600" />
                Workshop Information
              </h3>
              <div className="space-y-3">
                {workshop ? (
                  <>
                    <div>
                      <span className="text-xs text-gray-500">Workshop Name</span>
                      <p className="text-sm font-semibold text-gray-900">{workshop.name}</p>
                    </div>
                    {workshop.description && (
                      <div>
                        <span className="text-xs text-gray-500">Description</span>
                        <p className="text-sm text-gray-600">{workshop.description}</p>
                      </div>
                    )}
                    <div className="flex items-center gap-4">
                      <div>
                        <span className="text-xs text-gray-500">Phase</span>
                        <div className="mt-0.5">
                          <Badge variant="outline" className="capitalize text-xs">
                            {workshop.current_phase?.replace('_', ' ') || 'Unknown'}
                          </Badge>
                        </div>
                      </div>
                      <div>
                        <span className="text-xs text-gray-500">Users</span>
                        <div className="flex gap-1.5 mt-0.5">
                          <Badge className="bg-green-50 text-green-700 border border-green-200 text-xs">
                            {users.filter(u => u.role === 'sme').length} SMEs
                          </Badge>
                          <Badge className="bg-gray-50 text-gray-700 border border-gray-200 text-xs">
                            {users.filter(u => u.role === 'participant').length} Participants
                          </Badge>
                        </div>
                      </div>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-gray-500">Loading workshop information...</div>
                )}
                <div>
                  <span className="text-xs text-gray-500">Workshop ID</span>
                  <p className="text-xs font-mono text-gray-500 bg-gray-50 px-2 py-1.5 rounded border border-gray-100 mt-0.5">{workshopId}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Users Table */}
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center justify-between mb-3">
              <h3 className="text-base font-semibold text-gray-900">Workshop Users</h3>
              <Badge variant="secondary" className="text-xs">{users.length} total</Badge>
            </div>
            {isLoadingUsers ? (
              <div className="text-center py-8">Loading users...</div>
            ) : error ? (
              <div className="text-center py-8">
                <Alert variant="destructive">
                  <AlertDescription>{error}</AlertDescription>
                </Alert>
                <Button 
                  variant="outline" 
                  onClick={loadUsers}
                  className="mt-4"
                >
                  Retry
                </Button>
              </div>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>Name</TableHead>
                    <TableHead>Email</TableHead>
                    <TableHead>Role</TableHead>
                    <TableHead>Status</TableHead>
                    <TableHead>Joined</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {users.map((u) => (
                    <TableRow key={u.id}>
                      <TableCell className="font-medium">{u.name}</TableCell>
                      <TableCell>{u.email}</TableCell>
                      <TableCell>
                        {u.role === 'facilitator' ? (
                          <Badge className="bg-blue-50 text-blue-700 border border-blue-200">
                            Facilitator
                          </Badge>
                        ) : (
                          <div className="flex items-center gap-2">
                            <Select
                              value={u.role}
                              onValueChange={(value: 'sme' | 'participant') => handleRoleChange(u.id, value)}
                              disabled={updatingRoleUserId === u.id}
                            >
                              <SelectTrigger 
                                className={`w-[130px] h-8 font-medium ${
                                  u.role === 'sme' 
                                    ? 'bg-violet-50 text-violet-700 border-violet-200 hover:bg-violet-100' 
                                    : 'bg-purple-50 text-purple-700 border-purple-200 hover:bg-purple-100'
                                }`}
                              >
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                <SelectItem value="sme">
                                  <span className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-violet-500"></span>
                                    SME
                                  </span>
                                </SelectItem>
                                <SelectItem value="participant">
                                  <span className="flex items-center gap-2">
                                    <span className="w-2 h-2 rounded-full bg-violet-500"></span>
                                    Participant
                                  </span>
                                </SelectItem>
                              </SelectContent>
                            </Select>
                            {updatingRoleUserId === u.id && (
                              <RefreshCw className="h-4 w-4 animate-spin text-gray-500" />
                            )}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge 
                          variant={
                            u.status === 'active' ? 'default' : 
                            u.status === 'pending' ? 'outline' : 'secondary'
                          }
                          className={
                            u.status === 'pending' ? 'border-yellow-500 text-yellow-700 bg-yellow-50' : ''
                          }
                        >
                          {u.status}
                        </Badge>
                      </TableCell>
                      <TableCell>
                        {new Date(u.created_at).toLocaleDateString()}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};
