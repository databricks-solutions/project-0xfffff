import React from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import type { TraceCriterion, TraceCriterionType } from '@/hooks/useWorkshopApi';

type Props = {
  criteria: TraceCriterion[];
  onCreate: (data: { text: string; criterion_type: TraceCriterionType; weight: number }) => Promise<void>;
  onUpdate: (criterionId: string, data: { text?: string; criterion_type?: TraceCriterionType; weight?: number }) => Promise<void>;
  onDelete: (criterionId: string) => Promise<void>;
};

export function CriterionEditor({ criteria, onCreate, onUpdate, onDelete }: Props) {
  const [text, setText] = React.useState('');
  const [criterionType, setCriterionType] = React.useState<TraceCriterionType>('standard');
  const [weight, setWeight] = React.useState<number>(1);
  const [isSaving, setIsSaving] = React.useState(false);

  const handleCreate = async () => {
    if (!text.trim()) return;
    setIsSaving(true);
    try {
      await onCreate({ text: text.trim(), criterion_type: criterionType, weight });
      setText('');
      setCriterionType('standard');
      setWeight(1);
    } finally {
      setIsSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div className="rounded-md border p-4 space-y-3">
        <h3 className="font-medium">Add Criterion</h3>
        <div className="space-y-2">
          <Label htmlFor="criterion-text">Criterion text</Label>
          <Textarea
            id="criterion-text"
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder="Describe what the trace should or should not do"
            rows={3}
          />
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div className="space-y-2">
            <Label htmlFor="criterion-type">Type</Label>
            <select
              id="criterion-type"
              className="h-10 w-full rounded-md border px-3 text-sm"
              value={criterionType}
              onChange={(e) => setCriterionType(e.target.value as TraceCriterionType)}
            >
              <option value="standard">Standard</option>
              <option value="hurdle">Hurdle</option>
            </select>
          </div>
          <div className="space-y-2">
            <Label htmlFor="criterion-weight">Weight</Label>
            <Input
              id="criterion-weight"
              type="number"
              min={-10}
              max={10}
              value={weight}
              onChange={(e) => setWeight(Number(e.target.value))}
              disabled={criterionType === 'hurdle'}
            />
          </div>
        </div>
        <Button onClick={handleCreate} disabled={isSaving || !text.trim()}>
          Add Criterion
        </Button>
      </div>

      <div className="space-y-2">
        <h3 className="font-medium">Current Criteria</h3>
        {criteria.length === 0 ? (
          <p className="text-sm text-muted-foreground">No criteria yet for this trace.</p>
        ) : (
          criteria.map((criterion) => (
            <CriterionRow key={criterion.id} criterion={criterion} onUpdate={onUpdate} onDelete={onDelete} />
          ))
        )}
      </div>
    </div>
  );
}

function CriterionRow({
  criterion,
  onUpdate,
  onDelete,
}: {
  criterion: TraceCriterion;
  onUpdate: (criterionId: string, data: { text?: string; criterion_type?: TraceCriterionType; weight?: number }) => Promise<void>;
  onDelete: (criterionId: string) => Promise<void>;
}) {
  const [text, setText] = React.useState(criterion.text);
  const [criterionType, setCriterionType] = React.useState<TraceCriterionType>(criterion.criterion_type);
  const [weight, setWeight] = React.useState<number>(criterion.weight);
  const [isBusy, setIsBusy] = React.useState(false);

  const handleSave = async () => {
    setIsBusy(true);
    try {
      await onUpdate(criterion.id, {
        text,
        criterion_type: criterionType,
        weight,
      });
    } finally {
      setIsBusy(false);
    }
  };

  const handleDelete = async () => {
    setIsBusy(true);
    try {
      await onDelete(criterion.id);
    } finally {
      setIsBusy(false);
    }
  };

  return (
    <div className="rounded-md border p-3 space-y-2">
      <Textarea value={text} rows={2} onChange={(e) => setText(e.target.value)} />
      <div className="grid grid-cols-2 gap-3">
        <select
          className="h-9 rounded-md border px-2 text-sm"
          value={criterionType}
          onChange={(e) => setCriterionType(e.target.value as TraceCriterionType)}
        >
          <option value="standard">Standard</option>
          <option value="hurdle">Hurdle</option>
        </select>
        <Input
          type="number"
          min={-10}
          max={10}
          value={weight}
          onChange={(e) => setWeight(Number(e.target.value))}
          disabled={criterionType === 'hurdle'}
        />
      </div>
      <div className="flex gap-2">
        <Button variant="outline" size="sm" onClick={handleSave} disabled={isBusy}>
          Save
        </Button>
        <Button variant="destructive" size="sm" onClick={handleDelete} disabled={isBusy}>
          Delete
        </Button>
      </div>
    </div>
  );
}
