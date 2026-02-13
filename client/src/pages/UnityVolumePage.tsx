import React, { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useQuery } from '@tanstack/react-query';
import {
  Download,
  Database,
  AlertCircle,
  Loader2,
  Info
} from 'lucide-react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useWorkshop } from '@/hooks/useWorkshopApi';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';

export function UnityVolumePage() {
  const { workshopId } = useWorkshopContext();
  const { data: workshop } = useWorkshop(workshopId!);

  const [isDownloading, setIsDownloading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // Get workshop statistics
  const { data: traces } = useQuery({
    queryKey: ['all-traces', workshopId],
    queryFn: async () => {
      if (!workshopId) return [];
      const response = await fetch(`/workshops/${workshopId}/all-traces`);
      if (!response.ok) throw new Error('Failed to fetch traces');
      return response.json();
    },
    enabled: !!workshopId,
  });

  const { data: annotations } = useQuery({
    queryKey: ['annotations', workshopId],
    queryFn: async () => {
      if (!workshopId) return [];
      const response = await fetch(`/workshops/${workshopId}/annotations`);
      if (!response.ok) throw new Error('Failed to fetch annotations');
      return response.json();
    },
    enabled: !!workshopId,
  });

  const handleDownload = async () => {
    setIsDownloading(true);
    setError(null);

    try {
      const response = await fetch(`/workshops/${workshopId}/download-database`);

      if (!response.ok) {
        throw new Error('Failed to download database');
      }

      // Create blob and download
      const blob = await response.blob();
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `workshop_${workshopId}_${new Date().toISOString().split('T')[0]}.db`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);

      toast.success('Workshop database downloaded successfully!');

    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Failed to download database';
      setError(message);
      toast.error('Failed to download database');
    } finally {
      setIsDownloading(false);
    }
  };


  return (
    <div className="max-w-3xl mx-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 pb-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-100">
          <Download className="w-5 h-5 text-teal-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">Download Workshop Data</h1>
          <p className="text-sm text-gray-500">
            Export workshop database for offline analysis
          </p>
        </div>
        <div className="ml-auto flex items-center gap-2">
          <Badge className="bg-blue-50 text-blue-700 border border-blue-200">
            {traces?.length || 0} traces
          </Badge>
          <Badge className="bg-green-50 text-green-700 border border-green-200">
            {annotations?.length || 0} annotations
          </Badge>
        </div>
      </div>

      {/* Download Card */}
      <Card className="border-l-4 border-blue-500">
        <CardContent className="p-4 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-1">
              <Download className="w-4 h-4 text-blue-600" />
              Download Database
            </h3>
            <p className="text-xs text-gray-500">
              Download the complete workshop database file to your local machine.
            </p>
          </div>

          <div className="bg-blue-50 rounded-md px-3 py-2 border border-blue-100">
            <div className="flex items-start gap-2">
              <Info className="w-3.5 h-3.5 text-blue-600 mt-0.5 shrink-0" />
              <p className="text-xs text-blue-700">
                Includes all traces, annotations, rubric data, and workshop configuration. Compatible with SQLite tools for offline analysis.
              </p>
            </div>
          </div>

          <Button
            onClick={handleDownload}
            disabled={isDownloading}
            className="w-full"
            size="sm"
          >
            {isDownloading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Downloading...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Download Workshop Database
              </>
            )}
          </Button>

          {error && (
            <Alert variant="destructive">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="text-xs">{error}</AlertDescription>
            </Alert>
          )}
        </CardContent>
      </Card>

      {/* Workshop Info */}
      <Card className="border-l-4 border-gray-500">
        <CardContent className="p-4">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <Info className="w-4 h-4 text-gray-600" />
            Database Contents
          </h3>
          <div className="grid grid-cols-3 gap-3">
            <div className="text-center p-3 bg-blue-50 rounded-md">
              <div className="text-xl font-bold text-blue-600">
                {traces?.length || 0}
              </div>
              <div className="text-xs text-gray-600">Traces</div>
            </div>
            <div className="text-center p-3 bg-green-50 rounded-md">
              <div className="text-xl font-bold text-green-600">
                {annotations?.length || 0}
              </div>
              <div className="text-xs text-gray-600">Annotations</div>
            </div>
            <div className="text-center p-3 bg-gray-50 rounded-md">
              <div className="text-xl font-bold text-gray-600">
                {workshop?.name ? '✓' : '—'}
              </div>
              <div className="text-xs text-gray-600">Rubric</div>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
