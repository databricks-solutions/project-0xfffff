import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Sparkles, Users, Target, FolderOpen, Calendar, Clock, ChevronRight } from 'lucide-react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useUser } from '@/context/UserContext';
import { useCreateWorkshop, useListWorkshops } from '@/hooks/useWorkshopApi';
import type { Workshop } from '@/client';

export function WorkshopCreationPage() {
  const { setWorkshopId } = useWorkshopContext();
  const { user } = useUser();
  const createWorkshop = useCreateWorkshop();
  const { data: workshops, isLoading: isLoadingWorkshops } = useListWorkshops({ 
    userId: user?.id,
    enabled: !!user?.id 
  });
  
  const [showExisting, setShowExisting] = useState(true);
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

  const handleSelectWorkshop = (workshop: Workshop) => {
    setWorkshopId(workshop.id);
    window.history.pushState({}, '', `?workshop=${workshop.id}`);
  };

  const formatDate = (dateString: string | null | undefined) => {
    if (!dateString) return 'Unknown';
    const date = new Date(dateString);
    return date.toLocaleDateString('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit'
    });
  };

  const getPhaseLabel = (phase: string | null | undefined) => {
    if (!phase) return 'Not Started';
    const phases: Record<string, string> = {
      'intake': 'Intake',
      'discovery': 'Discovery',
      'rubric': 'Rubric Creation',
      'annotation': 'Annotation',
      'results': 'Results Review',
      'judge_tuning': 'Judge Tuning',
      'unity_volume': 'Unity Volume'
    };
    return phases[phase] || phase;
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-50 to-indigo-100 overflow-auto py-8 px-6">
      <div className="w-full max-w-2xl mx-auto">
        {/* Header */}
        <div className="text-center mb-8">
          <div className="flex justify-center items-center gap-3 mb-4">
            <Sparkles className="h-12 w-12 text-blue-600" />
            <h1 className="text-4xl font-bold bg-gradient-to-r from-blue-600 to-purple-600 bg-clip-text text-transparent">
              Welcome, Facilitator!
            </h1>
          </div>
          <p className="text-xl text-gray-600 max-w-xl mx-auto">
            {workshops && workshops.length > 0 
              ? 'Continue an existing workshop or create a new one'
              : 'Create your LLM Judge Calibration workshop to get started'
            }
          </p>
        </div>

        {/* Existing Workshops */}
        {workshops && workshops.length > 0 && (
          <Card className="mb-6 border-green-200 bg-green-50/50">
            <CardHeader className="cursor-pointer" onClick={() => setShowExisting(!showExisting)}>
              <CardTitle className="flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <FolderOpen className="h-5 w-5 text-green-600" />
                  Your Workshops ({workshops.length})
                </div>
                <ChevronRight className={`h-5 w-5 text-gray-400 transition-transform ${showExisting ? 'rotate-90' : ''}`} />
              </CardTitle>
              <CardDescription>
                Click to {showExisting ? 'hide' : 'show'} your existing workshops
              </CardDescription>
            </CardHeader>
            {showExisting && (
              <CardContent className="space-y-3">
                {isLoadingWorkshops ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-6 w-6 animate-spin text-green-600" />
                    <span className="ml-2 text-gray-600">Loading workshops...</span>
                  </div>
                ) : (
                  workshops.map((workshop) => (
                    <div 
                      key={workshop.id}
                      className="p-4 bg-white rounded-lg border border-gray-200 hover:border-green-400 hover:shadow-md transition-all cursor-pointer group"
                      onClick={() => handleSelectWorkshop(workshop)}
                    >
                      <div className="flex items-start justify-between">
                        <div className="flex-1">
                          <h3 className="font-semibold text-gray-900 group-hover:text-green-700 transition-colors">
                            {workshop.name}
                          </h3>
                          {workshop.description && (
                            <p className="text-sm text-gray-500 mt-1 line-clamp-2">
                              {workshop.description}
                            </p>
                          )}
                          <div className="flex items-center gap-4 mt-2 text-xs text-gray-400">
                            <span className="flex items-center gap-1">
                              <Calendar className="h-3 w-3" />
                              {formatDate(workshop.created_at)}
                            </span>
                            <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-blue-100 text-blue-700">
                              <Clock className="h-3 w-3" />
                              {getPhaseLabel(workshop.current_phase)}
                            </span>
                          </div>
                        </div>
                        <ChevronRight className="h-5 w-5 text-gray-300 group-hover:text-green-500 group-hover:translate-x-1 transition-all" />
                      </div>
                    </div>
                  ))
                )}
              </CardContent>
            )}
          </Card>
        )}

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
                  Create New Workshop
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