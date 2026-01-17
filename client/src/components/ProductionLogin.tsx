import React, { useState, useEffect } from 'react';
import { useUser } from '@/context/UserContext';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { UsersService } from '@/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Loader2, Plus } from 'lucide-react';
import type { Workshop } from '@/client';

export const ProductionLogin: React.FC = () => {
  const { setUser } = useUser();
  const { workshopId, setWorkshopId } = useWorkshopContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [workshops, setWorkshops] = useState<Workshop[]>([]);
  const [isLoadingWorkshops, setIsLoadingWorkshops] = useState(true);
  const [selectedWorkshopId, setSelectedWorkshopId] = useState<string>('');
  const [createNewWorkshop, setCreateNewWorkshop] = useState(false);

  // Clear URL parameter on login page - users will select their workshop
  useEffect(() => {
    if (window.location.search.includes('workshop=')) {
      window.history.replaceState({}, '', '/');
      setWorkshopId(null);
      localStorage.removeItem('workshop_id');
    }
  }, [setWorkshopId]);

  // Fetch available workshops on mount (only once)
  useEffect(() => {
    const fetchWorkshops = async () => {
      try {
        // Add cache-busting to ensure fresh data
        const response = await fetch(`/workshops/?_t=${Date.now()}`, {
          headers: {
            'Cache-Control': 'no-cache',
          }
        });
        if (response.ok) {
          const data = await response.json();
          console.log('[ProductionLogin] Fetched workshops:', data.length, data);
          setWorkshops(data);
          
          // If there's only one workshop, auto-select it
          if (data.length === 1) {
            setSelectedWorkshopId(data[0].id);
          }
          // If no workshops exist, auto-select "Create New" for facilitators
          if (data.length === 0) {
            setCreateNewWorkshop(true);
          }
        } else {
          console.error('[ProductionLogin] Failed to fetch workshops:', response.status, response.statusText);
        }
      } catch (err) {
        console.error('[ProductionLogin] Error fetching workshops:', err);
      } finally {
        setIsLoadingWorkshops(false);
      }
    };
    fetchWorkshops();
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []); // Only run once on mount

  // Login form state
  const [loginData, setLoginData] = useState({
    email: '',
    password: ''
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    // Validate workshop selection for non-facilitators
    if (!selectedWorkshopId && !loginData.password) {
      setError('Please select a workshop to join.');
      setIsLoading(false);
      return;
    }

    try {
      // For participants/SMEs (no password), include workshop_id for access validation
      const response = await UsersService.loginUsersAuthLoginPost({
        email: loginData.email,
        password: loginData.password,
        workshop_id: !loginData.password ? selectedWorkshopId : undefined
      });

      // Handle facilitator creating new workshop
      if (loginData.password && createNewWorkshop) {
        // Clear workshop ID to go to workshop creation page
        setWorkshopId(null);
        localStorage.removeItem('workshop_id');
        window.history.replaceState({}, '', '/');
      }
      // Set workshop ID if selected (for existing workshops)
      else if (selectedWorkshopId && !response.user.workshop_id) {
        // Update the workshop context
        setWorkshopId(selectedWorkshopId);
        window.history.pushState({}, '', `?workshop=${selectedWorkshopId}`);
      }

      // Set the user in context
      await setUser(response.user);
    } catch (error: any) {
      const errorDetail = error.body?.detail || error.response?.data?.detail || 'Login failed. Please check your credentials.';
      setError(errorDetail);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">Workshop Portal</CardTitle>
          <CardDescription>
            Sign in to access your workshop
          </CardDescription>
          <div className="mt-3 text-sm text-slate-600 bg-blue-50 p-3 rounded-lg">
            <strong>Participants & SMEs:</strong> Enter your email only (leave password blank)<br/>
            <strong>Facilitators:</strong> Enter both email and password
          </div>
        </CardHeader>
        
        <CardContent>
          <form onSubmit={handleLogin} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email">Email</Label>
              <Input
                id="email"
                data-testid="email"
                type="email"
                placeholder="Enter your email"
                value={loginData.email}
                onChange={(e) => setLoginData({ ...loginData, email: e.target.value })}
                required
              />
            </div>
            
            <div className="space-y-2">
              <Label htmlFor="password">Password <span className="text-slate-500">(facilitators only)</span></Label>
              <Input
                id="password"
                type="password"
                placeholder="Leave blank for participants/SMEs"
                value={loginData.password}
                onChange={(e) => setLoginData({ ...loginData, password: e.target.value })}
              />
            </div>

            {/* Workshop Selection for Participants/SMEs */}
            {!loginData.password && (
              <div className="space-y-2">
                <Label htmlFor="workshop">Select Workshop</Label>
                {isLoadingWorkshops ? (
                  <div className="flex items-center justify-center py-2">
                    <Loader2 className="h-4 w-4 animate-spin mr-2" />
                    <span className="text-sm text-gray-500">Loading workshops...</span>
                  </div>
                ) : workshops.length === 0 ? (
                  <div className="text-sm text-amber-600 bg-amber-50 p-3 rounded-lg">
                    No workshops available. Please wait for a facilitator to create one.
                  </div>
                ) : (
                  <>
                    <Select 
                      value={selectedWorkshopId} 
                      onValueChange={(value) => {
                        console.log('[ProductionLogin] Workshop selected:', value);
                        setSelectedWorkshopId(value);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a workshop to join" />
                      </SelectTrigger>
                      <SelectContent>
                        {workshops.map((workshop, index) => (
                          <SelectItem key={workshop.id} value={workshop.id}>
                            {workshop.name} {workshops.length > 1 && `(#${index + 1})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <div className="text-xs text-gray-500">
                      {workshops.length} workshop{workshops.length !== 1 ? 's' : ''} available
                    </div>
                  </>
                )}
              </div>
            )}

            {/* Workshop Selection for Facilitators */}
            {loginData.password && (
              <div className="space-y-3">
                <Label>Workshop</Label>
                
                {/* Toggle between existing and new */}
                <div className="flex gap-2">
                  <Button
                    type="button"
                    variant={!createNewWorkshop && workshops.length > 0 ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setCreateNewWorkshop(false)}
                    disabled={isLoadingWorkshops || workshops.length === 0}
                  >
                    Join Existing
                  </Button>
                  <Button
                    type="button"
                    variant={createNewWorkshop || workshops.length === 0 ? "default" : "outline"}
                    size="sm"
                    className="flex-1"
                    onClick={() => setCreateNewWorkshop(true)}
                  >
                    <Plus className="h-4 w-4 mr-1" />
                    Create New
                  </Button>
                </div>

                {!createNewWorkshop && workshops.length > 0 ? (
                  // Existing workshop selection
                  isLoadingWorkshops ? (
                    <div className="flex items-center justify-center py-2">
                      <Loader2 className="h-4 w-4 animate-spin mr-2" />
                      <span className="text-sm text-gray-500">Loading workshops...</span>
                    </div>
                  ) : (
                    <Select 
                      value={selectedWorkshopId} 
                      onValueChange={(value) => {
                        console.log('[ProductionLogin] Facilitator workshop selected:', value);
                        setSelectedWorkshopId(value);
                      }}
                    >
                      <SelectTrigger>
                        <SelectValue placeholder="Select a workshop" />
                      </SelectTrigger>
                      <SelectContent>
                        {workshops.map((workshop, index) => (
                          <SelectItem key={workshop.id} value={workshop.id}>
                            {workshop.name} {workshops.length > 1 && `(#${index + 1})`}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                  )
                ) : (
                  // New workshop indicator
                  <div className="text-sm text-green-600 bg-green-50 p-3 rounded-lg">
                    A new workshop will be created after you sign in.
                  </div>
                )}
              </div>
            )}

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button 
              type="submit" 
              className="w-full" 
              disabled={isLoading || (!loginData.password && !selectedWorkshopId) || (loginData.password && !createNewWorkshop && !selectedWorkshopId && workshops.length > 0)}
            >
              {isLoading ? 'Signing in...' : createNewWorkshop ? 'Sign In & Create Workshop' : 'Sign In'}
            </Button>
          </form>

          <div className="mt-4 text-center text-sm text-gray-600">
            <p>Need help? Contact your workshop facilitator.</p>
          </div>
        </CardContent>
      </Card>
    </div>
  );
};
