/**
 * RubricSuggestionPanel Component
 *
 * Displays AI-generated rubric suggestions for facilitator review.
 * Suggestions are based on discovery findings and participant notes.
 * Facilitators can edit, accept, or reject each suggestion.
 */

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import {
  Sparkles,
  Check,
  X,
  Edit2,
  Loader2,
  AlertCircle
} from 'lucide-react';
import { toast } from 'sonner';

export interface RubricSuggestion {
  title: string;
  description: string;
  positive?: string;
  negative?: string;
  examples?: string;
  judgeType: 'likert' | 'binary' | 'freeform';
}

interface RubricSuggestionPanelProps {
  workshopId: string;
  onAcceptSuggestion: (suggestion: RubricSuggestion) => void;
  onClose: () => void;
}

export function RubricSuggestionPanel({
  workshopId,
  onAcceptSuggestion,
  onClose
}: RubricSuggestionPanelProps) {
  const [suggestions, setSuggestions] = useState<RubricSuggestion[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [editedSuggestion, setEditedSuggestion] = useState<RubricSuggestion | null>(null);

  // Generate suggestions on mount
  useEffect(() => {
    handleGenerate();
  }, []);

  const handleGenerate = async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await fetch(
        `/workshops/${workshopId}/generate-rubric-suggestions`,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            endpoint_name: 'claude-opus-4-5',
            temperature: 0.3,
            include_notes: true
          })
        }
      );

      if (!response.ok) {
        const errorData = await response.json().catch(() => ({ detail: response.statusText }));
        throw new Error(errorData.detail || 'Failed to generate suggestions');
      }

      const data: RubricSuggestion[] = await response.json();
      setSuggestions(data);

      toast.success(`Generated ${data.length} rubric suggestions`);
    } catch (err) {
      const errorMessage = err instanceof Error ? err.message : 'Unknown error';
      setError(errorMessage);
      toast.error(errorMessage);
    } finally {
      setLoading(false);
    }
  };

  const handleEdit = (index: number) => {
    setEditingIndex(index);
    setEditedSuggestion({ ...suggestions[index] });
  };

  const handleSaveEdit = () => {
    if (editingIndex !== null && editedSuggestion) {
      const newSuggestions = [...suggestions];
      newSuggestions[editingIndex] = editedSuggestion;
      setSuggestions(newSuggestions);
      setEditingIndex(null);
      setEditedSuggestion(null);

      toast.success('Suggestion updated');
    }
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setEditedSuggestion(null);
  };

  const handleAccept = (suggestion: RubricSuggestion, index: number) => {
    onAcceptSuggestion(suggestion);

    // Remove accepted suggestion from list
    const newSuggestions = suggestions.filter((_, i) => i !== index);
    setSuggestions(newSuggestions);

    toast.success(`"${suggestion.title}" added to rubric`);
  };

  const handleReject = (index: number) => {
    const suggestion = suggestions[index];
    const newSuggestions = suggestions.filter((_, i) => i !== index);
    setSuggestions(newSuggestions);

    toast.success(`"${suggestion.title}" removed`);
  };

  const toggleJudgeType = (index: number) => {
    const types: Array<'likert' | 'binary' | 'freeform'> = ['likert', 'binary', 'freeform'];
    const suggestion = editingIndex === index ? editedSuggestion : suggestions[index];
    if (!suggestion) return;

    const currentIndex = types.indexOf(suggestion.judgeType);
    const nextType = types[(currentIndex + 1) % types.length];

    if (editingIndex === index && editedSuggestion) {
      setEditedSuggestion({ ...editedSuggestion, judgeType: nextType });
    } else {
      const newSuggestions = [...suggestions];
      newSuggestions[index] = { ...newSuggestions[index], judgeType: nextType };
      setSuggestions(newSuggestions);
    }
  };

  const getJudgeTypeBadgeColor = (type: string) => {
    switch (type) {
      case 'likert':
        return 'bg-blue-100 text-blue-800 hover:bg-blue-200';
      case 'binary':
        return 'bg-green-100 text-green-800 hover:bg-green-200';
      case 'freeform':
        return 'bg-purple-100 text-purple-800 hover:bg-purple-200';
      default:
        return 'bg-gray-100 text-gray-800 hover:bg-gray-200';
    }
  };

  return (
    <Dialog open onOpenChange={onClose}>
      <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-5 w-5 text-blue-500" />
            AI Rubric Suggestions
          </DialogTitle>
          <DialogDescription>
            Review AI-generated evaluation criteria based on participant feedback.
            You can edit, accept, or reject each suggestion.
          </DialogDescription>
        </DialogHeader>

        {loading && (
          <div className="flex flex-col items-center justify-center py-12 space-y-4">
            <Loader2 className="h-12 w-12 animate-spin text-blue-500" />
            <div className="text-center space-y-2">
              <p className="text-lg font-medium">Analyzing feedback...</p>
              <p className="text-sm text-muted-foreground">
                This usually takes 5-10 seconds
              </p>
            </div>
          </div>
        )}

        {error && (
          <Card className="border-red-200 bg-red-50">
            <CardContent className="pt-6">
              <div className="flex items-start gap-3">
                <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                <div className="flex-1">
                  <p className="font-medium text-red-900">Error</p>
                  <p className="text-sm text-red-700 mt-1">{error}</p>
                  <Button
                    onClick={handleGenerate}
                    variant="outline"
                    size="sm"
                    className="mt-3"
                  >
                    Try Again
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && !error && suggestions.length === 0 && (
          <Card>
            <CardContent className="pt-6">
              <div className="text-center py-8">
                <Sparkles className="h-12 w-12 text-gray-400 mx-auto mb-4" />
                <p className="text-lg font-medium text-gray-900">No suggestions generated</p>
                <p className="text-sm text-gray-500 mt-2">
                  The AI couldn't generate suggestions from the available feedback.
                  Try completing more discovery findings first.
                </p>
              </div>
            </CardContent>
          </Card>
        )}

        {!loading && suggestions.length > 0 && (
          <div className="space-y-4">
            {suggestions.map((suggestion, index) => {
              const isEditing = editingIndex === index;
              const displaySuggestion = isEditing ? editedSuggestion : suggestion;

              if (!displaySuggestion) return null;

              return (
                <Card key={index} className="border-2">
                  <CardContent className="pt-6 space-y-4">
                    {/* Title and Judge Type */}
                    <div className="flex items-start justify-between gap-4">
                      {isEditing ? (
                        <Input
                          value={displaySuggestion.title}
                          onChange={(e) =>
                            setEditedSuggestion({
                              ...displaySuggestion,
                              title: e.target.value,
                            })
                          }
                          className="text-lg font-semibold"
                          placeholder="Criterion title"
                        />
                      ) : (
                        <h3 className="text-lg font-semibold flex-1">
                          {displaySuggestion.title}
                        </h3>
                      )}

                      <Badge
                        className={`cursor-pointer ${getJudgeTypeBadgeColor(displaySuggestion.judgeType)}`}
                        onClick={() => toggleJudgeType(index)}
                      >
                        {displaySuggestion.judgeType}
                      </Badge>
                    </div>

                    {/* Description */}
                    <div>
                      <label className="text-sm font-medium text-gray-700">Description</label>
                      {isEditing ? (
                        <Textarea
                          value={displaySuggestion.description}
                          onChange={(e) =>
                            setEditedSuggestion({
                              ...displaySuggestion,
                              description: e.target.value,
                            })
                          }
                          className="mt-1"
                          rows={3}
                          placeholder="Clear definition of what this measures"
                        />
                      ) : (
                        <p className="text-gray-900 mt-1">{displaySuggestion.description}</p>
                      )}
                    </div>

                    {/* Positive */}
                    {displaySuggestion.positive && (
                      <div>
                        <label className="text-sm font-medium text-green-700">Positive</label>
                        {isEditing ? (
                          <Textarea
                            value={displaySuggestion.positive || ''}
                            onChange={(e) =>
                              setEditedSuggestion({
                                ...displaySuggestion,
                                positive: e.target.value,
                              })
                            }
                            className="mt-1"
                            rows={2}
                            placeholder="What excellent responses demonstrate"
                          />
                        ) : (
                          <p className="text-green-900 text-sm mt-1">{displaySuggestion.positive}</p>
                        )}
                      </div>
                    )}

                    {/* Negative */}
                    {displaySuggestion.negative && (
                      <div>
                        <label className="text-sm font-medium text-red-700">Negative</label>
                        {isEditing ? (
                          <Textarea
                            value={displaySuggestion.negative || ''}
                            onChange={(e) =>
                              setEditedSuggestion({
                                ...displaySuggestion,
                                negative: e.target.value,
                              })
                            }
                            className="mt-1"
                            rows={2}
                            placeholder="What poor responses demonstrate"
                          />
                        ) : (
                          <p className="text-red-900 text-sm mt-1">{displaySuggestion.negative}</p>
                        )}
                      </div>
                    )}

                    {/* Examples */}
                    {displaySuggestion.examples && (
                      <div>
                        <label className="text-sm font-medium text-amber-700">Examples</label>
                        {isEditing ? (
                          <Textarea
                            value={displaySuggestion.examples || ''}
                            onChange={(e) =>
                              setEditedSuggestion({
                                ...displaySuggestion,
                                examples: e.target.value,
                              })
                            }
                            className="mt-1"
                            rows={2}
                            placeholder="Concrete examples: 'Good: X. Bad: Y.'"
                          />
                        ) : (
                          <p className="text-amber-900 text-sm mt-1">{displaySuggestion.examples}</p>
                        )}
                      </div>
                    )}

                    {/* Actions */}
                    <div className="flex gap-2 pt-2">
                      {isEditing ? (
                        <>
                          <Button
                            onClick={handleSaveEdit}
                            variant="default"
                            size="sm"
                            className="flex-1"
                          >
                            <Check className="h-4 w-4 mr-2" />
                            Save Changes
                          </Button>
                          <Button
                            onClick={handleCancelEdit}
                            variant="outline"
                            size="sm"
                            className="flex-1"
                          >
                            <X className="h-4 w-4 mr-2" />
                            Cancel
                          </Button>
                        </>
                      ) : (
                        <>
                          <Button
                            onClick={() => handleAccept(displaySuggestion, index)}
                            variant="default"
                            size="sm"
                            className="flex-1 bg-green-600 hover:bg-green-700"
                          >
                            <Check className="h-4 w-4 mr-2" />
                            Add to Rubric
                          </Button>
                          <Button
                            onClick={() => handleEdit(index)}
                            variant="outline"
                            size="sm"
                          >
                            <Edit2 className="h-4 w-4" />
                          </Button>
                          <Button
                            onClick={() => handleReject(index)}
                            variant="outline"
                            size="sm"
                          >
                            <X className="h-4 w-4" />
                          </Button>
                        </>
                      )}
                    </div>
                  </CardContent>
                </Card>
              );
            })}

            {/* Generate More Button */}
            <div className="flex justify-center pt-4">
              <Button
                onClick={handleGenerate}
                variant="outline"
                className="w-full"
                disabled={loading}
              >
                <Sparkles className="h-4 w-4 mr-2" />
                Generate More Suggestions
              </Button>
            </div>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
