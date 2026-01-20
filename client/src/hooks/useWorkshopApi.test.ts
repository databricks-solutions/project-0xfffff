import { describe, expect, it, vi } from 'vitest';
import { invalidateAllWorkshopQueries, refetchAllWorkshopQueries } from './useWorkshopApi';

// @spec DISCOVERY_TRACE_ASSIGNMENT_SPEC
describe('workshop query helpers', () => {
  it('invalidateAllWorkshopQueries passes a predicate that matches workshop-related keys', () => {
    const queryClient = {
      invalidateQueries: vi.fn(),
    };

    invalidateAllWorkshopQueries(queryClient as any, 'w1');
    expect(queryClient.invalidateQueries).toHaveBeenCalledTimes(1);

    const arg = queryClient.invalidateQueries.mock.calls[0][0];
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
    };

    refetchAllWorkshopQueries(queryClient as any, 'w1');
    expect(queryClient.refetchQueries).toHaveBeenCalledTimes(1);

    const arg = queryClient.refetchQueries.mock.calls[0][0];
    const predicate = arg.predicate;
    expect(predicate({ queryKey: ['irr', 'w1'] })).toBe(true);
  });
});


