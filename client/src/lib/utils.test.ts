import { describe, expect, it } from 'vitest';
import { cn } from './utils';

// @spec DESIGN_SYSTEM_SPEC
describe('cn', () => {
  it('merges classnames and tailwind conflicts', () => {
    expect(cn('p-2', 'p-4')).toBe('p-4');
    expect(cn('text-sm', false && 'hidden', undefined, 'text-lg')).toBe('text-lg');
  });
});


