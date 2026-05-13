import { AlertCircle, CheckCircle2, Loader2 } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';
import type { ProjectSetupProgress } from '@/client';

const SETUP_STEPS = [
  'Project record',
  'Setup job queued',
  'Trace source check',
  'Foundation preparation',
];

function progressValue(status: ProjectSetupProgress['status']) {
  if (status === 'completed') return 100;
  if (status === 'running') return 55;
  if (status === 'failed' || status === 'cancelled') return 100;
  return 20;
}

function statusTitle(status: ProjectSetupProgress['status']) {
  switch (status) {
    case 'running':
      return 'Setup running';
    case 'completed':
      return 'Setup completed';
    case 'failed':
    case 'enqueue_failed':
      return 'Setup needs attention';
    case 'cancelled':
      return 'Setup cancelled';
    default:
      return 'Setup pending';
  }
}

export function SetupProgressCard({
  progress,
  onRetry,
}: {
  progress: ProjectSetupProgress;
  onRetry?: () => void;
}) {
  const isFailure = progress.status === 'failed' || progress.status === 'enqueue_failed' || progress.status === 'cancelled';
  const isComplete = progress.status === 'completed';
  const currentStep = progress.current_step || 'queued';

  return (
    <Card className="border-indigo-200 bg-indigo-50/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          {isFailure ? (
            <AlertCircle className="h-5 w-5 text-destructive" />
          ) : isComplete ? (
            <CheckCircle2 className="h-5 w-5 text-green-600" />
          ) : (
            <Loader2 className="h-5 w-5 animate-spin text-indigo-600" />
          )}
          {statusTitle(progress.status)}
        </CardTitle>
        <CardDescription>
          Bootstrap job {progress.setup_job_id} for project {progress.project_id}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <Badge variant={isFailure ? 'destructive' : 'secondary'}>{progress.status}</Badge>
          <Badge variant="outline" className="font-mono">{currentStep}</Badge>
          {progress.queue_job_id && (
            <Badge variant="outline" className="font-mono">queue {progress.queue_job_id}</Badge>
          )}
        </div>

        <Progress value={progressValue(progress.status)} aria-label="Project setup progress" />

        <ol className="grid gap-2 text-sm sm:grid-cols-2">
          {SETUP_STEPS.map((step, index) => (
            <li key={step} className="rounded-lg border bg-background/80 p-3">
              <div className="text-xs font-medium uppercase tracking-wide text-muted-foreground">
                Step {index + 1}
              </div>
              <div className="mt-1 font-medium">{step}</div>
            </li>
          ))}
        </ol>

        {progress.message && <p className="text-sm text-muted-foreground">{progress.message}</p>}

        {isFailure && (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>Setup did not complete</AlertTitle>
            <AlertDescription className="space-y-3">
              <p>{progress.message || 'The setup job ended before the project became ready.'}</p>
              {onRetry && (
                <Button type="button" variant="outline" size="sm" onClick={onRetry}>
                  Retry setup
                </Button>
              )}
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
}
