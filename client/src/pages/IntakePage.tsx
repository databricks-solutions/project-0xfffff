import React, { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Loader2, CheckCircle, AlertCircle, Database, Settings, Download, Upload, FileText, Trash2, RotateCcw } from 'lucide-react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { toast } from 'sonner';
import { useWorkflowContext } from '@/context/WorkflowContext';
import { useQueryClient } from '@tanstack/react-query';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from "@/components/ui/alert-dialog";

interface MLflowConfig {
  databricks_host: string;
  databricks_token: string;
  experiment_id: string;
  max_traces: number;
  filter_string?: string;
}

interface MLflowStatus {
  workshop_id: string;
  is_configured: boolean;
  is_ingested: boolean;
  trace_count: number;
  last_ingestion_time?: string;
  error_message?: string;
  config?: MLflowConfig;
}


export function IntakePage() {
  const { workshopId } = useWorkshopContext();
  const { setCurrentPhase } = useWorkflowContext();
  const queryClient = useQueryClient();

  // Load MLflow config from localStorage on initial mount
  const getInitialConfig = (): MLflowConfig => {
    try {
      const saved = localStorage.getItem('mlflow_config');
      if (saved) {
        const parsed = JSON.parse(saved);
        return {
          databricks_host: parsed.databricks_host || '',
          databricks_token: parsed.databricks_token || '',
          experiment_id: parsed.experiment_id || '',
          max_traces: parsed.max_traces || 100,
          filter_string: parsed.filter_string || ''
        };
      }
    } catch (e) {
      // Ignore localStorage errors
    }
    return {
    databricks_host: '',
    databricks_token: '',
    experiment_id: '',
    max_traces: 100,
    filter_string: ''
    };
  };

  const [config, setConfig] = useState<MLflowConfig>(getInitialConfig);

  const [status, setStatus] = useState<MLflowStatus | null>(null);
  const [isIngesting, setIsIngesting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [csvFile, setCsvFile] = useState<File | null>(null);
  const [isUploadingCsv, setIsUploadingCsv] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [csvImportDestination, setCsvImportDestination] = useState<'discovery' | 'mlflow' | null>(null);

  // Save config to localStorage whenever it changes
  useEffect(() => {
    if (config.databricks_host || config.databricks_token || config.experiment_id) {
      try {
        localStorage.setItem('mlflow_config', JSON.stringify(config));
      } catch (e) {
        // Ignore localStorage errors
      }
    }
  }, [config]);

  // Load existing configuration and status
  useEffect(() => {
    loadStatus();
  }, [workshopId]);

  const loadStatus = async () => {
    if (!workshopId) {

      return;
    }

    try {
      const response = await fetch(`/workshops/${workshopId}/mlflow-status`);
      if (response.ok) {
        const statusData = await response.json();
        setStatus(statusData);

        // Merge backend config with existing config (prefer backend values if present)
        if (statusData.config) {
          setConfig(prev => ({
            ...prev,
            databricks_host: statusData.config.databricks_host || prev.databricks_host,
            databricks_token: statusData.config.databricks_token || prev.databricks_token,
            experiment_id: statusData.config.experiment_id || prev.experiment_id,
            max_traces: statusData.config.max_traces || prev.max_traces,
            filter_string: statusData.config.filter_string || prev.filter_string
          }));
        }
      }
    } catch (err) {

    }
  };

  const handleConfigChange = (field: keyof MLflowConfig, value: string | number) => {
    setConfig(prev => ({
      ...prev,
      [field]: value
    }));
  };


  const ingestTraces = async () => {
    if (!workshopId) {
      setError('No workshop available. Please create a workshop first.');
      return;
    }

    if (!config.databricks_host || !config.databricks_token || !config.experiment_id) {
      setError('Please fill in all required fields: Databricks Host, Token, and Experiment ID.');
      return;
    }

    setIsIngesting(true);
    setError(null);

    try {


      // First, save the configuration (which stores the token in memory)

      const configResponse = await fetch(`/workshops/${workshopId}/mlflow-config`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify(config),
      });

      if (!configResponse.ok) {
        const errorData = await configResponse.json();
        setError(errorData.detail || 'Failed to save configuration');
        return;
      }


      // Then, ingest traces (token will be retrieved from memory)

      const response = await fetch(`/workshops/${workshopId}/mlflow-ingest`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}), // No need to send token - it's retrieved from memory
      });



      if (response.ok) {
        const result = await response.json();

        await loadStatus();

        // Invalidate trace caches to ensure new traces are visible
        queryClient.invalidateQueries({ queryKey: ['traces', workshopId] });
        queryClient.invalidateQueries({ queryKey: ['all-traces', workshopId] });

        if (result.trace_count === 0) {
          toast.info('Traces from this experiment have already been ingested. No new traces were added.');
        } else {
          toast.success(`Successfully ingested ${result.trace_count} traces!`);
        }
      } else if (response.status === 404) {
        setError('Workshop or MLflow endpoint not found. Please check your configuration and try again.');
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.detail || `Failed to ingest traces (HTTP ${response.status})`);
      }
    } catch (err) {

      setError('Network error: Unable to connect to the server. Please check your connection and try again.');
    } finally {

      setIsIngesting(false);
    }
  };

  const uploadCsvFile = async () => {
    if (!workshopId) {
      setError('No workshop available. Please create a workshop first.');
      return;
    }

    if (!csvFile) {
      setError('Please select a CSV file to upload.');
      return;
    }

    setIsUploadingCsv(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', csvFile);

      const response = await fetch(`/workshops/${workshopId}/csv-upload`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();

        await loadStatus();

        // Invalidate trace caches to ensure new traces are visible
        queryClient.invalidateQueries({ queryKey: ['traces', workshopId] });
        queryClient.invalidateQueries({ queryKey: ['all-traces', workshopId] });

        toast.success(`Successfully uploaded ${result.trace_count} traces from CSV!`);
        setCsvFile(null); // Clear the file input
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.detail || `Failed to upload CSV (HTTP ${response.status})`);
      }
    } catch (err) {
      setError('Network error: Unable to connect to the server. Please check your connection and try again.');
    } finally {
      setIsUploadingCsv(false);
    }
  };

  const uploadCsvToMlflow = async () => {
    if (!workshopId) {
      setError('No workshop available. Please create a workshop first.');
      return;
    }

    if (!csvFile) {
      setError('Please select a CSV file to upload.');
      return;
    }

    if (!config.databricks_host || !config.databricks_token || !config.experiment_id) {
      setError('Please configure MLflow settings (Databricks Host, Token, and Experiment ID) before uploading.');
      return;
    }

    setIsUploadingCsv(true);
    setError(null);

    try {
      const formData = new FormData();
      formData.append('file', csvFile);
      formData.append('databricks_host', config.databricks_host);
      formData.append('databricks_token', config.databricks_token);
      formData.append('experiment_id', config.experiment_id);

      const response = await fetch(`/workshops/${workshopId}/csv-upload-to-mlflow`, {
        method: 'POST',
        body: formData,
      });

      if (response.ok) {
        const result = await response.json();

        toast.success(`Successfully created ${result.mlflow_traces_created} MLflow traces! Use "Import from MLflow" to bring them into Discovery.`);
        setCsvFile(null);

        if (result.warnings && result.warnings.length > 0) {
          toast.warning(`${result.warnings.length} rows had issues. Check console for details.`);
          console.warn('CSV upload warnings:', result.warnings);
        }
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.detail || `Failed to upload CSV to MLflow (HTTP ${response.status})`);
      }
    } catch (err) {
      setError('Network error: Unable to connect to the server. Please check your connection and try again.');
    } finally {
      setIsUploadingCsv(false);
    }
  };

  const deleteAllTraces = async () => {
    if (!workshopId) {
      setError('No workshop available.');
      return;
    }

    setIsDeleting(true);
    setError(null);

    try {
      const response = await fetch(`/workshops/${workshopId}/traces`, {
        method: 'DELETE',
      });

      if (response.ok) {
        const result = await response.json();

        await loadStatus();

        // Invalidate ALL workshop-related caches for a complete reset
        queryClient.invalidateQueries({ queryKey: ['traces', workshopId] });
        queryClient.invalidateQueries({ queryKey: ['all-traces', workshopId] });
        queryClient.invalidateQueries({ queryKey: ['workshop', workshopId] });
        queryClient.invalidateQueries({ queryKey: ['rubric', workshopId] });
        queryClient.invalidateQueries({ queryKey: ['annotations', workshopId] });
        queryClient.invalidateQueries({ queryKey: ['findings', workshopId] });
        queryClient.invalidateQueries({ queryKey: ['judge-prompts', workshopId] });
        queryClient.invalidateQueries({ queryKey: ['irr', workshopId] });
        queryClient.invalidateQueries({ queryKey: ['mlflowConfig', workshopId] });
        // Invalidate any queries that contain this workshopId (catches all variations)
        queryClient.invalidateQueries({
          predicate: (query) => {
            const key = query.queryKey;
            return Array.isArray(key) && key.some(k => k === workshopId);
          }
        });

        toast.success(`Deleted ${result.deleted_count} traces. Workshop reset to intake phase.`);
      } else {
        const errorData = await response.json().catch(() => ({}));
        setError(errorData.detail || `Failed to delete traces (HTTP ${response.status})`);
      }
    } catch (err) {
      setError('Network error: Unable to connect to the server.');
    } finally {
      setIsDeleting(false);
    }
  };


  return (
    <div className="max-w-4xl mx-auto p-6 space-y-5">
      {/* Header */}
      <div className="flex items-center gap-3 pb-2">
        <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-blue-100">
          <Database className="w-5 h-5 text-blue-600" />
        </div>
        <div>
          <h1 className="text-xl font-semibold text-gray-900">MLflow Trace Intake</h1>
          <p className="text-sm text-gray-500">
            Pull traces from Databricks workspace to begin the workshop.
          </p>
        </div>
      </div>

      {/* Status Card */}
      <Card className="border-l-4 border-blue-500">
        <CardContent className="p-4">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-3">
            <Database className="w-4 h-4 text-blue-600" />
            Intake Status
          </h3>
          {status ? (
            <div className="space-y-3">
              <div className="flex items-center gap-2">
                <Badge className={status.is_configured ? "bg-indigo-50 text-indigo-700 border border-indigo-200" : "bg-gray-100 text-gray-600 border border-gray-200"}>
                  {status.is_configured ? "Configured" : "Not Configured"}
                </Badge>
                <Badge className={status.is_ingested ? "bg-green-50 text-green-700 border border-green-200" : "bg-gray-100 text-gray-600 border border-gray-200"}>
                  {status.is_ingested ? "Ingested" : "Not Ingested"}
                </Badge>
                {status.trace_count > 0 && (
                  <Badge className="bg-blue-50 text-blue-700 border border-blue-200">
                    {status.trace_count} traces
                  </Badge>
                )}
              </div>

              {status.last_ingestion_time && (
                <p className="text-xs text-gray-500">
                  Last ingested: {new Date(status.last_ingestion_time).toLocaleString()}
                </p>
              )}

              {status.error_message && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="text-xs">{status.error_message}</AlertDescription>
                </Alert>
              )}
            </div>
          ) : (
            <p className="text-sm text-gray-500">Loading status...</p>
          )}
        </CardContent>
      </Card>

      {/* Configuration Card */}
      <Card className="border-l-4 border-amber-500">
        <CardContent className="p-4 space-y-4">
          <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2">
            <Settings className="w-4 h-4 text-amber-600" />
            MLflow Configuration
          </h3>
          <p className="text-xs text-gray-500">Configure your Databricks workspace and MLflow experiment details.</p>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="databricks_host" className="text-xs font-medium text-gray-600">Databricks Host</Label>
              <Input
                id="databricks_host"
                placeholder="https://je2-demo-field-eng.cloud.databricks.com"
                value={config.databricks_host}
                onChange={(e) => handleConfigChange('databricks_host', e.target.value)}
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="experiment_id" className="text-xs font-medium text-gray-600">Experiment ID</Label>
              <Input
                id="experiment_id"
                placeholder="2452310130191209"
                value={config.experiment_id}
                onChange={(e) => handleConfigChange('experiment_id', e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="databricks_token" className="text-xs font-medium text-gray-600">Databricks Token</Label>
            <Input
              id="databricks_token"
              type="password"
              placeholder="dapi..."
              value={config.databricks_token}
              onChange={(e) => handleConfigChange('databricks_token', e.target.value)}
              className="h-9"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label htmlFor="max_traces" className="text-xs font-medium text-gray-600">Max Traces</Label>
              <Input
                id="max_traces"
                type="number"
                min="1"
                max="1000"
                value={config.max_traces}
                onChange={(e) => handleConfigChange('max_traces', parseInt(e.target.value))}
                className="h-9"
              />
            </div>

            <div className="space-y-1.5">
              <Label htmlFor="filter_string" className="text-xs font-medium text-gray-600">Filter String (Optional)</Label>
              <Input
                id="filter_string"
                placeholder="attributes.status = 'OK'"
                value={config.filter_string || ''}
                onChange={(e) => handleConfigChange('filter_string', e.target.value)}
                className="h-9"
              />
            </div>
          </div>

          <Button
            onClick={ingestTraces}
            disabled={isIngesting || !config.databricks_host || !config.databricks_token || !config.experiment_id}
            className="w-full"
            size="sm"
          >
            {isIngesting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Ingesting Traces...
              </>
            ) : (
              <>
                <Download className="mr-2 h-4 w-4" />
                Import from MLflow
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

      {/* CSV Upload Card */}
      <Card className="border-l-4 border-green-500">
        <CardContent className="p-4 space-y-4">
          <div>
            <h3 className="text-base font-semibold text-gray-900 flex items-center gap-2 mb-1">
              <Upload className="w-4 h-4 text-green-600" />
              Upload Traces from CSV
            </h3>
            <p className="text-xs text-gray-500">
              CSV must have "request_preview" and "response_preview" columns. Optionally log to MLflow.
            </p>
          </div>

          <div className="border-2 border-dashed border-gray-200 rounded-lg p-4 text-center bg-gray-50/50">
            <FileText className="h-8 w-8 mx-auto mb-2 text-gray-400" />
            <div className="mb-3">
              <label htmlFor="csv-upload" className="cursor-pointer">
                <input
                  id="csv-upload"
                  type="file"
                  accept=".csv"
                  className="hidden"
                  onChange={(e) => {
                    if (e.target.files && e.target.files[0]) {
                      setCsvFile(e.target.files[0]);
                      setError(null);
                    }
                  }}
                />
                <Button variant="outline" type="button" size="sm" asChild>
                  <span>
                    <FileText className="mr-2 h-3.5 w-3.5" />
                    Select CSV File
                  </span>
                </Button>
              </label>
            </div>
            {csvFile && (
              <p className="text-xs text-gray-600 mb-2">
                <span className="font-medium">{csvFile.name}</span>
              </p>
            )}
            <p className="text-xs text-gray-400">
              Required: "request_preview" and "response_preview" columns
            </p>
          </div>

          {/* Import destination options */}
          <div className="space-y-2">
            <Label className="text-xs font-medium text-gray-600">Import destination:</Label>
            <div className="space-y-2">
              <div
                className={`flex items-center space-x-3 p-2.5 rounded-md border cursor-pointer transition-colors ${
                  csvImportDestination === 'discovery'
                    ? 'border-blue-500 bg-blue-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setCsvImportDestination('discovery')}
              >
                <input
                  type="radio"
                  id="import-discovery"
                  name="csv-import-destination"
                  checked={csvImportDestination === 'discovery'}
                  onChange={() => setCsvImportDestination('discovery')}
                  className="h-3.5 w-3.5 text-blue-600 focus:ring-blue-500"
                />
                <div className="flex-1">
                  <label htmlFor="import-discovery" className="text-sm font-medium text-gray-700 cursor-pointer">
                    Import directly into Discovery
                  </label>
                  <p className="text-xs text-gray-500">Add traces to workshop for immediate use</p>
                </div>
              </div>

              <div
                className={`flex items-center space-x-3 p-2.5 rounded-md border cursor-pointer transition-colors ${
                  csvImportDestination === 'mlflow'
                    ? 'border-purple-500 bg-purple-50'
                    : 'border-gray-200 hover:border-gray-300'
                }`}
                onClick={() => setCsvImportDestination('mlflow')}
              >
                <input
                  type="radio"
                  id="import-mlflow"
                  name="csv-import-destination"
                  checked={csvImportDestination === 'mlflow'}
                  onChange={() => setCsvImportDestination('mlflow')}
                  className="h-3.5 w-3.5 text-purple-600 focus:ring-purple-500"
                />
                <div className="flex-1">
                  <label htmlFor="import-mlflow" className="text-sm font-medium text-gray-700 cursor-pointer">
                    Log to MLflow as traces
                  </label>
                  <p className="text-xs text-gray-500">Create MLflow traces only (use "Import from MLflow" to add later)</p>
                </div>
              </div>
            </div>
          </div>

          {csvImportDestination === 'mlflow' && (!config.databricks_host || !config.databricks_token || !config.experiment_id) && (
            <Alert className="bg-amber-50 border-amber-200">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-700 text-xs">
                Please configure MLflow settings above to log traces to MLflow.
              </AlertDescription>
            </Alert>
          )}

          <Button
            onClick={csvImportDestination === 'mlflow' ? uploadCsvToMlflow : uploadCsvFile}
            disabled={isUploadingCsv || !csvFile || !csvImportDestination || (csvImportDestination === 'mlflow' && (!config.databricks_host || !config.databricks_token || !config.experiment_id))}
            className="w-full"
            size="sm"
          >
            {isUploadingCsv ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                {csvImportDestination === 'mlflow' ? 'Creating MLflow Traces...' : 'Uploading...'}
              </>
            ) : (
              <>
                <Upload className="mr-2 h-4 w-4" />
                {csvImportDestination === 'mlflow' ? 'Upload & Log to MLflow' : csvImportDestination === 'discovery' ? 'Upload to Discovery' : 'Select destination above'}
              </>
            )}
          </Button>
        </CardContent>
      </Card>

      {/* Reset Card */}
      <Card className="border-l-4 border-red-500">
        <CardContent className="p-4">
          <div className="flex items-start gap-3 mb-3">
            <RotateCcw className="w-4 h-4 text-red-600 mt-0.5" />
            <div className="flex-1">
              <h3 className="text-base font-semibold text-red-800">Reset & Start Over</h3>
              <p className="text-xs text-red-700 mt-0.5">
                {status?.trace_count && status.trace_count > 0
                  ? `Delete all ${status.trace_count} traces and reset workshop to start fresh.`
                  : 'Reset the workshop and clear all progress.'}
              </p>
            </div>
          </div>
          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="outline"
                disabled={isDeleting}
                className="w-full border-red-300 text-red-700 hover:bg-red-50"
                size="sm"
              >
                {isDeleting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    Resetting...
                  </>
                ) : (
                  <>
                    <Trash2 className="mr-2 h-4 w-4" />
                    Delete All & Reset Workshop
                  </>
                )}
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent>
              <AlertDialogHeader>
                <AlertDialogTitle>Are you absolutely sure?</AlertDialogTitle>
                <AlertDialogDescription>
                  {status?.trace_count && status.trace_count > 0
                    ? `This will permanently delete all ${status.trace_count} traces and reset the workshop to the intake phase. All annotations, findings, and progress will be lost. This action cannot be undone.`
                    : 'This will reset the workshop to the intake phase and clear all progress. This action cannot be undone.'}
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel>Cancel</AlertDialogCancel>
                <AlertDialogAction
                  onClick={deleteAllTraces}
                  className="bg-red-600 hover:bg-red-700"
                >
                  Delete All & Reset
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </CardContent>
      </Card>

    </div>
  );
}
