import { describe, expect, it, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { CriterionEditor } from './CriterionEditor';

describe('@spec:EVAL_MODE_SPEC CriterionEditor', () => {
  it('shows empty state when no criteria', () => {
    render(
      <CriterionEditor
        criteria={[]}
        onCreate={async () => {}}
        onUpdate={async () => {}}
        onDelete={async () => {}}
      />
    );

    expect(screen.getByText('No criteria yet for this trace.')).toBeInTheDocument();
  });

  it('submits a new criterion', async () => {
    const user = userEvent.setup();
    const onCreate = vi.fn().mockResolvedValue(undefined);

    render(
      <CriterionEditor
        criteria={[]}
        onCreate={onCreate}
        onUpdate={async () => {}}
        onDelete={async () => {}}
      />
    );

    await user.type(
      screen.getByLabelText('Criterion text'),
      'The response includes the next step and owner.'
    );
    await user.selectOptions(screen.getByLabelText('Type'), 'standard');
    await user.clear(screen.getByLabelText('Weight'));
    await user.type(screen.getByLabelText('Weight'), '6');
    await user.click(screen.getByRole('button', { name: 'Add Criterion' }));

    expect(onCreate).toHaveBeenCalledWith({
      text: 'The response includes the next step and owner.',
      criterion_type: 'standard',
      weight: 6,
    });
  });
});
