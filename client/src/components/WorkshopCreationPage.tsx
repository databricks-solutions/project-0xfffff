import React, { useMemo, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Loader2, Plus, Sparkles } from 'lucide-react';
import { useWorkshopContext } from '@/context/WorkshopContext';
import { useUser } from '@/context/UserContext';
import { useCreateWorkshop, useListWorkshops } from '@/hooks/useWorkshopApi';
import type { Workshop } from '@/client';
import { WorkshopMode } from '@/client/models/WorkshopMode';
import { toast } from 'sonner';

const DEFAULT_BRIEF = `We're calibrating a customer-support agent for our consumer fintech app.
We care most about: (1) factual accuracy on account/billing, (2) tone — empathetic but not patronizing, (3) safety on anything money-movement related.
Trace source is the prod-support-q2 MLflow experiment. Three SMEs from the support quality team will participate; I'll facilitate.`;

const RUBRIC_DRAFT = [
  { id: 'c1', text: 'Factual accuracy on account/billing', kind: 'binary', source: 'from your goals' },
  { id: 'c2', text: 'Empathetic tone (not patronizing)', kind: 'likert', source: 'from your goals' },
  { id: 'c3', text: 'Money-movement safety', kind: 'likert', source: 'from your goals' },
  { id: 'c4', text: 'Resolution clarity', kind: 'likert', source: 'support template' },
];

function slugifyName(value: string) {
  const source = value.toLowerCase().replace(/[^a-z0-9\s-]/g, '').trim();
  return source.split(/\s+/).slice(0, 4).join('-') || 'new-workshop';
}

export function WorkshopCreationPage() {
  const { setWorkshopId } = useWorkshopContext();
  const { user } = useUser();
  const createWorkshop = useCreateWorkshop();
  const { data: workshops, isLoading: isLoadingWorkshops } = useListWorkshops({
    userId: user?.id,
    enabled: !!user?.id,
  });

  const [brief, setBrief] = useState(DEFAULT_BRIEF);
  const [isManualMode, setIsManualMode] = useState(false);
  const [manualName, setManualName] = useState('LLM Judge Calibration Workshop');
  const [manualDescription, setManualDescription] = useState('');
  const [manualMode, setManualMode] = useState<WorkshopMode>(WorkshopMode.WORKSHOP);

  const drafted = useMemo(() => {
    const firstLine = brief.split('\n')[0] || '';
    const target = firstLine.replace(/^we('| a)?re\s+/i, '').trim() || 'customer support agent';
    const name = slugifyName(target);
    const summary = brief
      .replace(/\s+/g, ' ')
      .trim()
      .slice(0, 140);

    return {
      name,
      description: summary || 'Calibrate agent behavior with a focused starter sprint.',
      target,
      rubric: RUBRIC_DRAFT,
      judge: { model: 'claude-haiku-4-5', prompt: 'starter · v0' },
      pool: { source: 'mlflow · configured source', size: 'auto-detected', sampling: 'stratified · 50 for first sprint' },
      smes: ['Alice Chen', 'Bo Tanaka', 'Carla Mendes'],
    };
  }, [brief]);

  const handleSelectWorkshop = (workshop: Workshop) => {
    setWorkshopId(workshop.id);
    window.history.pushState({}, '', `?workshop=${workshop.id}`);
  };

  const handleCreateFromDraft = async () => {
    try {
      const workshop = await createWorkshop.mutateAsync({
        name: drafted.name,
        description: drafted.description,
        facilitator_id: user?.id || 'demo_facilitator',
        mode: WorkshopMode.WORKSHOP,
      });
      setWorkshopId(workshop.id);
      window.history.pushState({}, '', `?workshop=${workshop.id}`);
      toast.success('Workshop created and first sprint staged');
    } catch {
      toast.error('Could not create workshop');
    }
  };

  const handleCreateManual = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!manualName.trim() || !manualDescription.trim()) {
      toast.error('Please provide a name and use case description');
      return;
    }
    try {
      const workshop = await createWorkshop.mutateAsync({
        name: manualName.trim(),
        description: manualDescription.trim(),
        facilitator_id: user?.id || 'demo_facilitator',
        mode: manualMode,
      });
      setWorkshopId(workshop.id);
      window.history.pushState({}, '', `?workshop=${workshop.id}`);
    } catch {
      toast.error('Could not create workshop');
    }
  };

  return (
    <div className="w-full bg-background flex flex-col">
      <div className="px-6 py-4 border-b">
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setIsManualMode((v) => !v)}>
            {isManualMode ? 'Switch to conversational' : 'Switch to manual'}
          </Button>
          {!isManualMode && (
            <Button size="sm" onClick={handleCreateFromDraft} disabled={createWorkshop.isPending}>
              {createWorkshop.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
              Create workshop & stage first sprint
            </Button>
          )}
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs justify-end">
          <Badge variant="secondary">{workshops?.length || 0} existing workshops</Badge>
          <Badge variant={isManualMode ? 'outline' : 'default'}>
            {isManualMode ? 'Manual draft' : 'Conversational draft'}
          </Badge>
        </div>
      </div>

      {createWorkshop.error && (
        <div className="px-6 pt-4">
          <Alert>
            <AlertDescription>Failed to create workshop: {createWorkshop.error.message}</AlertDescription>
          </Alert>
        </div>
      )}

      {isManualMode ? (
        <div className="flex-1 overflow-auto px-6 py-6">
          <div className="max-w-2xl space-y-6">
            <Card>
              <CardHeader>
                <CardTitle>Manual workshop setup</CardTitle>
                <CardDescription>Directly set the workshop metadata and mode.</CardDescription>
              </CardHeader>
              <CardContent>
                <form onSubmit={handleCreateManual} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="manual-name">Workshop Name</Label>
                    <Input id="manual-name" value={manualName} onChange={(e) => setManualName(e.target.value)} required />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manual-mode">Mode</Label>
                    <select
                      id="manual-mode"
                      value={manualMode}
                      onChange={(e) => setManualMode(e.target.value as WorkshopMode)}
                      className="h-10 w-full rounded-md border bg-background px-3 text-sm"
                    >
                      <option value="workshop">Workshop (global rubric)</option>
                      <option value="eval">Eval (per-trace criteria)</option>
                    </select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="manual-description">Use Case Description</Label>
                    <Textarea
                      id="manual-description"
                      value={manualDescription}
                      onChange={(e) => setManualDescription(e.target.value)}
                      rows={5}
                      required
                    />
                  </div>
                  <Button type="submit" disabled={createWorkshop.isPending}>
                    {createWorkshop.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Plus className="h-4 w-4 mr-2" />}
                    Create Workshop
                  </Button>
                </form>
              </CardContent>
            </Card>

            {!!workshops?.length && (
              <Card>
                <CardHeader>
                  <CardTitle>Continue an existing workshop</CardTitle>
                </CardHeader>
                <CardContent className="space-y-2">
                  {isLoadingWorkshops ? (
                    <div className="text-sm text-muted-foreground">Loading workshops...</div>
                  ) : (
                    workshops.map((workshop) => (
                      <button
                        key={workshop.id}
                        type="button"
                        className="w-full p-3 rounded-md border text-left hover:bg-muted/50"
                        onClick={() => handleSelectWorkshop(workshop)}
                      >
                        <div className="font-medium">{workshop.name}</div>
                        {workshop.description && <div className="text-xs text-muted-foreground mt-1">{workshop.description}</div>}
                      </button>
                    ))
                  )}
                </CardContent>
              </Card>
            )}
          </div>
        </div>
      ) : (
        <div className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_1.1fr]">
          <div className="border-r p-8 min-h-0 flex flex-col gap-6">
            <div>
              <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-3">
                Step 1 · Tell us what you are calibrating
              </div>
              <h2 className="text-3xl leading-tight font-semibold max-w-xl">
                Describe the agent, what good looks like, and where the traces live.
              </h2>
              <p className="text-sm text-muted-foreground mt-3 max-w-xl">
                We draft a starter rubric, judge prompt, sampling plan, and SME list. You can review before creation.
              </p>
            </div>

            <div className="flex-1 min-h-0 flex flex-col">
              <Textarea
                value={brief}
                onChange={(e) => setBrief(e.target.value)}
                spellCheck={false}
                className="flex-1 resize-none font-serif text-base leading-7"
              />
              <div className="mt-2 text-xs text-muted-foreground flex items-center justify-between">
                <span>Plain English · about 120 words is enough</span>
                <div className="flex items-center gap-2">
                  <Button variant="ghost" size="sm" onClick={() => setBrief(DEFAULT_BRIEF)}>
                    <Sparkles className="h-3.5 w-3.5 mr-1" />
                    Re-draft
                  </Button>
                  <Button variant="ghost" size="sm">
                    Templates
                  </Button>
                </div>
              </div>
            </div>
          </div>

          <div className="min-h-0 overflow-y-auto bg-muted/20 p-6">
            <Card>
              <CardHeader>
                <div className="flex items-center justify-between gap-4">
                  <div>
                    <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-2">Draft workshop</div>
                    <CardTitle className="text-2xl">{drafted.name}</CardTitle>
                    <CardDescription className="mt-1">{drafted.description}</CardDescription>
                  </div>
                  <Badge variant="secondary" className="gap-1">
                    <Sparkles className="h-3.5 w-3.5" />
                    Auto-drafting
                  </Badge>
                </div>
              </CardHeader>
              <CardContent className="space-y-5">
                <SpecSection title="Rubric" subtitle={`${drafted.rubric.length} criteria · v0 draft`} actionLabel="Open editor">
                  <div className="space-y-2">
                    {drafted.rubric.map((criterion) => (
                      <div key={criterion.id} className="grid grid-cols-[auto_1fr_auto] gap-2 items-center border rounded-md px-3 py-2 bg-background">
                        <span className="font-mono text-[11px] text-muted-foreground">{criterion.id}</span>
                        <span className="text-sm">{criterion.text}</span>
                        <div className="text-right">
                          <Badge variant="outline" className="mr-2 text-[10px]">{criterion.kind}</Badge>
                          <span className="text-[10px] italic text-muted-foreground">{criterion.source}</span>
                        </div>
                      </div>
                    ))}
                  </div>
                </SpecSection>

                <SpecSection title="Judge" subtitle={`${drafted.judge.model} · ${drafted.judge.prompt}`} actionLabel="Configure">
                  <div className="border rounded-md bg-background px-3 py-2 text-xs text-muted-foreground font-mono">
                    You are grading with criteria c1-c4. Use binary scoring for c1 and 1-5 scales for c2-c4 with one-line rationale.
                  </div>
                </SpecSection>

                <SpecSection title="Trace pool" subtitle={drafted.pool.size} actionLabel="Tune sampler">
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div className="border rounded-md bg-background px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-1">Source</div>
                      <div className="text-sm font-medium">{drafted.pool.source}</div>
                    </div>
                    <div className="border rounded-md bg-background px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-1">Sampling</div>
                      <div className="text-sm font-medium">{drafted.pool.sampling}</div>
                    </div>
                  </div>
                </SpecSection>

                <SpecSection title="SMEs" subtitle={`${drafted.smes.length} invited · 1 facilitator`} actionLabel="Manage">
                  <div className="flex flex-wrap gap-2">
                    {drafted.smes.map((sme) => (
                      <Badge key={sme} variant="secondary">{sme} · SME</Badge>
                    ))}
                    <Badge variant="outline">You · facilitator</Badge>
                    <Button size="sm" variant="ghost"><Plus className="h-3.5 w-3.5 mr-1" />Add</Button>
                  </div>
                </SpecSection>
              </CardContent>
            </Card>

            {!!workshops?.length && (
              <div className="mt-4">
                <div className="text-xs text-muted-foreground mb-2">Continue existing workshop</div>
                <div className="space-y-2">
                  {workshops.map((workshop) => (
                    <button
                      key={workshop.id}
                      type="button"
                      className="w-full p-3 rounded-md border bg-background text-left hover:bg-muted/40"
                      onClick={() => handleSelectWorkshop(workshop)}
                    >
                      <div className="font-medium">{workshop.name}</div>
                      {workshop.description && <div className="text-xs text-muted-foreground mt-1">{workshop.description}</div>}
                    </button>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

function SpecSection({
  title,
  subtitle,
  actionLabel,
  children,
}: {
  title: string;
  subtitle?: string;
  actionLabel?: string;
  children: React.ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{title}</span>
          {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        </div>
        {actionLabel && (
          <Button variant="ghost" size="sm">
            {actionLabel}
          </Button>
        )}
      </div>
      {children}
    </div>
  );
}