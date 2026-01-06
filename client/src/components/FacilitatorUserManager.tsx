import React, { useState, useEffect } from 'react';
import { useUser } from '@/context/UserContext';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { UsersService } from '@/client';
import { useWorkshop } from '@/hooks/useWorkshopApi';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { AlertCircle, RefreshCw } from 'lucide-react';
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
  const [isLoading, setIsLoading] = useState(false);
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
    
    setIsLoading(true);
    setError(null);
    try {
      const response = await UsersService.listWorkshopUsersUsersWorkshopsWorkshopIdUsersGet(workshopId);
      // The API returns { workshop_id, users: [], total_users }
      setUsers(response.users || []);
    } catch (error: any) {
      setError(`Failed to load users: ${error.message || 'Unknown error'}`);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAddUser = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!workshopId) return;

    setIsLoading(true);
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
      setIsLoading(false);
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
      <div className="max-w-6xl mx-auto">
        <div className="mb-8">
          <h1 className="text-3xl font-bold text-gray-900">Facilitator Dashboard</h1>
          <p className="text-gray-600 mt-2">
            Manage your workshop and participants
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Add User Form */}
          <Card>
            <CardHeader>
              <CardTitle>Add New User</CardTitle>
              <CardDescription>
                Add SMEs and participants to your workshop
              </CardDescription>
            </CardHeader>
            <CardContent>
              <form onSubmit={handleAddUser} className="space-y-4">
                <div className="space-y-2">
                  <Label htmlFor="email">Email</Label>
                  <Input
                    id="email"
                    type="email"
                    placeholder="user@example.com"
                    value={newUser.email}
                    onChange={(e) => setNewUser({ ...newUser, email: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="name">Name</Label>
                  <Input
                    id="name"
                    type="text"
                    placeholder="Full Name"
                    value={newUser.name}
                    onChange={(e) => setNewUser({ ...newUser, name: e.target.value })}
                    required
                  />
                </div>

                <div className="space-y-2">
                  <Label htmlFor="role">Role</Label>
                  <Select
                    value={newUser.role}
                    onValueChange={(value: 'sme' | 'participant') => setNewUser({ ...newUser, role: value })}
                  >
                    <SelectTrigger>
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
                    <AlertDescription>{error}</AlertDescription>
                  </Alert>
                )}

                {success && (
                  <Alert>
                    <AlertDescription>{success}</AlertDescription>
                  </Alert>
                )}

                <Button type="submit" className="w-full" disabled={isLoading}>
                  {isLoading ? 'Adding User...' : 'Add User'}
                </Button>
              </form>
            </CardContent>
          </Card>

          {/* Workshop Info */}
          <Card>
            <CardHeader>
              <CardTitle>Workshop Information</CardTitle>
              <CardDescription>
                Current workshop details
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {workshop ? (
                  <>
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Workshop Name</Label>
                      <p className="text-lg font-semibold text-gray-900">{workshop.name}</p>
                    </div>
                    {workshop.description && (
                      <div>
                        <Label className="text-sm font-medium text-gray-500">Description</Label>
                        <p className="text-sm text-gray-600">{workshop.description}</p>
                      </div>
                    )}
                    <div>
                      <Label className="text-sm font-medium text-gray-500">Current Phase</Label>
                      <Badge variant="outline" className="capitalize">
                        {workshop.current_phase?.replace('_', ' ') || 'Unknown'}
                      </Badge>
                    </div>
                  </>
                ) : (
                  <div className="text-sm text-gray-500">Loading workshop information...</div>
                )}
                <div>
                  <Label className="text-sm font-medium text-gray-500">Workshop ID</Label>
                  <p className="text-sm font-mono bg-gray-100 p-2 rounded">{workshopId}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">Total Users</Label>
                  <p className="text-2xl font-bold">{users.length}</p>
                </div>
                <div>
                  <Label className="text-sm font-medium text-gray-500">User Breakdown</Label>
                  <div className="flex gap-2 mt-1">
                    <Badge variant="secondary">
                      {users.filter(u => u.role === 'sme').length} SMEs
                    </Badge>
                    <Badge variant="secondary">
                      {users.filter(u => u.role === 'participant').length} Participants
                    </Badge>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Users Table */}
        <Card className="mt-6">
          <CardHeader>
            <CardTitle>Workshop Users</CardTitle>
            <CardDescription>
              All users in your workshop
            </CardDescription>
          </CardHeader>
          <CardContent>
            {isLoading ? (
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
