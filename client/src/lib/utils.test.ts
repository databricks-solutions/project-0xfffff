// @spec DESIGN_SYSTEM_SPEC
import { describe, expect, it } from 'vitest';
import { cn } from './utils';

describe('@spec:DESIGN_SYSTEM_SPEC cn utility', () => {
  describe('basic class merging', () => {
    it('combines multiple class strings', () => {
      expect(cn('foo', 'bar')).toBe('foo bar');
    });

    it('handles single class', () => {
      expect(cn('single-class')).toBe('single-class');
    });

    it('handles empty input', () => {
      expect(cn()).toBe('');
    });

    it('handles empty strings', () => {
      expect(cn('', 'valid-class', '')).toBe('valid-class');
    });
  });

  describe('Tailwind CSS conflict resolution', () => {
    it('resolves padding conflicts (later wins)', () => {
      expect(cn('p-2', 'p-4')).toBe('p-4');
    });

    it('resolves margin conflicts', () => {
      expect(cn('m-2', 'm-8')).toBe('m-8');
    });

    it('resolves text size conflicts', () => {
      expect(cn('text-sm', 'text-lg')).toBe('text-lg');
    });

    it('resolves background color conflicts', () => {
      expect(cn('bg-red-500', 'bg-blue-500')).toBe('bg-blue-500');
    });

    it('resolves text color conflicts', () => {
      expect(cn('text-gray-500', 'text-purple-600')).toBe('text-purple-600');
    });

    it('allows different utility categories to coexist', () => {
      const result = cn('p-4', 'm-2', 'text-lg', 'bg-white');
      expect(result).toContain('p-4');
      expect(result).toContain('m-2');
      expect(result).toContain('text-lg');
      expect(result).toContain('bg-white');
    });

    it('resolves directional padding conflicts', () => {
      expect(cn('px-2', 'px-4')).toBe('px-4');
      expect(cn('py-2', 'py-6')).toBe('py-6');
    });

    it('keeps non-conflicting directional utilities', () => {
      const result = cn('px-2', 'py-4');
      expect(result).toContain('px-2');
      expect(result).toContain('py-4');
    });
  });

  describe('conditional classes', () => {
    it('filters out falsy values', () => {
      expect(cn('always', false && 'never')).toBe('always');
    });

    it('filters out undefined values', () => {
      expect(cn('always', undefined, 'also')).toBe('always also');
    });

    it('filters out null values', () => {
      expect(cn('always', null, 'also')).toBe('always also');
    });

    it('handles conditional expression with true', () => {
      const isActive = true;
      expect(cn('base', isActive && 'active')).toBe('base active');
    });

    it('handles conditional expression with false', () => {
      const isActive = false;
      expect(cn('base', isActive && 'active')).toBe('base');
    });

    it('handles ternary expressions', () => {
      const variant = 'primary';
      expect(cn('btn', variant === 'primary' ? 'btn-primary' : 'btn-secondary')).toBe('btn btn-primary');
    });
  });

  describe('array inputs', () => {
    it('handles array of classes', () => {
      expect(cn(['class-a', 'class-b'])).toBe('class-a class-b');
    });

    it('handles mixed array and string inputs', () => {
      expect(cn('single', ['array-a', 'array-b'])).toBe('single array-a array-b');
    });

    it('filters falsy values from arrays', () => {
      expect(cn(['valid', false && 'invalid', null, undefined, 'also-valid'])).toBe('valid also-valid');
    });
  });

  describe('object inputs (clsx-style)', () => {
    it('handles object with boolean values', () => {
      expect(cn({ active: true, disabled: false })).toBe('active');
    });

    it('handles object with all true values', () => {
      expect(cn({ 'class-a': true, 'class-b': true })).toBe('class-a class-b');
    });

    it('handles empty object', () => {
      expect(cn({})).toBe('');
    });

    it('combines object and string inputs', () => {
      const result = cn('base', { active: true, hidden: false });
      expect(result).toBe('base active');
    });
  });

  describe('design system usage patterns', () => {
    it('handles button variant pattern', () => {
      const variant: string = 'primary';
      const size: string = 'lg';
      const result = cn(
        'inline-flex items-center justify-center rounded-md font-medium',
        variant === 'primary' && 'bg-primary text-primary-foreground hover:bg-primary/90',
        variant === 'secondary' && 'bg-secondary text-secondary-foreground',
        size === 'lg' && 'h-11 px-8',
        size === 'sm' && 'h-9 px-3'
      );
      expect(result).toContain('bg-primary');
      expect(result).toContain('h-11');
      expect(result).not.toContain('bg-secondary');
    });

    it('handles disabled state override', () => {
      const isDisabled = true;
      const result = cn(
        'bg-primary text-white',
        isDisabled && 'bg-gray-300 text-gray-500 cursor-not-allowed'
      );
      // When disabled, gray should override primary
      expect(result).toContain('bg-gray-300');
    });

    it('handles responsive classes', () => {
      const result = cn('p-2', 'md:p-4', 'lg:p-6');
      expect(result).toContain('p-2');
      expect(result).toContain('md:p-4');
      expect(result).toContain('lg:p-6');
    });

    it('handles dark mode classes', () => {
      const result = cn('bg-white', 'dark:bg-gray-900', 'text-black', 'dark:text-white');
      expect(result).toContain('bg-white');
      expect(result).toContain('dark:bg-gray-900');
      expect(result).toContain('text-black');
      expect(result).toContain('dark:text-white');
    });
  });
});
