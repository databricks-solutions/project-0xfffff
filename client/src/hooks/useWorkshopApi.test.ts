import { describe, expect, it, vi } from 'vitest';
import type { QueryClient } from '@tanstack/react-query';
import { invalidateAllWorkshopQueries, refetchAllWorkshopQueries } from './useWorkshopApi';

// @spec DISCOVERY_TRACE_ASSIGNMENT_SPEC
describe('workshop query helpers', () => {
  it('invalidateAllWorkshopQueries passes a predicate that matches workshop-related keys', () => {
    const queryClient = {
      invalidateQueries: vi.fn(),
    } as unknown as QueryClient;

    invalidateAllWorkshopQueries(queryClient, 'w1');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect((queryClient.invalidateQueries as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);

    const arg = (queryClient.invalidateQueries as ReturnType<typeof vi.fn>).mock.calls[0][0];
    expect(typeof arg.predicate).toBe('function');

    const predicate = arg.predicate;
    expect(predicate({ queryKey: ['workshop', 'w1'] })).toBe(true);
    expect(predicate({ queryKey: ['findings', 'w1'] })).toBe(true);
    expect(predicate({ queryKey: ['annotations', 'w1'] })).toBe(true);
    expect(predicate({ queryKey: ['other', 'x'] })).toBe(false);
  });

  it('refetchAllWorkshopQueries passes a predicate that matches workshop-related keys', () => {
    const queryClient = {
      refetchQueries: vi.fn(),
    } as unknown as QueryClient;

    refetchAllWorkshopQueries(queryClient, 'w1');
    // eslint-disable-next-line @typescript-eslint/unbound-method
    expect((queryClient.refetchQueries as ReturnType<typeof vi.fn>)).toHaveBeenCalledTimes(1);

    const arg = (queryClient.refetchQueries as ReturnType<typeof vi.fn>).mock.calls[0][0];
    const predicate = arg.predicate;
    expect(predicate({ queryKey: ['irr', 'w1'] })).toBe(true);
  });
});


