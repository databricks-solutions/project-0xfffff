import { FormEvent, ReactNode, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertCircle, Loader2, Sparkles } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useUser } from '@/context/UserContext';
import { isProjectSetupApiError, useProjectSetupState, useStartProjectSetup, useUpdateProjectSetup } from '@/hooks/useProjectSetupApi';

type FieldErrors = Partial<Record<'name' | 'agentDescription' | 'traceTable', string>>;

const DEFAULT_AGENT_DESCRIPTION = `We're calibrating a customer-support agent for our consumer fintech app.
We care most about: (1) factual accuracy on account/billing, (2) tone — empathetic but not patronizing, (3) safety on anything money-movement related.
Trace source is the prod-support-q2 Unity Catalog trace table.`;

function validateFields(name: string, agentDescription: string, traceTable: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!name.trim()) {
    errors.name = 'Project name is required.';
  }
  if (!agentDescription.trim()) {
    errors.agentDescription = 'Agent/app description is required.';
  }
  if (!traceTable.trim()) {
    errors.traceTable = 'Databricks UC trace table path is required.';
  }
  return errors;
}

export function ProjectSetupPage() {
  const navigate = useNavigate();
  const { user, permissions } = useUser();
  const setupState = useProjectSetupState({ enabled: !!user });
  const startSetup = useStartProjectSetup();
  const updateSetup = useUpdateProjectSetup();
  const [name, setName] = useState('support-agent-eval');
  const [agentDescription, setAgentDescription] = useState(DEFAULT_AGENT_DESCRIPTION);
  const [traceTable, setTraceTable] = useState('');
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});

  const canManageSetup = permissions?.can_manage_project === true;
  const isValid = Boolean(name.trim() && agentDescription.trim() && traceTable.trim());
  const hasServerProject = Boolean(setupState.data?.project_id);
  const submitError = updateSetup.error || startSetup.error;

  useEffect(() => {
    if (!setupState.data?.project_id) return;
    if (typeof setupState.data.name === 'string') {
      setName(setupState.data.name);
    }
    if (typeof setupState.data.agent_description === 'string') {
      setAgentDescription(setupState.data.agent_description);
    }
    if (typeof setupState.data.trace_uc_table_path === 'string') {
      setTraceTable(setupState.data.trace_uc_table_path);
    }
  }, [setupState.data]);

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    const errors = validateFields(name, agentDescription, traceTable);
    setFieldErrors(errors);
    if (Object.keys(errors).length > 0) {
      return;
    }

    const payload = {
      name: name.trim(),
      agent_description: agentDescription.trim(),
      trace_uc_table_path: traceTable.trim(),
    };
    if (hasServerProject) {
      await updateSetup.mutateAsync(payload);
    } else {
      await startSetup.mutateAsync(payload);
    }
    navigate('/', { replace: true });
  };

  if (!canManageSetup) {
    return (
      <main className="min-h-screen bg-background p-6">
        <Card className="mx-auto max-w-xl">
          <CardHeader>
            <CardTitle>Project setup requires facilitator access</CardTitle>
            <CardDescription>
              A facilitator or user with workshop management permissions must complete project setup before the workspace is available.
            </CardDescription>
          </CardHeader>
        </Card>
      </main>
    );
  }

  return (
    <main className="w-full min-h-screen bg-background text-foreground flex flex-col">
      <div className="px-6 py-4 border-b">
        <div className="flex items-center justify-end gap-2">
          <Button variant="ghost" size="sm" onClick={() => setAgentDescription(DEFAULT_AGENT_DESCRIPTION)}>
            Reset brief
          </Button>
          <Button type="submit" form="project-setup-form" size="sm" disabled={!isValid || startSetup.isPending || updateSetup.isPending || setupState.isLoading}>
            {startSetup.isPending || updateSetup.isPending ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Sparkles className="h-4 w-4 mr-2" />}
            {startSetup.isPending || updateSetup.isPending
              ? 'Saving setup...'
              : hasServerProject
                ? 'Save project setup'
                : 'Create project and start setup'}
          </Button>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs justify-end">
          <Badge variant="secondary">Databricks UC traces</Badge>
          <Badge variant="default">Project setup</Badge>
        </div>
      </div>

      <form id="project-setup-form" onSubmit={onSubmit} className="flex-1 min-h-0 grid grid-cols-1 lg:grid-cols-[1fr_1.1fr]">
        <section className="border-r p-8 min-h-0 flex flex-col gap-6">
          <div>
            <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-3">
              Step 1 · Tell us what you are calibrating
            </div>
            <h2 className="text-3xl leading-tight font-semibold max-w-xl">
              Describe the agent, what good looks like, and where the traces live.
            </h2>
            <p className="text-sm text-muted-foreground mt-3 max-w-xl">
              This creates the durable project and queues the setup pipeline. Rubric drafting, judge registration,
              scoring, and feed readiness attach as setup work after the project exists.
            </p>
          </div>

          <div className="flex-1 min-h-0 flex flex-col gap-4">
            {submitError && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Setup could not start</AlertTitle>
                <AlertDescription>{submitError.message}</AlertDescription>
              </Alert>
            )}
            {setupState.error && !(isProjectSetupApiError(setupState.error) && setupState.error.status === 404) && (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertTitle>Project setup could not load</AlertTitle>
                <AlertDescription>{setupState.error.message}</AlertDescription>
              </Alert>
            )}

            <div className="space-y-2">
              <Label htmlFor="agent-description">Agent/app description</Label>
              <Textarea
                id="agent-description"
                value={agentDescription}
                onChange={(event) => {
                  setAgentDescription(event.target.value);
                  setFieldErrors((current) => ({ ...current, agentDescription: undefined }));
                }}
                spellCheck={false}
                placeholder="What does this app or agent do? What does good look like?"
                className="min-h-56 flex-1 resize-none font-serif text-base leading-7"
                aria-invalid={!!fieldErrors.agentDescription}
                aria-describedby={fieldErrors.agentDescription ? 'agent-description-error' : undefined}
                required
              />
              {fieldErrors.agentDescription && (
                <p id="agent-description-error" className="text-sm text-destructive">{fieldErrors.agentDescription}</p>
              )}
            </div>

            <div className="mt-2 text-xs text-muted-foreground flex items-center justify-between">
              <span>Plain English · about 120 words is enough</span>
              <Button type="button" variant="ghost" size="sm" onClick={() => setAgentDescription(DEFAULT_AGENT_DESCRIPTION)}>
                <Sparkles className="h-3.5 w-3.5 mr-1" />
                Re-draft
              </Button>
            </div>
          </div>
        </section>

        <section className="min-h-0 overflow-y-auto bg-muted/20 p-6">
          <Card>
            <CardHeader>
              <div className="flex items-center justify-between gap-4">
                <div>
                  <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-2">Project setup</div>
                  <CardTitle className="text-2xl">{name || 'Untitled project'}</CardTitle>
                  <CardDescription className="mt-1">
                    Long-lived project setup backed by the project setup API.
                  </CardDescription>
                </div>
                <Badge variant="secondary" className="gap-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  Setup job
                </Badge>
              </div>
            </CardHeader>
            <CardContent className="space-y-5">
              <SpecSection title="Project" subtitle="required">
                <div className="space-y-2">
                  <Label htmlFor="project-name">Project name</Label>
                  <Input
                    id="project-name"
                    value={name}
                    onChange={(event) => {
                      setName(event.target.value);
                      setFieldErrors((current) => ({ ...current, name: undefined }));
                    }}
                    aria-invalid={!!fieldErrors.name}
                    aria-describedby={fieldErrors.name ? 'project-name-error' : undefined}
                    required
                  />
                  {fieldErrors.name && (
                    <p id="project-name-error" className="text-sm text-destructive">{fieldErrors.name}</p>
                  )}
                </div>
              </SpecSection>

              <SpecSection title="Trace pool" subtitle="Databricks Unity Catalog">
                <div className="space-y-2">
                  <Label htmlFor="trace-table">Unity Catalog trace table</Label>
                  <Input
                    id="trace-table"
                    value={traceTable}
                    onChange={(event) => {
                      setTraceTable(event.target.value);
                      setFieldErrors((current) => ({ ...current, traceTable: undefined }));
                    }}
                    placeholder="catalog.schema.table"
                    aria-invalid={!!fieldErrors.traceTable}
                    aria-describedby={fieldErrors.traceTable ? 'trace-table-error' : undefined}
                    required
                  />
                  {fieldErrors.traceTable && (
                    <p id="trace-table-error" className="text-sm text-destructive">{fieldErrors.traceTable}</p>
                  )}
                </div>
              </SpecSection>

              <SpecSection title="Facilitator" subtitle="from current user">
                <Input
                  id="facilitator-identity"
                  value={user?.name || user?.email || user?.id || ''}
                  readOnly
                  aria-readonly="true"
                />
              </SpecSection>

              <SpecSection title="Setup pipeline" subtitle="queued after creation">
                <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                  {['Persist project', 'Create setup job', 'Enqueue pipeline', 'Show progress'].map((step) => (
                    <div key={step} className="border rounded-md bg-background px-3 py-2">
                      <div className="text-[10px] uppercase tracking-[0.12em] text-muted-foreground mb-1">Step</div>
                      <div className="text-sm font-medium">{step}</div>
                    </div>
                  ))}
                </div>
              </SpecSection>
            </CardContent>
          </Card>
        </section>
      </form>
    </main>
  );
}

function SpecSection({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <div className="flex items-center gap-2">
          <span className="text-xs uppercase tracking-[0.12em] text-muted-foreground">{title}</span>
          {subtitle && <span className="text-xs text-muted-foreground">{subtitle}</span>}
        </div>
      </div>
      {children}
    </div>
  );
}
