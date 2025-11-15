import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Sparkles, Users, Target } from 'lucide-react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useUser } from '@/context/UserContext';
import { useCreateWorkshop } from '@/hooks/useWorkshopApi';

export function WorkshopCreationPage() {
  const { setWorkshopId } = useWorkshopContext();
  const { user } = useUser();
  const createWorkshop = useCreateWorkshop();
  
  const [formData, setFormData] = useState({
    name: 'LLM Judge Calibration Workshop',
    description: 'A collaborative workshop to calibrate LLM judges through structured evaluation and consensus building.'
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form data
    if (!formData.name.trim()) {
      alert('Please enter a workshop name');
      return;
    }
    
    try {
      const workshop = await createWorkshop.mutateAsync({
        name: formData.name.trim(),
        description: formData.description.trim(),
        facilitator_id: user?.id || 'demo_facilitator'
      });
      
      
      setWorkshopId(workshop.id);
      
      // Update URL to include workshop ID
      window.history.pushState({}, '', `?workshop=${workshop.id}`);
      
    } catch (error) {
      
    }
  };

  const handleQuickStart = async () => {
    try {
      const workshop = await createWorkshop.mutateAsync({
        name: `LLM Judge Calibration Workshop - ${new Date().toLocaleDateString()}`,
        description: 'A collaborative workshop to calibrate LLM judges through structured evaluation and consensus building.',
        facilitator_id: user?.id || 'demo_facilitator'
      });
      
      
      setWorkshopId(workshop.id);
      
      // Update URL to include workshop ID
      window.history.pushState({}, '', `?workshop=${workshop.id}`);
      
    } catch (error) {
      
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 flex items-center justify-center p-6">
      <div className="w-full max-w-2xl">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center items-center gap-3 mb-4">
            <Sparkles className="h-12 w-12 text-blue-600" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Welcome, Facilitator!
            </h1>
          </div>
          <p className="text-xl text-gray-600 max-w-xl mx-auto">
            Create your LLM Judge Calibration workshop to get started
          </p>
        </div>

        {/* Quick Start Option */}
        <Card className="mb-6 border-blue-200 bg-blue-50/50">
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Target className="h-5 w-5 text-blue-600" />
              Quick Start
            </CardTitle>
            <CardDescription>
              Get started immediately with a pre-configured workshop
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Button 
              onClick={handleQuickStart}
              disabled={createWorkshop.isPending}
              className="w-full"
              size="lg"
            >
              {createWorkshop.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating Workshop...
                </>
              ) : (
                <>
                  <Sparkles className="h-4 w-4 mr-2" />
                  Start Workshop Now
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Custom Workshop Creation */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Users className="h-5 w-5 text-purple-600" />
              Create Custom Workshop
            </CardTitle>
            <CardDescription>
              Customize your workshop details and settings
            </CardDescription>
          </CardHeader>
          <CardContent>
            {createWorkshop.error && (
              <Alert className="mb-4">
                <AlertDescription>
                  Failed to create workshop: {createWorkshop.error.message}
                </AlertDescription>
              </Alert>
            )}

            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">Workshop Name *</Label>
                <Input
                  id="name"
                  value={formData.name}
                  onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                  placeholder="e.g., Customer Support Quality Assessment Workshop"
                  required
                />
                <p className="text-sm text-gray-500">
                  Choose a descriptive name that reflects your workshop's purpose
                </p>
              </div>

              <div className="space-y-2">
                <Label htmlFor="description">Description</Label>
                <Textarea
                  id="description"
                  value={formData.description}
                  onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                  placeholder="Describe the workshop goals, context, and what you hope to achieve..."
                  rows={4}
                />
                <p className="text-sm text-gray-500">
                  This description will help participants understand the workshop's purpose and objectives
                </p>
              </div>

              <Button 
                type="submit" 
                disabled={createWorkshop.isPending}
                className="w-full"
                variant="outline"
              >
                {createWorkshop.isPending ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Creating Workshop...
                  </>
                ) : (
                  'Create Custom Workshop'
                )}
              </Button>
            </form>
          </CardContent>
        </Card>

        {/* Info */}
        <div className="text-center mt-8 text-sm text-gray-500">
          <p>You're logged in as: <strong>{user?.name}</strong> ({user?.role})</p>
        </div>
      </div>
    </div>
  );
}