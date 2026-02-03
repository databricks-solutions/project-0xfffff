// @spec TRACE_DISPLAY_SPEC
import { describe, expect, it } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useJsonPathExtraction, applyJsonPathExtraction } from './useJsonPathExtraction';

describe('@spec:TRACE_DISPLAY_SPEC useJsonPathExtraction', () => {
  describe('useJsonPathExtraction hook', () => {
    it('returns original data when no jsonPath is provided', () => {
      const data = '{"message": "hello"}';
      const { result } = renderHook(() => useJsonPathExtraction(data, null));
      expect(result.current).toBe(data);
    });

    it('returns original data when jsonPath is empty string', () => {
      const data = '{"message": "hello"}';
      const { result } = renderHook(() => useJsonPathExtraction(data, ''));
      expect(result.current).toBe(data);
    });

    it('returns original data when jsonPath is whitespace only', () => {
      const data = '{"message": "hello"}';
      const { result } = renderHook(() => useJsonPathExtraction(data, '   '));
      expect(result.current).toBe(data);
    });

    it('extracts simple value from JSON', () => {
      const data = '{"message": "hello world"}';
      const { result } = renderHook(() => useJsonPathExtraction(data, '$.message'));
      expect(result.current).toBe('hello world');
    });

    it('extracts nested value', () => {
      const data = '{"response": {"text": "nested value"}}';
      const { result } = renderHook(() => useJsonPathExtraction(data, '$.response.text'));
      expect(result.current).toBe('nested value');
    });

    it('extracts array element by index', () => {
      const data = '{"items": ["first", "second", "third"]}';
      const { result } = renderHook(() => useJsonPathExtraction(data, '$.items[0]'));
      expect(result.current).toBe('first');
    });

    it('extracts multiple values with wildcard and joins with newlines', () => {
      const data = '{"messages": [{"content": "one"}, {"content": "two"}, {"content": "three"}]}';
      const { result } = renderHook(() => useJsonPathExtraction(data, '$.messages[*].content'));
      expect(result.current).toBe('one\ntwo\nthree');
    });

    it('returns original data when JSONPath returns no matches', () => {
      const data = '{"foo": "bar"}';
      const { result } = renderHook(() => useJsonPathExtraction(data, '$.nonexistent'));
      expect(result.current).toBe(data);
    });

    it('returns original data when JSON is invalid', () => {
      const data = 'not valid json';
      const { result } = renderHook(() => useJsonPathExtraction(data, '$.anything'));
      expect(result.current).toBe(data);
    });

    it('returns original data when result is null', () => {
      const data = '{"value": null}';
      const { result } = renderHook(() => useJsonPathExtraction(data, '$.value'));
      expect(result.current).toBe(data);
    });

    it('converts numeric values to strings', () => {
      const data = '{"count": 42}';
      const { result } = renderHook(() => useJsonPathExtraction(data, '$.count'));
      expect(result.current).toBe('42');
    });

    it('converts boolean values to strings', () => {
      const data = '{"active": true}';
      const { result } = renderHook(() => useJsonPathExtraction(data, '$.active'));
      expect(result.current).toBe('true');
    });

    it('serializes object values to JSON', () => {
      const data = '{"nested": {"key": "value"}}';
      const { result } = renderHook(() => useJsonPathExtraction(data, '$.nested'));
      expect(result.current).toContain('"key"');
      expect(result.current).toContain('"value"');
    });

    it('filters out null values from multiple results', () => {
      const data = '{"items": ["one", null, "three"]}';
      const { result } = renderHook(() => useJsonPathExtraction(data, '$.items[*]'));
      expect(result.current).toBe('one\nthree');
    });
  });

  describe('applyJsonPathExtraction function', () => {
    it('returns success: false when no jsonPath is provided', () => {
      const data = '{"message": "hello"}';
      const result = applyJsonPathExtraction(data, null);
      expect(result.success).toBe(false);
      expect(result.result).toBe(data);
    });

    it('returns success: true with extracted value', () => {
      const data = '{"message": "hello"}';
      const result = applyJsonPathExtraction(data, '$.message');
      expect(result.success).toBe(true);
      expect(result.result).toBe('hello');
    });

    it('returns success: false when no matches found', () => {
      const data = '{"foo": "bar"}';
      const result = applyJsonPathExtraction(data, '$.missing');
      expect(result.success).toBe(false);
      expect(result.result).toBe(data);
    });

    it('returns success: false for invalid JSON', () => {
      const data = 'invalid json';
      const result = applyJsonPathExtraction(data, '$.anything');
      expect(result.success).toBe(false);
      expect(result.result).toBe(data);
    });

    it('extracts deeply nested value', () => {
      const data = '{"a": {"b": {"c": {"d": "deep"}}}}';
      const result = applyJsonPathExtraction(data, '$.a.b.c.d');
      expect(result.success).toBe(true);
      expect(result.result).toBe('deep');
    });

    it('joins multiple matches with newlines', () => {
      const data = '{"list": ["alpha", "beta", "gamma"]}';
      const result = applyJsonPathExtraction(data, '$.list[*]');
      expect(result.success).toBe(true);
      expect(result.result).toBe('alpha\nbeta\ngamma');
    });

    it('handles empty array result as failure', () => {
      const data = '{"items": []}';
      const result = applyJsonPathExtraction(data, '$.items[*]');
      expect(result.success).toBe(false);
    });

    it('extracts from typical LLM response format', () => {
      const data = JSON.stringify({
        choices: [
          { message: { content: 'Hello from AI!' } }
        ]
      });
      const result = applyJsonPathExtraction(data, '$.choices[0].message.content');
      expect(result.success).toBe(true);
      expect(result.result).toBe('Hello from AI!');
    });
  });
});
