import { FormEvent, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { useStartProjectSetup } from '@/hooks/useProjectSetupApi';

export function ProjectSetupPage() {
  const navigate = useNavigate();
  const startSetup = useStartProjectSetup();
  const [name, setName] = useState('support-agent-eval');
  const [agentDescription, setAgentDescription] = useState('');
  const [traceTable, setTraceTable] = useState('');

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
    await startSetup.mutateAsync({
      name,
      agent_description: agentDescription,
      facilitator_id: 'facilitator-1',
      trace_uc_table_path: traceTable,
    });
    navigate('/');
  };

  return (
    <main className="min-h-screen bg-[#fbfaf6] text-slate-950">
      <div className="mx-auto grid max-w-7xl gap-8 px-6 py-10 lg:grid-cols-[1fr_1.05fr]">
        <section className="space-y-6">
          <div className="space-y-3">
            <div className="font-mono text-xs uppercase tracking-[0.18em] text-slate-500">
              Day-one bootstrap
            </div>
            <h1 className="font-serif text-4xl leading-tight tracking-tight md:text-5xl">
              Describe the system, then launch the setup pipeline.
            </h1>
            <p className="max-w-xl text-sm leading-6 text-slate-600">
              Setup creates the long-lived project, records what is being calibrated, and queues the first
              bootstrap job. Trace snapshotting, rubric drafting, judge registration, scoring, and feed readiness
              attach to this project as later setup steps.
            </p>
          </div>

          <form onSubmit={onSubmit} className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="project-name">Project name</Label>
              <Input id="project-name" value={name} onChange={(event) => setName(event.target.value)} required />
            </div>
            <div className="space-y-2">
              <Label htmlFor="agent-description">Agent description</Label>
              <Textarea
                id="agent-description"
                value={agentDescription}
                onChange={(event) => setAgentDescription(event.target.value)}
                placeholder="What does this agent do? What does good look like?"
                className="min-h-36"
                required
              />
            </div>
            <div className="space-y-2">
              <Label htmlFor="trace-table">Unity Catalog trace table</Label>
              <Input
                id="trace-table"
                value={traceTable}
                onChange={(event) => setTraceTable(event.target.value)}
                placeholder="catalog.schema.table"
                required
              />
            </div>
            <Button type="submit" disabled={startSetup.isPending}>
              {startSetup.isPending ? 'Launching...' : 'Launch bootstrap'}
            </Button>
          </form>
        </section>

        <section className="space-y-4">
          <Card className="overflow-hidden border-slate-200 bg-white/80">
            <CardHeader>
              <CardTitle className="flex items-center gap-3">
                <span className="inline-block h-10 w-10 rounded-[45%_55%_50%_50%] bg-gradient-to-br from-indigo-500 to-fuchsia-500" />
                Draft project spec
              </CardTitle>
              <CardDescription>Live preview of the bootstrap shape.</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4 text-sm">
              <PreviewRow label="Project" value={name || 'Untitled project'} />
              <PreviewRow label="Trace pool" value={traceTable || 'Waiting for UC table'} />
              <PreviewRow label="Queue" value="Procrastinate setup pipeline" />
              <PreviewRow label="Next" value="Pin snapshot, draft rubric, register baseline judge" />
            </CardContent>
          </Card>

          <Card className="border-dashed bg-white/60">
            <CardHeader>
              <CardTitle className="text-lg">Foundation builder</CardTitle>
              <CardDescription>Trace pool first, then rubric, judge, participants, and feed readiness.</CardDescription>
            </CardHeader>
            <CardContent className="grid gap-3 text-sm sm:grid-cols-2">
              {['Trace snapshot', 'Starter rubric', 'Baseline judge', 'SME feed'].map((step) => (
                <div key={step} className="rounded-lg border bg-[#fbfaf6] p-3">
                  <div className="font-mono text-xs uppercase tracking-wide text-slate-500">Upcoming</div>
                  <div className="mt-1 font-medium">{step}</div>
                </div>
              ))}
            </CardContent>
          </Card>
        </section>
      </div>
    </main>
  );
}

function PreviewRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="grid grid-cols-[120px_1fr] gap-3 rounded-lg border bg-[#fbfaf6] p-3">
      <div className="font-mono text-xs uppercase tracking-wide text-slate-500">{label}</div>
      <div className="font-medium">{value}</div>
    </div>
  );
}
