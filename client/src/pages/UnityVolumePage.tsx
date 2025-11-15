import React, { useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useQuery } from '@tanstack/react-query';
import { 
  Upload, 
  Download, 
  Database, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  Info,
  FileText,
  Cloud,
  HardDrive
} from 'lucide-react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useWorkshop } from '@/hooks/useWorkshopApi';
import { toast } from 'sonner';

export function UnityVolumePage() {
  const { workshopId } = useWorkshopContext();
  const { data: workshop } = useWorkshop(workshopId!);
  
  // Form state
  const [databricksHost, setDatabricksHost] = useState('');
  const [databricksToken, setDatabricksToken] = useState('');
  const [volumePath, setVolumePath] = useState('');
  const [fileName, setFileName] = useState(`workshop_${workshopId}.db`);
  const [isUploading, setIsUploading] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [uploadProgress, setUploadProgress] = useState(0);
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

  const handleUpload = async () => {
    if (!databricksHost.trim() || !databricksToken.trim() || !volumePath.trim() || !fileName.trim()) {
      setError('Please provide all required fields: Databricks host, token, volume path, and file name');
      return;
    }

    setIsUploading(true);
    setUploadProgress(0);
    setError(null);

    try {
      // Simulate upload progress
      const progressInterval = setInterval(() => {
        setUploadProgress(prev => {
          if (prev >= 90) {
            clearInterval(progressInterval);
            return 90;
          }
          return prev + 10;
        });
      }, 200);

      const response = await fetch(`/workshops/${workshopId}/upload-to-volume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          databricks_host: databricksHost,
          databricks_token: databricksToken,
          volume_path: volumePath,
          file_name: fileName,
        }),
      });

      clearInterval(progressInterval);
      setUploadProgress(100);

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to upload to volume');
      }

      const result = await response.json();
      toast.success('Workshop database uploaded to Unity volume successfully!');
      
      // Reset progress after a delay
      setTimeout(() => {
        setUploadProgress(0);
      }, 2000);

    } catch (err: any) {
      
      setError(err.message || 'Failed to upload to volume');
      toast.error('Failed to upload to volume');
    } finally {
      setIsUploading(false);
    }
  };

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

    } catch (err: any) {
      
      setError(err.message || 'Failed to download database');
      toast.error('Failed to download database');
    } finally {
      setIsDownloading(false);
    }
  };


  return (
    <div className="min-h-screen bg-gray-50 p-6">
      <div className="max-w-4xl mx-auto space-y-6">
        {/* Header */}
        <div className="text-center">
          <h1 className="text-3xl font-bold text-gray-900 mb-2">Manage Workshop Data</h1>
          <p className="text-lg text-gray-600">
            Upload workshop data to Unity Volume or download locally for analysis
          </p>
        </div>

        {/* Workshop Statistics */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Database className="h-5 w-5" />
              Workshop Database Summary
            </CardTitle>
            <CardDescription>
              Overview of the data that will be uploaded/downloaded
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <div className="text-center p-4 bg-blue-50 rounded-lg">
                <div className="text-2xl font-bold text-blue-600">
                  {traces?.length || 0}
                </div>
                <div className="text-sm text-gray-600">Total Traces</div>
              </div>
              <div className="text-center p-4 bg-green-50 rounded-lg">
                <div className="text-2xl font-bold text-green-600">
                  {annotations?.length || 0}
                </div>
                <div className="text-sm text-gray-600">Total Annotations</div>
              </div>
              <div className="text-center p-4 bg-purple-50 rounded-lg">
                <div className="text-2xl font-bold text-purple-600">
                  {workshop?.name || 'Workshop'}
                </div>
                <div className="text-sm text-gray-600">Workshop Name</div>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* Upload to Unity Volume */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Cloud className="h-5 w-5" />
              Upload to Unity Volume
            </CardTitle>
            <CardDescription>
              Upload the workshop database to a Unity Catalog volume for sharing and analysis
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                The volume path should be in the format: <code>catalog.schema.volume_name</code>
                <br />
                Example: <code>main.default.workshop_data</code>
              </AlertDescription>
            </Alert>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="databricks-host-upload">Databricks Host</Label>
                <Input
                  id="databricks-host-upload"
                  placeholder="https://your-workspace.cloud.databricks.com"
                  value={databricksHost}
                  onChange={(e) => setDatabricksHost(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="databricks-token-upload">Databricks Token</Label>
                <Input
                  id="databricks-token-upload"
                  type="password"
                  placeholder="dapi..."
                  value={databricksToken}
                  onChange={(e) => setDatabricksToken(e.target.value)}
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="volume-path">Volume Path</Label>
                <Input
                  id="volume-path"
                  placeholder="catalog.schema.volume_name"
                  value={volumePath}
                  onChange={(e) => setVolumePath(e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="file-name">File Name</Label>
                <Input
                  id="file-name"
                  placeholder="workshop_database.db"
                  value={fileName}
                  onChange={(e) => setFileName(e.target.value)}
                />
              </div>
            </div>

            <Button
              onClick={handleUpload}
              disabled={isUploading || !databricksHost.trim() || !databricksToken.trim() || !volumePath.trim() || !fileName.trim()}
              className="w-full"
              variant="outline"
            >
              {isUploading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Uploading to Volume... {uploadProgress}%
                </>
              ) : (
                <>
                  <Upload className="mr-2 h-4 w-4" />
                  Upload to Unity Volume
                </>
              )}
            </Button>

            {uploadProgress > 0 && (
              <div className="w-full bg-gray-200 rounded-full h-2">
                <div 
                  className="bg-blue-600 h-2 rounded-full transition-all duration-300" 
                  style={{ width: `${uploadProgress}%` }}
                ></div>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Download Database */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <HardDrive className="h-5 w-5" />
              Download Database
            </CardTitle>
            <CardDescription>
              Download the workshop database file to your local machine
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <Alert>
              <Info className="h-4 w-4" />
              <AlertDescription>
                This will download the complete workshop database including all traces, annotations, 
                rubric data, and workshop configuration.
              </AlertDescription>
            </Alert>

            <Button
              onClick={handleDownload}
              disabled={isDownloading}
              className="w-full"
              variant="outline"
            >
              {isDownloading ? (
                <>
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                  Downloading Database...
                </>
              ) : (
                <>
                  <Download className="mr-2 h-4 w-4" />
                  Download Workshop Database
                </>
              )}
            </Button>
          </CardContent>
        </Card>

        {/* Error Display */}
        {error && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        {/* Help Section */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2">
              <Info className="h-5 w-5" />
              How It Works
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <h4 className="font-medium mb-2">Unity Volume Upload</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Uploads the complete workshop.db file</li>
                  <li>• Uses provided Databricks credentials (not stored)</li>
                  <li>• Stores in Unity Catalog for team access</li>
                  <li>• Enables sharing and collaboration</li>
                  <li>• Supports version control and backup</li>
                </ul>
              </div>
              <div>
                <h4 className="font-medium mb-2">Local Download</h4>
                <ul className="text-sm text-gray-600 space-y-1">
                  <li>• Downloads the complete database file</li>
                  <li>• Includes all workshop data and history</li>
                  <li>• Can be used for offline analysis</li>
                  <li>• Compatible with SQLite tools</li>
                </ul>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
