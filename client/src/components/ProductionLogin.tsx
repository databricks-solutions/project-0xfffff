import React, { useState } from 'react';
import { useUser } from '@/context/UserContext';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { UsersService } from '@/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Alert, AlertDescription } from '@/components/ui/alert';

export const ProductionLogin: React.FC = () => {
  const { setUser } = useUser();
  const { workshopId } = useWorkshopContext();
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Login form state
  const [loginData, setLoginData] = useState({
    email: '',
    password: ''
  });

  const handleLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);
    setError(null);

    try {
      const response = await UsersService.loginUsersAuthLoginPost({
        email: loginData.email,
        password: loginData.password
      });

      // Set the user in context
      await setUser(response.user);
    } catch (error: any) {
      
      setError(error.response?.data?.detail || 'Login failed. Please check your credentials.');
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

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            <Button type="submit" className="w-full" disabled={isLoading}>
              {isLoading ? 'Signing in...' : 'Sign In'}
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
