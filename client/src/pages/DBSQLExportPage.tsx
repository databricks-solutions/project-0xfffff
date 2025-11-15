import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { 
  Database, 
  CheckCircle, 
  AlertCircle, 
  Loader2,
  ExternalLink,
  Copy,
  BarChart3,
  Download,
  Settings,
  FileText,
  Users,
  Star,
  Info,
  Table,
  Upload
} from 'lucide-react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useWorkshop } from '@/hooks/useWorkshopApi';

interface ExportStatus {
  workshop_id: string;
  export_ready: boolean;
  data_summary: {
    rubrics_count: number;
    annotations_count: number;
    traces_count: number;
    judge_prompts_count: number;
    users_count: number;
  };
  export_requirements: {
    has_rubrics: boolean;
    has_annotations: boolean;
    has_traces: boolean;
    has_judge_prompts: boolean;
    has_users: boolean;
  };
}

export function DBSQLExportPage() {
  const { workshopId } = useWorkshopContext();
  const { data: workshop } = useWorkshop(workshopId);
  const queryClient = useQueryClient();
  
  // Load state from localStorage on component mount
  const loadStateFromStorage = () => {
    if (!workshopId) return {};
    
    const storageKey = `dbsql-export-state-${workshopId}`;
    const storedData = localStorage.getItem(storageKey);
    if (storedData) {
      try {
        const parsed = JSON.parse(storedData);
        // Only load if data is less than 24 hours old
        if (Date.now() - parsed.timestamp < 24 * 60 * 60 * 1000) {
          return parsed.state;
        } else {
          localStorage.removeItem(storageKey);
        }
      } catch (error) {
        
        localStorage.removeItem(storageKey);
      }
    }
    return {};
  };
  
  const [databricksHost, setDatabricksHost] = useState(() => loadStateFromStorage().databricksHost || '');
  const [databricksToken, setDatabricksToken] = useState(() => loadStateFromStorage().databricksToken || '');
  const [httpPath, setHttpPath] = useState(() => loadStateFromStorage().httpPath || '');
  const [catalog, setCatalog] = useState(() => loadStateFromStorage().catalog || '');
  const [schemaName, setSchemaName] = useState(() => loadStateFromStorage().schemaName || '');
  
  // Volume upload state
  const [volumePath, setVolumePath] = useState(() => loadStateFromStorage().volumePath || '');
  const [fileName, setFileName] = useState(() => loadStateFromStorage().fileName || '');
  const [isUploading, setIsUploading] = useState(false);
  const [uploadResult, setUploadResult] = useState<any>(null);
  const [uploadError, setUploadError] = useState<string | null>(null);
  
  const [isExporting, setIsExporting] = useState(false);
  const [isCheckingStatus, setIsCheckingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [scrollPosition, setScrollPosition] = useState(0);

  // Use React Query to cache export results
  const { data: exportResult } = useQuery({
    queryKey: ['dbsql-export-result', workshopId],
    queryFn: async () => {
      // This will be populated when export is successful
      return null;
    },
    staleTime: Infinity, // Never consider stale
    cacheTime: Infinity, // Never expire from cache
  });

  // Use React Query to cache export status
  const { data: exportStatus, refetch: refetchExportStatus } = useQuery({
    queryKey: ['dbsql-export-status', workshopId],
    queryFn: async () => {
      if (!workshopId) return null;
      const response = await fetch(`/dbsql-export/${workshopId}/export-status`);
      if (response.ok) {
        return await response.json();
      }
      throw new Error('Failed to check export status');
    },
    enabled: !!workshopId,
    staleTime: 5 * 60 * 1000, // 5 minutes
  });

  // Save state to localStorage whenever form fields change
  const saveStateToStorage = (newState: any) => {
    if (!workshopId) return;
    
    const storageKey = `dbsql-export-state-${workshopId}`;
    const stateToSave = {
      databricksHost,
      databricksToken,
      httpPath,
      catalog,
      schemaName,
      scrollPosition,
      ...newState
    };
    
    localStorage.setItem(storageKey, JSON.stringify({
      state: stateToSave,
      timestamp: Date.now()
    }));
  };

  // Save state when form fields change
  useEffect(() => {
    saveStateToStorage({});
  }, [databricksHost, databricksToken, httpPath, catalog, schemaName]);

  // Track scroll position
  useEffect(() => {
    const handleScroll = () => {
      const scrollY = window.scrollY;
      setScrollPosition(scrollY);
      saveStateToStorage({ scrollPosition: scrollY });
    };

    window.addEventListener('scroll', handleScroll);
    return () => window.removeEventListener('scroll', handleScroll);
  }, []);

  // Restore scroll position when component mounts
  useEffect(() => {
    if (scrollPosition > 0) {
      window.scrollTo(0, scrollPosition);
    }
  }, [scrollPosition]);

  // Auto-check export status when component loads
  useEffect(() => {
    if (workshopId) {
      refetchExportStatus();
    }
  }, [workshopId, refetchExportStatus]);

  const checkExportStatus = async () => {
    if (!workshopId) return;
    
    setIsCheckingStatus(true);
    setError(null);
    
    try {
      await refetchExportStatus();
    } catch (err) {
      setError('Failed to check export status');
    } finally {
      setIsCheckingStatus(false);
    }
  };

  const exportToDBSQL = async () => {
    if (!workshopId || !databricksHost || !databricksToken || !httpPath || !catalog || !schemaName) {
      setError('Please provide all required DBSQL configuration fields');
      return;
    }
    
    setIsExporting(true);
    setError(null);
    
    try {
      const response = await fetch(`/dbsql-export/${workshopId}/export`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          databricks_host: databricksHost,
          databricks_token: databricksToken,
          http_path: httpPath,
          catalog: catalog,
          schema_name: schemaName
        }),
      });
      
      if (response.ok) {
        const result = await response.json();
        // Cache the export result using React Query
        queryClient.setQueryData(['dbsql-export-result', workshopId], result);
      } else {
        const errorData = await response.json();
        setError(typeof errorData.detail === 'string' ? errorData.detail : 'Export failed');
      }
    } catch (err) {
      setError('Export failed');
    } finally {
      setIsExporting(false);
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
  };

  const uploadToVolume = async () => {
    if (!workshopId || !volumePath || !databricksHost || !databricksToken) {
      setUploadError('Missing required fields: workshop ID, volume path, Databricks host, or token');
      return;
    }

    setIsUploading(true);
    setUploadError(null);
    setUploadResult(null);

    try {
      // Parse volume path
      const parts = volumePath.trim().split('.');
      if (parts.length !== 3) {
        throw new Error('Volume path must be in format: catalog.schema.volume_name');
      }

      const [catalog, schema, volume] = parts;
      const finalFileName = fileName || `workshop_${workshopId}.db`;
      
      

      // Call the backend upload endpoint
      const response = await fetch(`/workshops/${workshopId}/upload-to-volume`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          volume_path: volumePath,
          file_name: finalFileName,
          databricks_host: databricksHost,
          databricks_token: databricksToken
        }),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || `Upload failed: ${response.statusText}`);
      }

      const result = await response.json();
      
      
      setUploadResult(result);
      
      // Clear any previous errors
      setUploadError(null);
      
    } catch (err: any) {
      
      setUploadError(err.message || 'Upload failed');
      setUploadResult(null);
    } finally {
      setIsUploading(false);
    }
  };

  const clearStoredState = () => {
    if (!workshopId) return;
    
    const storageKey = `dbsql-export-state-${workshopId}`;
    localStorage.removeItem(storageKey);
    
    // Reset form fields
    setDatabricksHost('');
    setDatabricksToken('');
    setHttpPath('');
    setCatalog('');
    setSchemaName('');
    
    // Reset volume upload fields
    setVolumePath('');
    setFileName('');
    setUploadResult(null);
    setUploadError(null);
    
    setScrollPosition(0);
  };

  return (
    <div className="container mx-auto p-6 space-y-6">
      {/* Header */}
      <div className="text-center space-y-2">
        <h1 className="text-3xl font-bold flex items-center justify-center gap-2">
          <Database className="h-8 w-8" />
          Export to Databricks DBSQL
        </h1>
        <p className="text-muted-foreground max-w-2xl mx-auto">
          Export all workshop data from SQLite to Databricks DBSQL tables. This creates tables 
          in your Unity Catalog and inserts all workshop data for analysis and reporting.
        </p>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Left Column - Configuration */}
        <div className="space-y-6">
          {/* Workshop Summary */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <FileText className="h-5 w-5" />
                Workshop Summary
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-2">
                <div className="flex justify-between">
                  <span>Workshop Name:</span>
                  <span className="font-medium">{workshop?.name || 'Loading...'}</span>
                </div>
                <div className="flex justify-between">
                  <span>Current Phase:</span>
                  <Badge variant="outline">{workshop?.current_phase || 'Loading...'}</Badge>
                </div>
                <div className="flex justify-between">
                  <span>Workshop ID:</span>
                  <span className="font-mono text-sm">{workshopId}</span>
                </div>
              </div>
            </CardContent>
          </Card>

          {/* DBSQL Configuration */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Settings className="h-5 w-5" />
                DBSQL Configuration
              </CardTitle>
              <CardDescription>
                Configure your Databricks workspace and DBSQL warehouse settings
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="databricks-host">Databricks Host</Label>
                <Input
                  id="databricks-host"
                  placeholder="https://your-workspace.cloud.databricks.com"
                  value={databricksHost}
                  onChange={(e) => {
                    setDatabricksHost(e.target.value);
                    saveStateToStorage({ databricksHost: e.target.value });
                  }}
                />
              </div>
              
              <div>
                <Label htmlFor="databricks-token">Databricks Token</Label>
                <Input
                  id="databricks-token"
                  type="password"
                  placeholder="dapi..."
                  value={databricksToken}
                  onChange={(e) => {
                    setDatabricksToken(e.target.value);
                    saveStateToStorage({ databricksToken: e.target.value });
                  }}
                />
              </div>
              
              <div>
                <Label htmlFor="http-path">DBSQL Warehouse HTTP Path</Label>
                <Input
                  id="http-path"
                  placeholder="/sql/1.0/warehouses/xxxxxx"
                  value={httpPath}
                  onChange={(e) => {
                    setHttpPath(e.target.value);
                    saveStateToStorage({ httpPath: e.target.value });
                  }}
                />
              </div>
              
              <div>
                <Label htmlFor="catalog">Unity Catalog</Label>
                <Input
                  id="catalog"
                  placeholder="your_catalog"
                  value={catalog}
                  onChange={(e) => {
                    setCatalog(e.target.value);
                    saveStateToStorage({ catalog: e.target.value });
                  }}
                />
              </div>
              
              <div>
                <Label htmlFor="schema">Schema</Label>
                <Input
                  id="schema"
                  placeholder="your_schema"
                  value={schemaName}
                  onChange={(e) => {
                    setSchemaName(e.target.value);
                    saveStateToStorage({ schemaName: e.target.value });
                  }}
                />
              </div>
              
              <div className="flex gap-2 pt-4">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={clearStoredState}
                  className="flex-1"
                >
                  Clear Form
                </Button>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => saveStateToStorage({})}
                  className="flex-1"
                >
                  Save State
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Export Status */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5" />
                Data Status
              </CardTitle>
              <CardDescription>
                Check what data is available for export
              </CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                <Button
                  variant="outline"
                  onClick={checkExportStatus}
                  disabled={isCheckingStatus}
                  className="w-full"
                >
                  {isCheckingStatus ? (
                    <>
                      <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                      Checking Status...
                    </>
                  ) : (
                    <>
                      <BarChart3 className="h-4 w-4 mr-2" />
                      Check Export Status
                    </>
                  )}
                </Button>
                
                {exportStatus && (
                  <div className="grid grid-cols-2 gap-4 text-sm">
                    <div className="flex items-center gap-2">
                      <Star className="h-4 w-4" />
                      <span>Rubrics:</span>
                      <Badge variant={exportStatus.export_requirements.has_rubrics ? "default" : "secondary"}>
                        {exportStatus.data_summary.rubrics_count}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" />
                      <span>Annotations:</span>
                      <Badge variant={exportStatus.export_requirements.has_annotations ? "default" : "secondary"}>
                        {exportStatus.data_summary.annotations_count}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Database className="h-4 w-4" />
                      <span>Traces:</span>
                      <Badge variant={exportStatus.export_requirements.has_traces ? "default" : "secondary"}>
                        {exportStatus.data_summary.traces_count}
                      </Badge>
                    </div>
                    <div className="flex items-center gap-2">
                      <Users className="h-4 w-4" />
                      <span>Users:</span>
                      <Badge variant={exportStatus.export_requirements.has_users ? "default" : "secondary"}>
                        {exportStatus.data_summary.users_count}
                      </Badge>
                    </div>
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column - Export Actions and Results */}
        <div className="space-y-6">
          {/* Export Action */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Download className="h-5 w-5" />
                Export to DBSQL
              </CardTitle>
              <CardDescription>
                Export all workshop data to Databricks DBSQL tables
              </CardDescription>
            </CardHeader>
            <CardContent>
              <Button
                onClick={exportToDBSQL}
                disabled={isExporting || !databricksHost || !databricksToken || !httpPath || !catalog || !schemaName}
                className="w-full"
                size="lg"
              >
                {isExporting ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Exporting to DBSQL...
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4 mr-2" />
                    Export to DBSQL
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

          {/* Export Result */}
          {exportResult && (
            <Card>
              <CardHeader>
                <CardTitle className="flex items-center gap-2">
                  <CheckCircle className="h-5 w-5 text-green-600" />
                  Export Successful
                </CardTitle>
              </CardHeader>
              <CardContent className="space-y-4">
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-medium">{exportResult.message}</p>
                      <div className="text-sm space-y-1">
                        <p><strong>Total Rows:</strong> {exportResult.total_rows}</p>
                        <p><strong>Tables Exported:</strong> {exportResult.tables_exported?.length || 0}</p>
                        <p><strong>Target Location:</strong> {catalog}.{schemaName}</p>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
                
                {exportResult.tables_exported && exportResult.tables_exported.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium">Exported Tables</h4>
                    <div className="space-y-2">
                      {exportResult.tables_exported.map((table: any, index: number) => (
                        <div key={index} className="flex items-center justify-between p-2 bg-muted rounded">
                          <div className="flex items-center gap-2">
                            <Table className="h-3 w-3" />
                            <span className="text-sm font-mono">{table.table_name}</span>
                          </div>
                          <Badge variant="outline">{table.rows_exported} rows</Badge>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
                
                {exportResult.errors && exportResult.errors.length > 0 && (
                  <div className="space-y-2">
                    <h4 className="text-sm font-medium text-red-600">Errors</h4>
                    <div className="space-y-1">
                      {exportResult.errors.map((error: string, index: number) => (
                        <p key={index} className="text-sm text-red-600">{error}</p>
                      ))}
                    </div>
                  </div>
                )}
                
                <div className="flex gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => copyToClipboard(`${catalog}.${schemaName}`)}
                  >
                    <Copy className="h-4 w-4 mr-2" />
                    Copy Location
                  </Button>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => window.open(`https://${databricksHost.replace('https://', '').replace('http://', '')}`, '_blank')}
                  >
                    <ExternalLink className="h-4 w-4 mr-2" />
                    View in Databricks
                  </Button>
                </div>
              </CardContent>
            </Card>
          )}

          {/* Unity Catalog Volume Upload */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Upload className="h-5 w-5" />
                Upload SQLite to Unity Catalog Volume
              </CardTitle>
              <CardDescription>
                Upload the SQLite database file to a Unity Catalog volume for backup and sharing
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div>
                <Label htmlFor="volume-path">Volume Path</Label>
                <Input
                  id="volume-path"
                  placeholder="main.marketing.raw_files"
                  value={volumePath}
                  onChange={(e) => {
                    setVolumePath(e.target.value);
                    saveStateToStorage({ volumePath: e.target.value });
                  }}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Format: catalog.schema.volume_name
                </p>
              </div>
              
              <div>
                <Label htmlFor="file-name">File Name (Optional)</Label>
                <Input
                  id="file-name"
                  placeholder="workshop_data.db"
                  value={fileName}
                  onChange={(e) => {
                    setFileName(e.target.value);
                    saveStateToStorage({ fileName: e.target.value });
                  }}
                  className="font-mono text-sm"
                />
                <p className="text-xs text-muted-foreground mt-1">
                  Default: workshop_{workshopId}.db
                </p>
              </div>

              <Button
                onClick={uploadToVolume}
                disabled={isUploading || !databricksHost || !databricksToken || !volumePath}
                className="w-full"
                size="lg"
              >
                {isUploading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    Uploading to Volume...
                  </>
                ) : (
                  <>
                    <Upload className="h-4 w-4 mr-2" />
                    Upload to Unity Catalog Volume
                  </>
                  )}
              </Button>

              {uploadResult && (
                <Alert>
                  <CheckCircle className="h-4 w-4" />
                  <AlertDescription>
                    <div className="space-y-2">
                      <p className="font-medium">Upload Successful!</p>
                      <div className="text-sm space-y-1">
                        <p><strong>Volume Path:</strong> {volumePath}</p>
                        <p><strong>File Path:</strong> {uploadResult.file_path}</p>
                        <p><strong>File Size:</strong> {uploadResult.file_size} bytes</p>
                      </div>
                    </div>
                  </AlertDescription>
                </Alert>
              )}

              {uploadError && (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription>{uploadError}</AlertDescription>
                </Alert>
              )}
            </CardContent>
          </Card>

          {/* What Gets Exported */}
          <Card>
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <Info className="h-5 w-5" />
                What Gets Exported
              </CardTitle>
            </CardHeader>
            <CardContent>
              <div className="space-y-3 text-sm">
                <div className="flex items-start gap-2">
                  <Table className="h-4 w-4 mt-0.5" />
                  <div>
                    <strong>All Tables:</strong> Complete SQLite database exported to DBSQL tables
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Star className="h-4 w-4 mt-0.5" />
                  <div>
                    <strong>Rubrics:</strong> Evaluation criteria and questions
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <CheckCircle className="h-4 w-4 mt-0.5" />
                  <div>
                    <strong>Annotations:</strong> Human ratings and comments
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Database className="h-4 w-4 mt-0.5" />
                  <div>
                    <strong>Traces:</strong> Input/output pairs and context
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Users className="h-4 w-4 mt-0.5" />
                  <div>
                    <strong>Users:</strong> Workshop participants and roles
                  </div>
                </div>
                <div className="flex items-start gap-2">
                  <Download className="h-4 w-4 mt-0.5" />
                  <div>
                    <strong>Automatic Schema:</strong> Tables created with proper data types
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    </div>
  );
} 