import React, { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Plus, ChevronRight, Clock } from 'lucide-react';
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
    description: ''
  });

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    // Validate form data
    if (!formData.name.trim()) {
      alert('Please enter a workshop name');
      return;
    }
    if (!formData.description.trim()) {
      alert('Please enter a use case description');
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
      // Workshop creation failed — form remains visible for retry
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
    <div className="min-h-screen bg-gray-50/50 overflow-auto py-10 px-6">
      <div className="w-full max-w-xl mx-auto space-y-6">
        {/* Header */}
        <div className="mb-2">
          <h1 className="text-xl font-semibold text-gray-900">
            Welcome, Facilitator
          </h1>
          <p className="text-sm text-gray-500 mt-1">
            {workshops && workshops.length > 0
              ? 'Continue a workshop or start a new one'
              : 'Create a workshop to get started'
            }
          </p>
        </div>

        {/* Existing Workshops */}
        {workshops && workshops.length > 0 && (
          <div>
            <button
              className="flex items-center justify-between w-full text-left mb-2"
              onClick={() => setShowExisting(!showExisting)}
            >
              <span className="text-xs font-medium text-gray-500 uppercase tracking-wider">
                Your Workshops ({workshops.length})
              </span>
              <ChevronRight className={`h-3.5 w-3.5 text-gray-400 transition-transform ${showExisting ? 'rotate-90' : ''}`} />
            </button>
            {showExisting && (
              <div className="space-y-2">
                {isLoadingWorkshops ? (
                  <div className="flex items-center justify-center py-4">
                    <Loader2 className="h-4 w-4 animate-spin text-gray-400" />
                    <span className="ml-2 text-sm text-gray-500">Loading...</span>
                  </div>
                ) : (
                  workshops.map((workshop) => (
                    <div
                      key={workshop.id}
                      className="flex items-center justify-between p-5 bg-gradient-to-r from-blue-50 to-indigo-50/60 rounded-xl border-l-4 border-l-blue-500 border border-blue-100 hover:from-blue-100 hover:to-indigo-100 hover:border-blue-300 hover:shadow-lg transition-all duration-200 cursor-pointer group"
                      onClick={() => handleSelectWorkshop(workshop)}
                    >
                      <div className="flex-1 min-w-0">
                        <h3 className="text-base font-semibold text-gray-900 group-hover:text-blue-700 transition-colors truncate">
                          {workshop.name}
                        </h3>
                        {workshop.description && (
                          <p className="text-sm text-gray-500 mt-1.5 line-clamp-2">{workshop.description}</p>
                        )}
                        <div className="flex items-center gap-3 mt-2.5">
                          <span className="text-xs text-gray-400">
                            {formatDate(workshop.created_at)}
                          </span>
                          <span className="inline-flex items-center gap-1 text-xs font-medium px-2.5 py-1 rounded-full bg-blue-100 text-blue-700">
                            <Clock className="h-2.5 w-2.5" />
                            {getPhaseLabel(workshop.current_phase)}
                          </span>
                        </div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-blue-300 group-hover:text-blue-600 group-hover:translate-x-1 transition-all flex-shrink-0 ml-3" />
                    </div>
                  ))
                )}
              </div>
            )}
          </div>
        )}

        {/* Create Workshop */}
        <div className="bg-gradient-to-br from-indigo-50/90 to-purple-50/60 rounded-xl border-l-4 border-l-indigo-500 border border-indigo-100 p-6 shadow-sm">
          <h2 className="text-sm font-semibold text-indigo-900 mb-4">New Workshop</h2>

          {createWorkshop.error && (
            <Alert className="mb-4">
              <AlertDescription>
                Failed to create workshop: {createWorkshop.error.message}
              </AlertDescription>
            </Alert>
          )}

          <form onSubmit={handleSubmit} className="space-y-5">
            <div className="space-y-2">
              <Label htmlFor="name" className="text-sm font-medium text-gray-700">Workshop Name</Label>
              <Input
                id="name"
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="e.g., Customer Support Quality Assessment"
                required
                className="h-10 text-sm bg-white border-indigo-200 focus:border-indigo-400 focus:ring-indigo-400"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="description" className="text-sm font-medium text-gray-700">
                Use Case Description <span className="text-red-500">*</span>
              </Label>
              <Textarea
                id="description"
                value={formData.description}
                onChange={(e) => setFormData({ ...formData, description: e.target.value })}
                placeholder={"Describe your use case, data, and evaluation goals. For example:\n\n• What is the chatbot/agent doing? (e.g., answering customer support questions)\n• What data are you evaluating? (e.g., 500 production conversations)"}
                rows={5}
                className="text-sm bg-white border-indigo-200 focus:border-indigo-400 focus:ring-indigo-400"
                required
              />
              <p className="text-xs text-indigo-400">
                This context is used when generating evaluation rubrics
              </p>
            </div>

            <Button
              type="submit"
              disabled={createWorkshop.isPending}
              className="w-full bg-purple-700 hover:bg-purple-800 text-white"
              size="default"
            >
              {createWorkshop.isPending ? (
                <>
                  <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                  Creating Workshop...
                </>
              ) : (
                <>
                  <Plus className="h-4 w-4 mr-2" />
                  Create Workshop
                </>
              )}
            </Button>
          </form>
        </div>

        {/* Footer */}
        <p className="text-center text-xs text-gray-400">
          Signed in as {user?.name}
        </p>
      </div>
    </div>
  );
}