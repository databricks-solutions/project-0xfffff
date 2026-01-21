import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import {
  Cloud,
  CheckCircle,
  XCircle,
  Loader2,
  Key,
  Trash2,
  TestTube,
  AlertCircle,
  Eye,
  EyeOff,
  Server
} from 'lucide-react';
import { WorkshopsService } from '@/client';
import type { CustomLLMProviderStatus, CustomLLMProviderConfigCreate } from '@/client';
import { toast } from 'sonner';

interface CustomLLMProviderConfigProps {
  workshopId: string;
  onConfigChange?: (config: CustomLLMProviderStatus | null) => void;
}

export function CustomLLMProviderConfig({ workshopId, onConfigChange }: CustomLLMProviderConfigProps) {
  const [status, setStatus] = useState<CustomLLMProviderStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isTesting, setIsTesting] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [testResult, setTestResult] = useState<{ success: boolean; message: string; responseTime?: number } | null>(null);
  const [showApiKey, setShowApiKey] = useState(false);
  const [isExpanded, setIsExpanded] = useState(false);

  // Form state
  const [formData, setFormData] = useState<CustomLLMProviderConfigCreate>({
    provider_name: '',
    base_url: '',
    api_key: '',
    model_name: '',
  });

  // Load status on mount
  useEffect(() => {
    loadStatus();
  }, [workshopId]);

  const loadStatus = async () => {
    try {
      setIsLoading(true);
      const result = await WorkshopsService.getCustomLlmProviderStatusWorkshopsWorkshopIdCustomLlmProviderGet(workshopId);
      setStatus(result);
      if (result.is_configured && result.provider_name && result.base_url && result.model_name) {
        setFormData({
          provider_name: result.provider_name,
          base_url: result.base_url,
          api_key: '', // Never pre-fill API key for security
          model_name: result.model_name,
        });
        setIsExpanded(true);
      }
      onConfigChange?.(result);
    } catch (error) {
      console.error('Failed to load custom LLM provider status:', error);
    } finally {
      setIsLoading(false);
    }
  };

  const handleSave = async () => {
    if (!formData.provider_name || !formData.base_url || !formData.model_name) {
      toast.error('Please fill in all required fields');
      return;
    }

    // Only require API key if not already configured or user is updating
    if (!status?.has_api_key && !formData.api_key) {
      toast.error('API key is required');
      return;
    }

    try {
      setIsSaving(true);
      setTestResult(null);

      // If API key is empty but we already have one, use a placeholder to indicate no change
      const payload = {
        ...formData,
        api_key: formData.api_key || 'EXISTING_KEY_UNCHANGED',
      };

      // If user is providing a new key, use that
      if (formData.api_key) {
        payload.api_key = formData.api_key;
      } else if (!status?.has_api_key) {
        toast.error('API key is required for initial configuration');
        return;
      }

      const result = await WorkshopsService.createCustomLlmProviderWorkshopsWorkshopIdCustomLlmProviderPost(
        workshopId,
        formData.api_key ? formData : { ...formData, api_key: 'EXISTING_KEY_UNCHANGED' }
      );

      setStatus(result);
      setFormData(prev => ({ ...prev, api_key: '' })); // Clear API key from form
      onConfigChange?.(result);
      toast.success('Custom LLM provider configuration saved');
    } catch (error) {
      console.error('Failed to save custom LLM provider config:', error);
      toast.error('Failed to save configuration');
    } finally {
      setIsSaving(false);
    }
  };

  const handleTest = async () => {
    try {
      setIsTesting(true);
      setTestResult(null);
      const result = await WorkshopsService.testCustomLlmProviderWorkshopsWorkshopIdCustomLlmProviderTestPost(workshopId);
      setTestResult({
        success: result.success,
        message: result.message,
        responseTime: result.response_time_ms ?? undefined,
      });
      if (result.success) {
        toast.success('Connection test successful');
      } else {
        toast.error(result.message);
      }
    } catch (error: any) {
      const message = error?.body?.detail || 'Connection test failed';
      setTestResult({
        success: false,
        message,
      });
      toast.error(message);
    } finally {
      setIsTesting(false);
    }
  };

  const handleDelete = async () => {
    try {
      setIsDeleting(true);
      await WorkshopsService.deleteCustomLlmProviderWorkshopsWorkshopIdCustomLlmProviderDelete(workshopId);
      setStatus(null);
      setFormData({
        provider_name: '',
        base_url: '',
        api_key: '',
        model_name: '',
      });
      setTestResult(null);
      onConfigChange?.(null);
      toast.success('Custom LLM provider configuration removed');
    } catch (error) {
      console.error('Failed to delete custom LLM provider config:', error);
      toast.error('Failed to remove configuration');
    } finally {
      setIsDeleting(false);
    }
  };

  if (isLoading) {
    return (
      <Card className="border-dashed">
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-gray-400" />
        </CardContent>
      </Card>
    );
  }

  return (
    <Card className={status?.is_configured && status?.is_enabled ? 'border-green-200 bg-green-50/50' : ''}>
      <CardHeader className="pb-3">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <Server className="h-5 w-5 text-purple-600" />
            <CardTitle className="text-lg">Custom LLM Provider</CardTitle>
            {status?.is_configured && (
              <Badge variant={status.is_enabled && status.has_api_key ? 'default' : 'secondary'} className="ml-2">
                {status.is_enabled && status.has_api_key ? 'Active' : 'Configured'}
              </Badge>
            )}
          </div>
          <Button
            variant="ghost"
            size="sm"
            onClick={() => setIsExpanded(!isExpanded)}
          >
            {isExpanded ? 'Collapse' : 'Configure'}
          </Button>
        </div>
        <CardDescription>
          Connect to any OpenAI-compatible LLM endpoint (Azure OpenAI, vLLM, etc.) for judge evaluation
        </CardDescription>
      </CardHeader>

      {isExpanded && (
        <CardContent className="space-y-4">
          {/* Provider Name */}
          <div className="space-y-2">
            <Label htmlFor="provider_name">Provider Name</Label>
            <Input
              id="provider_name"
              placeholder="e.g., Azure OpenAI, vLLM Server"
              value={formData.provider_name}
              onChange={(e) => setFormData(prev => ({ ...prev, provider_name: e.target.value }))}
            />
            <p className="text-xs text-gray-500">A friendly name to identify this provider</p>
          </div>

          {/* Base URL */}
          <div className="space-y-2">
            <Label htmlFor="base_url">Base URL</Label>
            <Input
              id="base_url"
              placeholder="https://your-resource.openai.azure.com/openai/deployments/gpt-4"
              value={formData.base_url}
              onChange={(e) => setFormData(prev => ({ ...prev, base_url: e.target.value }))}
            />
            <p className="text-xs text-gray-500">
              The base URL for the OpenAI-compatible endpoint. Should support /v1/chat/completions.
            </p>
          </div>

          {/* Model Name */}
          <div className="space-y-2">
            <Label htmlFor="model_name">Model Name</Label>
            <Input
              id="model_name"
              placeholder="e.g., gpt-4, gpt-4o-mini, llama-3.1-70b"
              value={formData.model_name}
              onChange={(e) => setFormData(prev => ({ ...prev, model_name: e.target.value }))}
            />
            <p className="text-xs text-gray-500">The model identifier expected by the endpoint</p>
          </div>

          {/* API Key */}
          <div className="space-y-2">
            <Label htmlFor="api_key" className="flex items-center gap-2">
              API Key
              {status?.has_api_key && (
                <Badge variant="outline" className="text-xs font-normal">
                  <Key className="h-3 w-3 mr-1" /> Stored
                </Badge>
              )}
            </Label>
            <div className="relative">
              <Input
                id="api_key"
                type={showApiKey ? 'text' : 'password'}
                placeholder={status?.has_api_key ? '(unchanged - enter new key to update)' : 'Enter API key'}
                value={formData.api_key}
                onChange={(e) => setFormData(prev => ({ ...prev, api_key: e.target.value }))}
              />
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="absolute right-2 top-1/2 -translate-y-1/2 h-7 w-7 p-0"
                onClick={() => setShowApiKey(!showApiKey)}
              >
                {showApiKey ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
              </Button>
            </div>
            <p className="text-xs text-gray-500">
              API key is stored in memory only (expires after 24 hours) and never written to disk.
            </p>
          </div>

          {/* Test Result */}
          {testResult && (
            <Alert variant={testResult.success ? 'default' : 'destructive'}>
              {testResult.success ? (
                <CheckCircle className="h-4 w-4 text-green-600" />
              ) : (
                <XCircle className="h-4 w-4" />
              )}
              <AlertDescription className="ml-2">
                {testResult.message}
                {testResult.responseTime && (
                  <span className="text-gray-500 ml-2">({testResult.responseTime}ms)</span>
                )}
              </AlertDescription>
            </Alert>
          )}

          {/* Actions */}
          <div className="flex items-center gap-2 pt-2">
            <Button onClick={handleSave} disabled={isSaving}>
              {isSaving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              {status?.is_configured ? 'Update Configuration' : 'Save Configuration'}
            </Button>

            {status?.is_configured && status?.has_api_key && (
              <Button variant="outline" onClick={handleTest} disabled={isTesting}>
                {isTesting ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <TestTube className="mr-2 h-4 w-4" />
                )}
                Test Connection
              </Button>
            )}

            {status?.is_configured && (
              <Button variant="destructive" size="icon" onClick={handleDelete} disabled={isDeleting}>
                {isDeleting ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
              </Button>
            )}
          </div>

          {/* Info about usage */}
          {status?.is_configured && status?.is_enabled && status?.has_api_key && (
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                This custom provider will be available for judge evaluation. Select it in the model dropdown during evaluation.
              </AlertDescription>
            </Alert>
          )}
        </CardContent>
      )}
    </Card>
  );
}
