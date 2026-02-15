import React, { useState, useEffect, useCallback, useRef } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Sparkles,
  Play,
  AlertCircle,
  CheckCircle,
  Loader2,
  History,
  ArrowRight,
  Copy,
  ChevronDown,
  ChevronUp,
  FileText,
  Link,
  Zap,
  Download,
  TrendingUp,
  Square,
  SlidersHorizontal,
  Target,
  Database,
} from 'lucide-react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useRoleCheck } from '@/context/UserContext';
import { useWorkshop } from '@/hooks/useWorkshopApi';
import { getModelOptions, getBackendModelName, getFrontendModelName } from '@/utils/modelMapping';
import { toast } from 'sonner';

interface OptimizationRun {
  id: string;
  job_id: string;
  prompt_uri: string;
  original_prompt: string | null;
  optimized_prompt: string | null;
  optimized_version: number | null;
  optimized_uri: string | null;
  optimizer_model: string | null;
  num_iterations: number | null;
  num_candidates: number | null;
  target_endpoint: string | null;
  metrics: Record<string, any> | null;
  status: string;
  error: string | null;
  created_at: string | null;
}

export function PromptOptimizationPage() {
  const { workshopId } = useWorkshopContext();
  const { isFacilitator } = useRoleCheck();
  const { data: workshop } = useWorkshop(workshopId!);

  // Configuration state
  const [promptInputMode, setPromptInputMode] = useState<'text' | 'uri'>('text');
  const [promptText, setPromptText] = useState('');
  const [promptUri, setPromptUri] = useState('');
  const [promptName, setPromptName] = useState('');
  const [ucCatalog, setUcCatalog] = useState('');
  const [ucSchema, setUcSchema] = useState('');
  const [optimizerModel, setOptimizerModel] = useState('Claude Opus 4.5');
  const [numIterations, setNumIterations] = useState(3);
  const [numCandidates, setNumCandidates] = useState(3);
  const [maxTraces, setMaxTraces] = useState(20);
  const [targetEndpoint, setTargetEndpoint] = useState('');

  // Job state
  const [jobId, setJobId] = useState<string | null>(null);
  const [jobStatus, setJobStatus] = useState<string | null>(null);
  const [jobLogs, setJobLogs] = useState<string[]>([]);
  const [jobResult, setJobResult] = useState<any>(null);
  const [jobError, setJobError] = useState<string | null>(null);
  const [isStarting, setIsStarting] = useState(false);
  const logIndexRef = useRef(0);
  const logContainerRef = useRef<HTMLDivElement>(null);

  // History state
  const [history, setHistory] = useState<OptimizationRun[]>([]);
  const [showHistory, setShowHistory] = useState(false);
  const [selectedRun, setSelectedRun] = useState<OptimizationRun | null>(null);

  // Scorer/judge state
  const [scorers, setScorers] = useState<{ name: string; model: string | null }[]>([]);
  const [selectedScorers, setSelectedScorers] = useState<string[]>([]);
  const [isLoadingScorers, setIsLoadingScorers] = useState(false);

  // Auto-scroll logs to bottom when new logs arrive
  useEffect(() => {
    if (logContainerRef.current) {
      logContainerRef.current.scrollTop = logContainerRef.current.scrollHeight;
    }
  }, [jobLogs]);

  const modelOptions = getModelOptions(true); // Prompt optimization always requires MLflow

  // Persist configuration to localStorage so it survives page navigation
  const configStorageKey = `prompt-opt-config-${workshopId}`;

  // Load saved configuration on mount
  useEffect(() => {
    if (!workshopId) return;
    try {
      const saved = localStorage.getItem(configStorageKey);
      if (saved) {
        const config = JSON.parse(saved);
        if (config.promptText) setPromptText(config.promptText);
        if (config.promptUri) setPromptUri(config.promptUri);
        if (config.promptInputMode) setPromptInputMode(config.promptInputMode);
        if (config.promptName) setPromptName(config.promptName);
        if (config.ucCatalog) setUcCatalog(config.ucCatalog);
        if (config.ucSchema) setUcSchema(config.ucSchema);
        if (config.optimizerModel) setOptimizerModel(getFrontendModelName(config.optimizerModel));
        else setOptimizerModel('Claude Opus 4.5');
        if (config.numIterations) setNumIterations(config.numIterations);
        if (config.numCandidates) setNumCandidates(config.numCandidates);
        if (config.maxTraces) setMaxTraces(config.maxTraces);
        if (config.targetEndpoint) setTargetEndpoint(config.targetEndpoint);
      }
    } catch (_) { /* localStorage unavailable */ }
  }, [workshopId]);

  // Save configuration whenever it changes
  useEffect(() => {
    if (!workshopId) return;
    try {
      localStorage.setItem(configStorageKey, JSON.stringify({
        promptText, promptUri, promptInputMode, promptName,
        ucCatalog, ucSchema, optimizerModel, numIterations,
        numCandidates, maxTraces, targetEndpoint,
      }));
    } catch (_) { /* localStorage unavailable */ }
  }, [workshopId, promptText, promptUri, promptInputMode, promptName,
      ucCatalog, ucSchema, optimizerModel, numIterations, numCandidates, maxTraces, targetEndpoint]);

  // Fetch available scorers/judges from MLflow
  useEffect(() => {
    if (!workshopId) return;
    setIsLoadingScorers(true);
    fetch(`/workshops/${workshopId}/list-scorers`)
      .then(r => r.ok ? r.json() : [])
      .then(data => {
        setScorers(data);
        // Auto-select all scorers when loaded
        if (data.length > 0 && selectedScorers.length === 0) {
          setSelectedScorers(data.map((s: any) => s.name));
        }
      })
      .catch(() => setScorers([]))
      .finally(() => setIsLoadingScorers(false));
  }, [workshopId, workshop?.judge_name]);

  // Load history
  const loadHistory = useCallback(async () => {
    if (!workshopId) return;
    try {
      const response = await fetch(`/workshops/${workshopId}/prompt-optimization-history`);
      if (response.ok) {
        const data = await response.json();
        setHistory(data);
      }
    } catch (e) {
      console.error('Failed to load optimization history:', e);
    }
  }, [workshopId]);

  useEffect(() => {
    loadHistory();
  }, [loadHistory]);

  // Auto-reconnect to a job when the page mounts (e.g. after navigating away and back).
  // Restores running jobs (resumes polling) and the most recent completed/failed job (shows logs).
  const reconnectedRef = useRef(false);
  useEffect(() => {
    if (reconnectedRef.current || !history.length || jobId) return;

    // Prefer a running job; fall back to the most recent completed/failed job
    const runningEntry = history.find(r => r.status === 'running');
    const targetEntry = runningEntry || history[0]; // history is ordered newest-first
    if (!targetEntry) return;

    reconnectedRef.current = true;
    setJobId(targetEntry.job_id);
    setJobStatus(targetEntry.status);

    // Restore configuration from the history entry
    if (targetEntry.original_prompt) {
      setPromptText(targetEntry.original_prompt);
      setPromptInputMode('text');
    } else if (targetEntry.prompt_uri) {
      setPromptUri(targetEntry.prompt_uri);
      setPromptInputMode('uri');
    }

    // Restore other config fields from the run record
    if (targetEntry.optimizer_model) setOptimizerModel(getFrontendModelName(targetEntry.optimizer_model));
    if (targetEntry.num_iterations) setNumIterations(targetEntry.num_iterations);
    if (targetEntry.num_candidates) setNumCandidates(targetEntry.num_candidates);
    if (targetEntry.target_endpoint) setTargetEndpoint(targetEntry.target_endpoint);

    // Extract UC catalog/schema/name from prompt_uri (format: "catalog.schema.name")
    if (targetEntry.prompt_uri) {
      const parts = targetEntry.prompt_uri.split('.');
      if (parts.length >= 3) {
        setUcCatalog(parts[0]);
        setUcSchema(parts[1]);
        setPromptName(parts.slice(2).join('.'));
      }
    }

    // For completed/failed jobs, restore result/error from DB history immediately
    // (logs will be fetched from the job store below if still available)
    if (targetEntry.status === 'completed' && targetEntry.optimized_prompt) {
      setJobResult({
        original_prompt: targetEntry.original_prompt,
        optimized_prompt: targetEntry.optimized_prompt,
        optimized_uri: targetEntry.optimized_uri,
        optimized_version: targetEntry.optimized_version,
        metrics: targetEntry.metrics,
      });
    }
    if (targetEntry.error) {
      setJobError(targetEntry.error);
    }

    // Logs will be fetched by the poll effect (fires immediately on jobId change).
    // No separate fetch here to avoid duplicate logs.
  }, [history, jobId, workshopId, loadHistory]);

  // Poll job status — fires immediately on first run, then every 2s
  useEffect(() => {
    if (!jobId || !workshopId || jobStatus === 'completed' || jobStatus === 'failed') return;

    let consecutiveErrors = 0;
    let cancelled = false;

    const poll = async () => {
      if (cancelled) return;
      try {
        const response = await fetch(
          `/workshops/${workshopId}/prompt-optimization-job/${jobId}?since_log_index=${logIndexRef.current}`
        );
        if (!response.ok) {
          consecutiveErrors++;
          if (consecutiveErrors >= 3) {
            setJobStatus('failed');
            setJobError('Job lost — server may have restarted. Please try again.');
            loadHistory();
          }
          return;
        }
        consecutiveErrors = 0;

        const data = await response.json();

        if (data.logs && data.logs.length > 0) {
          // On first fetch (from index 0), replace logs to avoid duplicates
          if (logIndexRef.current === 0) {
            setJobLogs(data.logs);
          } else {
            setJobLogs(prev => [...prev, ...data.logs]);
          }
          logIndexRef.current = data.log_count;
        }

        setJobStatus(data.status);

        if (data.result) {
          setJobResult(data.result);
        }
        if (data.error) {
          setJobError(data.error);
        }

        if (data.status === 'completed' || data.status === 'failed') {
          loadHistory();
        }
      } catch (e) {
        console.error('Poll error:', e);
        consecutiveErrors++;
        if (consecutiveErrors >= 3) {
          setJobStatus('failed');
          setJobError('Connection lost — server may be down. Please try again.');
          loadHistory();
        }
      }
    };

    // Fire immediately, then poll every 2s
    poll();
    const interval = setInterval(poll, 2000);

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [jobId, workshopId, jobStatus, loadHistory]);

  const handleStartOptimization = async () => {
    if (!workshopId) return;

    const hasPrompt = promptInputMode === 'text' ? promptText.trim() : promptUri.trim();
    if (!hasPrompt) {
      toast.error(promptInputMode === 'text' ? 'Please enter your agent prompt' : 'Please enter a prompt URI');
      return;
    }
    if (!targetEndpoint.trim()) {
      toast.error('Please enter a target endpoint');
      return;
    }

    setIsStarting(true);
    setJobLogs([]);
    setJobResult(null);
    setJobError(null);
    logIndexRef.current = 0;

    try {
      const body: Record<string, any> = {
        optimizer_model_name: getBackendModelName(optimizerModel),
        num_iterations: numIterations,
        num_candidates: numCandidates,
        max_traces: maxTraces,
        target_endpoint: targetEndpoint.trim(),
      };

      // Pass selected judges — if user selected specific scorers, send as judge_names
      if (selectedScorers.length > 0) {
        body.judge_names = selectedScorers;
      } else {
        body.judge_name = workshop?.judge_name || 'workshop_judge';
      }

      if (promptInputMode === 'text') {
        body.prompt_text = promptText;
        if (promptName.trim()) {
          body.prompt_name = promptName.trim();
        }
        if (ucCatalog.trim()) {
          body.uc_catalog = ucCatalog.trim();
        }
        if (ucSchema.trim()) {
          body.uc_schema = ucSchema.trim();
        }
      } else {
        // Normalize prompts:// → prompts:/ (common user mistake)
        let uri = promptUri.trim();
        if (uri.startsWith('prompts://')) {
          uri = 'prompts:/' + uri.slice('prompts://'.length);
        }
        body.prompt_uri = uri;
      }

      const response = await fetch(`/workshops/${workshopId}/start-prompt-optimization`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!response.ok) {
        const errorData = await response.json();
        throw new Error(errorData.detail || 'Failed to start optimization');
      }

      const data = await response.json();
      setJobId(data.job_id);
      setJobStatus('running');
      toast.success('Prompt optimization started');
    } catch (e: any) {
      toast.error(e.message || 'Failed to start optimization');
      setJobError(e.message);
    } finally {
      setIsStarting(false);
    }
  };

  const handleCancelOptimization = async () => {
    if (!workshopId || !jobId) return;
    try {
      const response = await fetch(`/workshops/${workshopId}/cancel-prompt-optimization/${jobId}`, {
        method: 'POST',
      });
      if (response.ok) {
        setJobStatus('failed');
        setJobError('Cancelled by user');
        setJobLogs(prev => [...prev, 'Optimization cancelled by user.']);
        loadHistory();
        toast.success('Optimization cancelled');
      }
    } catch (e) {
      // If server is down, just reset local state
      setJobStatus('failed');
      setJobError('Cancelled — server may be unreachable.');
      toast.error('Could not reach server, but UI has been reset.');
    }
  };

  const copyToClipboard = (text: string) => {
    navigator.clipboard.writeText(text);
    toast.success('Copied to clipboard');
  };

  // Extract score improvement from logs as fallback for runs that completed
  // before the backend started including scores in metrics
  const parsedScores = React.useMemo(() => {
    for (const log of jobLogs) {
      const match = log.match(/Score improvement:\s*([\d.]+)\s*→\s*([\d.]+)/);
      if (match) {
        return { initial_score: parseFloat(match[1]), final_score: parseFloat(match[2]) };
      }
    }
    return null;
  }, [jobLogs]);

  const isRunning = jobStatus === 'running';

  if (!isFacilitator) {
    return (
      <div className="flex items-center justify-center min-h-[400px]">
        <Card className="max-w-md">
          <CardContent className="pt-6 text-center">
            <Sparkles className="h-12 w-12 mx-auto mb-4 text-gray-300" />
            <h3 className="text-lg font-semibold mb-2">Prompt Optimization</h3>
            <p className="text-sm text-gray-500">
              The facilitator is optimizing the agent's system prompt using GEPA.
              Please wait for this phase to complete.
            </p>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="space-y-4 p-6 max-w-6xl mx-auto">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-gradient-to-br from-teal-600 to-teal-700 flex items-center justify-center shadow-sm">
            <Sparkles className="h-4.5 w-4.5 text-teal-100" />
          </div>
          <div>
            <h1 className="text-base font-semibold text-gray-900">Prompt Optimization</h1>
            <p className="text-xs text-gray-400 mt-0.5">GEPA &mdash; improve prompts using human evaluation feedback</p>
          </div>
        </div>
        {jobStatus && (
          <Badge
            variant="outline"
            className={`text-[11px] font-medium px-2 py-0.5 ${
              jobStatus === 'completed' ? 'text-green-600 border-green-200 bg-green-50' :
              jobStatus === 'failed' ? 'text-red-500 border-red-200 bg-red-50' :
              jobStatus === 'running' ? 'text-teal-600 border-teal-300 bg-teal-50' :
              'text-gray-500 border-gray-200'
            }`}
          >
            {jobStatus === 'completed' && <CheckCircle className="h-3 w-3 mr-1" />}
            {jobStatus === 'failed' && <AlertCircle className="h-3 w-3 mr-1" />}
            {jobStatus === 'running' && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
            {jobStatus}
          </Badge>
        )}
      </div>

      {/* Two-column config layout */}
      <div className="grid grid-cols-1 lg:grid-cols-5 gap-4">
        {/* Left column — Prompt & Endpoint (3/5) */}
        <div className="lg:col-span-3 space-y-4">
          {/* Prompt Card */}
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden flex">
            <div className="w-1.5 bg-gradient-to-b from-teal-500 to-teal-400 shrink-0" />
            <div className="flex-1">
              <div className="flex items-center justify-between px-4 py-2.5 border-b bg-gray-50/60">
                <div className="flex items-center gap-2">
                  <FileText className="h-3.5 w-3.5 text-teal-600" />
                  <span className="text-[13px] font-semibold text-gray-800">Agent System Prompt</span>
                </div>
                <div className="flex gap-0.5 bg-white rounded-md p-0.5 border border-gray-200">
                  <button
                    onClick={() => setPromptInputMode('text')}
                    disabled={isRunning}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                      promptInputMode === 'text'
                        ? 'bg-teal-50 text-teal-700'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    Text
                  </button>
                  <button
                    onClick={() => setPromptInputMode('uri')}
                    disabled={isRunning}
                    className={`px-2 py-0.5 rounded text-[11px] font-medium transition-all ${
                      promptInputMode === 'uri'
                        ? 'bg-teal-50 text-teal-700'
                        : 'text-gray-400 hover:text-gray-600'
                    }`}
                  >
                    MLflow URI
                  </button>
                </div>
              </div>
              <div className="p-4 space-y-3">
                {promptInputMode === 'text' ? (
                  <>
                    <Textarea
                      placeholder="Paste your agent's system prompt here..."
                      value={promptText}
                      onChange={(e) => setPromptText(e.target.value)}
                      disabled={isRunning}
                      className="font-mono text-sm min-h-[130px] resize-y border-gray-200 focus:border-teal-400 focus:ring-teal-100"
                    />
                    <div className="grid grid-cols-3 gap-2">
                      <div>
                        <label className="text-[11px] font-medium text-gray-500 block mb-1">UC Catalog</label>
                        <Input placeholder="main" value={ucCatalog} onChange={(e) => setUcCatalog(e.target.value)} disabled={isRunning} className="text-sm h-8" />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-gray-500 block mb-1">UC Schema</label>
                        <Input placeholder="my_schema" value={ucSchema} onChange={(e) => setUcSchema(e.target.value)} disabled={isRunning} className="text-sm h-8" />
                      </div>
                      <div>
                        <label className="text-[11px] font-medium text-gray-500 block mb-1">Prompt Name</label>
                        <Input placeholder="my_prompt" value={promptName} onChange={(e) => setPromptName(e.target.value)} disabled={isRunning} className="text-sm h-8" />
                      </div>
                    </div>
                    {(ucCatalog || ucSchema || promptName || promptText) && (
                      <p className="text-[11px] text-gray-400 font-mono">
                        {ucCatalog && ucSchema && promptName
                          ? `${ucCatalog}.${ucSchema}.${promptName}`
                          : ucCatalog && ucSchema
                          ? `${ucCatalog}.${ucSchema}.<auto>`
                          : 'Set UC catalog + schema to register'}
                        {promptText ? ` \u00b7 ${promptText.length} chars` : ''}
                      </p>
                    )}
                  </>
                ) : (
                  <>
                    <Input
                      placeholder="prompts:/catalog.schema.my_agent_prompt/1"
                      value={promptUri}
                      onChange={(e) => setPromptUri(e.target.value)}
                      disabled={isRunning}
                      className="font-mono text-sm"
                    />
                    <p className="text-[11px] text-gray-400">
                      e.g. prompts:/main.my_schema.agent_prompt/latest
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Target Endpoint Card */}
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden flex">
            <div className="w-1.5 bg-gradient-to-b from-sky-400 to-sky-300 shrink-0" />
            <div className="flex-1">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-gray-50/60">
                <Target className="h-3.5 w-3.5 text-sky-600" />
                <label className="text-[13px] font-semibold text-gray-800">Target Endpoint</label>
              </div>
              <div className="p-4">
                <Input
                  placeholder="my-agent-endpoint"
                  value={targetEndpoint}
                  onChange={(e) => setTargetEndpoint(e.target.value)}
                  disabled={isRunning}
                  className="text-sm font-mono"
                />
              </div>
            </div>
          </div>
        </div>

        {/* Right column — Scorers & Parameters (2/5) */}
        <div className="lg:col-span-2 space-y-4">
          {/* Scorers Card */}
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden flex">
            <div className="w-1.5 bg-gradient-to-b from-emerald-400 to-emerald-300 shrink-0" />
            <div className="flex-1">
              <div className="flex items-center justify-between px-4 py-2.5 border-b bg-gray-50/60">
                <div className="flex items-center gap-2">
                  <Database className="h-3.5 w-3.5 text-emerald-600" />
                  <span className="text-[13px] font-semibold text-gray-800">Scorers</span>
                </div>
                {scorers.length > 0 && (
                  <button
                    type="button"
                    onClick={() => {
                      if (selectedScorers.length === scorers.length) {
                        setSelectedScorers([]);
                      } else {
                        setSelectedScorers(scorers.map(s => s.name));
                      }
                    }}
                    disabled={isRunning}
                    className="text-[11px] text-emerald-600 hover:text-emerald-800 disabled:text-gray-300 font-medium"
                  >
                    {selectedScorers.length === scorers.length ? 'Deselect all' : 'Select all'}
                  </button>
                )}
              </div>
              <div className="p-3">
                {isLoadingScorers ? (
                  <div className="flex items-center gap-2 h-10 px-3 rounded-lg bg-gray-50 text-sm text-gray-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading scorers...
                  </div>
                ) : scorers.length === 0 ? (
                  <div className="text-xs text-gray-400 bg-gray-50 rounded-lg p-3 text-center">
                    No scorers found. Rubric judges will be used.
                  </div>
                ) : (
                  <>
                    <div className="max-h-[180px] overflow-y-auto space-y-0.5">
                      {scorers.map(scorer => (
                        <label
                          key={scorer.name}
                          className={`flex items-center gap-2.5 px-2.5 py-1.5 rounded-md text-sm cursor-pointer hover:bg-emerald-50/50 transition-colors ${
                            isRunning ? 'opacity-60 pointer-events-none' : ''
                          }`}
                        >
                          <input
                            type="checkbox"
                            checked={selectedScorers.includes(scorer.name)}
                            onChange={(e) => {
                              if (e.target.checked) {
                                setSelectedScorers(prev => [...prev, scorer.name]);
                              } else {
                                setSelectedScorers(prev => prev.filter(n => n !== scorer.name));
                              }
                            }}
                            disabled={isRunning}
                            className="rounded border-gray-300 text-emerald-600 focus:ring-emerald-300"
                          />
                          <span className="font-medium text-gray-700 text-xs truncate">{scorer.name}</span>
                        </label>
                      ))}
                    </div>
                    <p className="text-[11px] text-gray-400 mt-2 text-center">
                      {selectedScorers.length}/{scorers.length} selected
                    </p>
                  </>
                )}
              </div>
            </div>
          </div>

          {/* Parameters Card */}
          <div className="rounded-xl border bg-white shadow-sm overflow-hidden flex">
            <div className="w-1.5 bg-gradient-to-b from-blue-400 to-blue-300 shrink-0" />
            <div className="flex-1">
              <div className="flex items-center gap-2 px-4 py-2.5 border-b bg-gray-50/60">
                <SlidersHorizontal className="h-3.5 w-3.5 text-blue-600" />
                <span className="text-[13px] font-semibold text-gray-800">Parameters</span>
              </div>
              <div className="p-4 space-y-3.5">
                {/* Optimizer Model */}
                <div>
                  <label className="text-[11px] font-medium text-gray-500 block mb-1">Optimizer Model</label>
                  <Select value={optimizerModel} onValueChange={setOptimizerModel} disabled={isRunning}>
                    <SelectTrigger className="h-8 text-sm">
                      <SelectValue placeholder="Select model" />
                    </SelectTrigger>
                    <SelectContent>
                      {modelOptions
                        .filter(m => !m.disabled)
                        .map(option => (
                          <SelectItem key={option.value} value={option.value}>
                            {option.label}
                          </SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>

                {/* Sliders */}
                <div className="space-y-2.5">
                  {[
                    { label: 'Iterations', value: numIterations, setter: setNumIterations, min: 1, max: 10, step: 1 },
                    { label: 'Candidates', value: numCandidates, setter: setNumCandidates, min: 2, max: 10, step: 1 },
                    { label: 'Max Traces', value: maxTraces, setter: setMaxTraces, min: 5, max: 100, step: 5 },
                  ].map(({ label, value, setter, min, max, step }) => (
                    <div key={label}>
                      <div className="flex items-center justify-between mb-0.5">
                        <label className="text-[11px] font-medium text-gray-500">{label}</label>
                        <span className="text-[11px] font-semibold text-blue-700 tabular-nums">{value}</span>
                      </div>
                      <input
                        type="range"
                        min={min}
                        max={max}
                        step={step}
                        value={value}
                        onChange={(e) => setter(Number(e.target.value))}
                        disabled={isRunning}
                        className="w-full accent-blue-500 h-1.5"
                      />
                      <div className="flex justify-between text-[10px] text-gray-300">
                        <span>{min}</span>
                        <span>{max}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Action bar */}
      <div className="flex items-center gap-3 pt-1">
        <Button
          onClick={handleStartOptimization}
          disabled={isRunning || isStarting || !(promptInputMode === 'text' ? promptText.trim() : promptUri.trim()) || !targetEndpoint.trim()}
          size="lg"
          className="shadow-md px-8 bg-teal-600 hover:bg-teal-700 text-white"
        >
          {isRunning ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Optimizing...
            </>
          ) : isStarting ? (
            <>
              <Loader2 className="h-4 w-4 mr-2 animate-spin" />
              Starting...
            </>
          ) : (
            <>
              <Play className="h-4 w-4 mr-2" />
              Start Optimization
            </>
          )}
        </Button>

        {isRunning && (
          <Button
            variant="ghost"
            size="sm"
            onClick={handleCancelOptimization}
            className="text-gray-500 hover:text-red-600 hover:bg-red-50"
          >
            <Square className="h-3 w-3 mr-1" />
            Stop
          </Button>
        )}

        {isRunning && (
          <span className="text-[11px] text-gray-400 ml-auto tabular-nums">
            {jobLogs.length} log entries
          </span>
        )}
      </div>

      {/* Progress / Logs */}
      {jobLogs.length > 0 && (
        <div className="rounded-xl border bg-white shadow-sm overflow-hidden flex">
          <div className={`w-1.5 shrink-0 ${
            isRunning ? 'bg-gradient-to-b from-teal-400 to-teal-300' :
            jobStatus === 'completed' ? 'bg-gradient-to-b from-teal-400 to-emerald-400' :
            jobStatus === 'failed' ? 'bg-gradient-to-b from-rose-400 to-rose-300' :
            'bg-gray-200'
          }`} />
          <div className="flex-1">
            <div className="flex items-center justify-between px-4 py-2.5 border-b bg-gray-50/60">
              <div className="flex items-center gap-2 text-[13px] font-semibold text-gray-800">
                {isRunning ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-teal-500" />
                ) : jobStatus === 'completed' ? (
                  <CheckCircle className="h-3.5 w-3.5 text-green-600" />
                ) : jobStatus === 'failed' ? (
                  <AlertCircle className="h-3.5 w-3.5 text-red-500" />
                ) : null}
                Logs
              </div>
              <div className="flex gap-1">
                <Button variant="ghost" size="sm" className="h-7 px-2 text-gray-400 hover:text-gray-700" onClick={() => copyToClipboard(jobLogs.join('\n'))}>
                  <Copy className="h-3.5 w-3.5 mr-1" /><span className="text-xs">Copy</span>
                </Button>
                <Button variant="ghost" size="sm" className="h-7 px-2 text-gray-400 hover:text-gray-700" onClick={() => {
                  const blob = new Blob([jobLogs.join('\n')], { type: 'text/plain' });
                  const url = URL.createObjectURL(blob);
                  const a = document.createElement('a');
                  a.href = url;
                  a.download = `gepa-optimization-${new Date().toISOString().slice(0, 19).replace(/:/g, '-')}.log`;
                  a.click();
                  URL.revokeObjectURL(url);
                }}>
                  <Download className="h-3.5 w-3.5 mr-1" /><span className="text-xs">Download</span>
                </Button>
              </div>
            </div>
            <div ref={logContainerRef} className="bg-[#0d1117] p-4 max-h-[400px] overflow-y-auto">
              <pre className="text-[13px] text-green-400 font-mono whitespace-pre-wrap leading-relaxed">
                {jobLogs.map((log, i) => (
                  <div
                    key={i}
                    className={`${
                      log.includes('ERROR') ? 'text-red-400 font-semibold' :
                      log.includes('WARNING') ? 'text-yellow-400' :
                      log.includes('\u2501\u2501\u2501') ? 'text-sky-400 font-semibold' :
                      log.includes('Proposed new text') ? 'text-orange-400 font-semibold' :
                      log.includes('Iteration ') && (log.includes('score') || log.includes('Score')) ? 'text-amber-400 font-medium' :
                      log.includes('Iteration ') && log.includes('Best') ? 'text-emerald-400 font-semibold' :
                      log.includes('Iteration ') ? 'text-amber-300' :
                      log.includes('Candidate Prompt #') ? 'text-cyan-400 font-semibold' :
                      log.includes('Candidate #') && log.includes('evaluated') ? 'text-cyan-400 font-medium' :
                      log.includes('[Predict #') && log.includes('Input:') ? 'text-blue-400' :
                      log.includes('[Predict #') && log.includes('Output:') ? 'text-blue-300' :
                      log.includes('[Predict #') ? 'text-blue-400' :
                      log.includes('Score improvement') || log.includes('Best program') || log.includes('Best score') ? 'text-emerald-400 font-semibold' :
                      log.includes('pareto front') ? 'text-amber-300' :
                      log.includes('complete') || log.includes('success') || log.includes('Optimization complete') ? 'text-green-400 font-semibold' :
                      log.includes('GEPA still optimizing') ? 'text-gray-500' :
                      log.startsWith('  ') ? 'text-gray-400' :
                      'text-green-400'
                    }`}
                  >
                    {log}
                  </div>
                ))}
              </pre>
            </div>
          </div>
        </div>
      )}

      {/* Error */}
      {jobError && jobStatus === 'failed' && (
        <Alert variant="destructive" className="shadow-sm">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{jobError}</AlertDescription>
        </Alert>
      )}

      {/* Results Card — gradient success banner (matching judge tuning pattern) */}
      {jobResult && jobResult.success && (
        <Card className="border-green-200 overflow-hidden">
          <div className="p-4 bg-gradient-to-br from-green-50 to-emerald-50 border-l-4 border-green-500">
            <div className="flex items-center gap-2 mb-2">
              <CheckCircle className="h-6 w-6 text-green-600" />
              <span className="font-semibold text-green-800 text-lg">Optimization Successful</span>
              <Badge className="bg-green-100 text-green-700 border-green-300 ml-auto">
                <Zap className="h-3 w-3 mr-1" />
                Prompt Optimized
              </Badge>
            </div>
            <p className="text-sm text-green-700 font-medium">
              GEPA improved the prompt using {jobResult.metrics?.train_data_size || 0} traces
              over {jobResult.metrics?.num_iterations || numIterations} iterations.
              {jobResult.optimized_version && (
                <span className="ml-1">(Saved as version {jobResult.optimized_version})</span>
              )}
            </p>
            {(jobResult.optimizer_model || jobResult.target_endpoint) && (
              <p className="text-xs text-green-600 mt-0.5">
                {jobResult.optimizer_model && <>Model: {jobResult.optimizer_model}</>}
                {jobResult.target_endpoint && <>{jobResult.optimizer_model ? ' | ' : ''}Endpoint: <span className="font-mono">{jobResult.target_endpoint}</span></>}
              </p>
            )}
            {jobResult.optimized_uri && (
              <p className="text-xs text-green-600 mt-1 font-mono">
                {jobResult.optimized_uri}
                {jobResult.optimized_prompt_name && (
                  <span className="text-green-500 ml-2">| alias: champion</span>
                )}
              </p>
            )}

            {/* Score improvement banner */}
            {(() => {
              const scores = (jobResult.metrics?.initial_score != null && jobResult.metrics?.final_score != null)
                ? { initial: jobResult.metrics.initial_score, final: jobResult.metrics.final_score }
                : parsedScores
                  ? { initial: parsedScores.initial_score, final: parsedScores.final_score }
                  : null;
              if (!scores) return null;
              return (
                <div className="mt-3 flex items-center gap-3 bg-white/90 rounded-lg p-3 border border-green-300">
                  <TrendingUp className="h-5 w-5 text-green-600 shrink-0" />
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-600">Score</span>
                    <span className="text-lg font-semibold text-gray-500">{scores.initial.toFixed(3)}</span>
                    <ArrowRight className="h-4 w-4 text-green-600" />
                    <span className="text-lg font-bold text-green-700">{scores.final.toFixed(3)}</span>
                    {scores.final > scores.initial && (
                      <Badge className="bg-green-100 text-green-700 border-green-300 text-xs">
                        +{((scores.final - scores.initial) * 100).toFixed(1)}%
                      </Badge>
                    )}
                  </div>
                </div>
              );
            })()}

            {/* Metrics row */}
            {jobResult.metrics && (
              <div className="grid grid-cols-2 md:grid-cols-4 gap-3 mt-3">
                <div className="bg-white/80 rounded-lg p-2.5 border border-green-200">
                  <div className="text-xs text-gray-500">Training Data</div>
                  <div className="text-lg font-semibold text-green-800">{jobResult.metrics.train_data_size} traces</div>
                </div>
                <div className="bg-white/80 rounded-lg p-2.5 border border-green-200">
                  <div className="text-xs text-gray-500">Iterations</div>
                  <div className="text-lg font-semibold text-green-800">{jobResult.metrics.num_iterations}</div>
                </div>
                <div className="bg-white/80 rounded-lg p-2.5 border border-green-200">
                  <div className="text-xs text-gray-500">Original Length</div>
                  <div className="text-lg font-semibold text-green-800">{jobResult.metrics.original_length} chars</div>
                </div>
                <div className="bg-white/80 rounded-lg p-2.5 border border-green-200">
                  <div className="text-xs text-gray-500">Optimized Length</div>
                  <div className="text-lg font-semibold text-green-800">{jobResult.metrics.optimized_length} chars</div>
                </div>
              </div>
            )}

            {/* Expandable: Optimized Prompt (primary) */}
            {jobResult.optimized_prompt && (
              <div className="mt-3">
                <details open>
                  <summary className="cursor-pointer text-green-600 hover:text-green-800 text-sm font-medium">
                    View Optimized Prompt
                  </summary>
                  <div className="mt-2 relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 h-7 w-7 p-0 text-gray-400 hover:text-gray-700 z-10"
                      onClick={() => copyToClipboard(jobResult.optimized_prompt)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <pre className="p-3 bg-white rounded-lg text-xs overflow-auto max-h-[300px] border border-green-200 whitespace-pre-wrap font-mono text-gray-700">
{jobResult.optimized_prompt}
                    </pre>
                  </div>
                </details>
              </div>
            )}

            {/* Expandable: Original Prompt (secondary, collapsed by default) */}
            {jobResult.original_prompt && (
              <div className="mt-2">
                <details>
                  <summary className="cursor-pointer text-green-600 hover:text-green-800 text-sm">
                    View Original Prompt
                  </summary>
                  <div className="mt-2 relative">
                    <Button
                      variant="ghost"
                      size="sm"
                      className="absolute top-2 right-2 h-7 w-7 p-0 text-gray-400 hover:text-gray-700 z-10"
                      onClick={() => copyToClipboard(jobResult.original_prompt)}
                    >
                      <Copy className="h-3.5 w-3.5" />
                    </Button>
                    <pre className="p-3 bg-white rounded-lg text-xs overflow-auto max-h-[200px] border whitespace-pre-wrap font-mono text-gray-500">
{jobResult.original_prompt}
                    </pre>
                  </div>
                </details>
              </div>
            )}
          </div>
        </Card>
      )}

      {/* History */}
      <Card>
        <CardHeader>
          <button
            onClick={() => setShowHistory(!showHistory)}
            className="flex items-center justify-between w-full text-left"
          >
            <CardTitle className="text-lg flex items-center gap-2">
              <History className="h-5 w-5 text-gray-500" />
              Optimization History ({history.length})
            </CardTitle>
            {showHistory ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          </button>
        </CardHeader>
        {showHistory && (
          <CardContent>
            {history.length === 0 ? (
              <p className="text-sm text-gray-500 text-center py-4">No optimization runs yet</p>
            ) : (
              <div className="space-y-3">
                {history.map(run => (
                  <div
                    key={run.id}
                    className={`border rounded-lg p-3 cursor-pointer transition-colors ${
                      selectedRun?.id === run.id ? 'border-teal-300 bg-teal-50/30' : 'hover:bg-gray-50'
                    }`}
                    onClick={() => setSelectedRun(selectedRun?.id === run.id ? null : run)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <Badge
                          variant={
                            run.status === 'completed' ? 'default' :
                            run.status === 'failed' ? 'destructive' :
                            'secondary'
                          }
                          className="text-xs"
                        >
                          {run.status}
                        </Badge>
                        <span className="text-sm font-mono text-gray-600">{run.prompt_uri}</span>
                      </div>
                      <span className="text-xs text-gray-400">
                        {run.created_at ? new Date(run.created_at).toLocaleString() : ''}
                      </span>
                    </div>
                    {run.optimizer_model && (
                      <div className="text-xs text-gray-400 mt-1">
                        Model: {run.optimizer_model} | Iterations: {run.num_iterations} | Candidates: {run.num_candidates}
                        {run.target_endpoint && <> | Endpoint: <span className="font-mono">{run.target_endpoint}</span></>}
                      </div>
                    )}

                    {/* Expanded view */}
                    {selectedRun?.id === run.id && (
                      <div className="mt-3 border-t pt-3 space-y-3">
                        {/* Score improvement */}
                        {run.metrics?.initial_score != null && run.metrics?.final_score != null && (
                          <div className="flex items-center gap-2 bg-green-50 rounded p-2 border border-green-200">
                            <TrendingUp className="h-4 w-4 text-green-600 shrink-0" />
                            <span className="text-xs text-gray-600">Score</span>
                            <span className="text-sm font-semibold text-gray-500">{run.metrics.initial_score.toFixed(3)}</span>
                            <ArrowRight className="h-3 w-3 text-green-600" />
                            <span className="text-sm font-bold text-green-700">{run.metrics.final_score.toFixed(3)}</span>
                            {run.metrics.final_score > run.metrics.initial_score && (
                              <Badge className="bg-green-100 text-green-700 border-green-300 text-[10px]">
                                +{((run.metrics.final_score - run.metrics.initial_score) * 100).toFixed(1)}%
                              </Badge>
                            )}
                          </div>
                        )}

                        {/* Metrics row */}
                        {run.metrics && (
                          <div className="grid grid-cols-2 md:grid-cols-4 gap-2">
                            <div className="bg-gray-50 rounded p-2">
                              <div className="text-[10px] text-gray-500 uppercase">Training Data</div>
                              <div className="text-sm font-semibold">{run.metrics.train_data_size} traces</div>
                            </div>
                            <div className="bg-gray-50 rounded p-2">
                              <div className="text-[10px] text-gray-500 uppercase">Iterations</div>
                              <div className="text-sm font-semibold">{run.metrics.num_iterations}</div>
                            </div>
                            <div className="bg-gray-50 rounded p-2">
                              <div className="text-[10px] text-gray-500 uppercase">Original Length</div>
                              <div className="text-sm font-semibold">{run.metrics.original_length} chars</div>
                            </div>
                            <div className="bg-gray-50 rounded p-2">
                              <div className="text-[10px] text-gray-500 uppercase">Optimized Length</div>
                              <div className="text-sm font-semibold">{run.metrics.optimized_length} chars</div>
                            </div>
                          </div>
                        )}

                        {/* Optimized URI */}
                        {run.optimized_uri && (
                          <div className="flex items-center gap-2 text-xs">
                            <Link className="h-3 w-3 text-green-600" />
                            <span className="font-mono text-green-700">{run.optimized_uri}</span>
                            {run.optimized_version && (
                              <Badge variant="outline" className="text-[10px] text-green-600 border-green-300">
                                v{run.optimized_version} | alias: champion
                              </Badge>
                            )}
                          </div>
                        )}

                        {/* Optimized prompt (primary, open by default) */}
                        {run.optimized_prompt && (
                          <details open onClick={(e) => e.stopPropagation()}>
                            <summary className="cursor-pointer text-sm font-medium text-green-700 hover:text-green-900">
                              Optimized Prompt
                            </summary>
                            <div className="mt-1 relative">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="absolute top-1 right-1 h-6 w-6 p-0 text-gray-400 hover:text-gray-700 z-10"
                                onClick={(e) => { e.stopPropagation(); copyToClipboard(run.optimized_prompt!); }}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              <pre className="text-xs bg-green-50 p-3 rounded border border-green-200 max-h-60 overflow-y-auto whitespace-pre-wrap font-mono text-gray-700">
{run.optimized_prompt}
                              </pre>
                            </div>
                          </details>
                        )}

                        {/* Original prompt (collapsed by default) */}
                        {run.original_prompt && (
                          <details onClick={(e) => e.stopPropagation()}>
                            <summary className="cursor-pointer text-sm text-gray-500 hover:text-gray-700">
                              Original Prompt
                            </summary>
                            <div className="mt-1 relative">
                              <Button
                                variant="ghost"
                                size="sm"
                                className="absolute top-1 right-1 h-6 w-6 p-0 text-gray-400 hover:text-gray-700 z-10"
                                onClick={(e) => { e.stopPropagation(); copyToClipboard(run.original_prompt!); }}
                              >
                                <Copy className="h-3 w-3" />
                              </Button>
                              <pre className="text-xs bg-gray-50 p-3 rounded border max-h-40 overflow-y-auto whitespace-pre-wrap font-mono text-gray-500">
{run.original_prompt}
                              </pre>
                            </div>
                          </details>
                        )}

                        {/* No prompt available message */}
                        {!run.optimized_prompt && run.status === 'completed' && (
                          <p className="text-xs text-amber-600">Optimized prompt not saved for this run.</p>
                        )}
                        {!run.optimized_prompt && run.status === 'running' && (
                          <p className="text-xs text-gray-500">Optimization still in progress...</p>
                        )}

                        {/* Error details */}
                        {run.error && (
                          <div className="bg-red-50 border border-red-200 rounded p-2 text-xs text-red-700">
                            {run.error}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </CardContent>
        )}
      </Card>
    </div>
  );
}
