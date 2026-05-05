import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { ProjectSetupProgress } from '@/hooks/useProjectSetupApi';

export function SetupProgressCard({ progress }: { progress: ProjectSetupProgress }) {
  const title = progress.status === 'running' ? 'Setup running' : `Setup ${progress.status}`;

  return (
    <Card className="border-indigo-200 bg-indigo-50/40">
      <CardHeader>
        <CardTitle className="flex items-center gap-2 text-lg">
          <span className="h-2.5 w-2.5 rounded-full bg-indigo-500" />
          {title}
        </CardTitle>
        <CardDescription>
          Bootstrap job {progress.setup_job_id} for project {progress.project_id}
        </CardDescription>
      </CardHeader>
      <CardContent className="space-y-3">
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <span className="rounded-full border bg-white px-2.5 py-1 font-mono text-xs">
            {progress.current_step}
          </span>
          {progress.queue_job_id && (
            <span className="rounded-full border bg-white px-2.5 py-1 font-mono text-xs">
              queue {progress.queue_job_id}
            </span>
          )}
        </div>
        {progress.message && <p className="text-sm text-muted-foreground">{progress.message}</p>}
      </CardContent>
    </Card>
  );
}
