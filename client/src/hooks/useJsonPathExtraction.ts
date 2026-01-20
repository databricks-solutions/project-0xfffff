/**
 * Hook for applying JSONPath extraction to trace data.
 *
 * This hook takes raw trace data and an optional JSONPath expression,
 * and returns either the extracted value(s) or the original data.
 */

import { useMemo } from 'react';
import { JSONPath } from 'jsonpath-plus';

/**
 * Apply JSONPath extraction to a data string.
 *
 * @param data - The raw data string (expected to be JSON)
 * @param jsonPath - Optional JSONPath expression to extract specific values
 * @returns The extracted value(s) joined by newlines, or the original data on failure
 */
export function useJsonPathExtraction(
  data: string,
  jsonPath: string | null | undefined
): string {
  return useMemo(() => {
    // If no JSONPath configured, return original data
    if (!jsonPath || !jsonPath.trim()) {
      return data;
    }

    try {
      // Parse the data as JSON
      const parsed = JSON.parse(data);

      // Apply JSONPath
      const results = JSONPath({ path: jsonPath, json: parsed });

      // Check for empty results
      if (!results || results.length === 0) {
        return data;
      }

      // Convert results to strings and filter out nulls/empty
      const stringResults = results
        .filter((r: unknown) => r !== null && r !== undefined)
        .map((r: unknown) => {
          if (typeof r === 'string') return r;
          return String(r);
        })
        .filter((s: string) => s && s !== 'null' && s !== 'undefined');

      // If no valid string results, return original
      if (stringResults.length === 0) {
        return data;
      }

      // Join multiple results with newlines
      const extracted = stringResults.join('\n');

      // Final validation
      if (!extracted || extracted === 'null' || extracted === 'undefined') {
        return data;
      }

      return extracted;
    } catch {
      // On any error, return original data
      return data;
    }
  }, [data, jsonPath]);
}

/**
 * Apply JSONPath extraction (non-hook version for use outside components).
 *
 * @param data - The raw data string (expected to be JSON)
 * @param jsonPath - Optional JSONPath expression to extract specific values
 * @returns Object with extracted value and success flag
 */
export function applyJsonPathExtraction(
  data: string,
  jsonPath: string | null | undefined
): { result: string; success: boolean } {
  // If no JSONPath configured, return original data
  if (!jsonPath || !jsonPath.trim()) {
    return { result: data, success: false };
  }

  try {
    // Parse the data as JSON
    const parsed = JSON.parse(data);

    // Apply JSONPath
    const results = JSONPath({ path: jsonPath, json: parsed });

    // Check for empty results
    if (!results || results.length === 0) {
      return { result: data, success: false };
    }

    // Convert results to strings and filter out nulls/empty
    const stringResults = results
      .filter((r: unknown) => r !== null && r !== undefined)
      .map((r: unknown) => {
        if (typeof r === 'string') return r;
        return String(r);
      })
      .filter((s: string) => s && s !== 'null' && s !== 'undefined');

    // If no valid string results, return original
    if (stringResults.length === 0) {
      return { result: data, success: false };
    }

    // Join multiple results with newlines
    const extracted = stringResults.join('\n');

    // Final validation
    if (!extracted || extracted === 'null' || extracted === 'undefined') {
      return { result: data, success: false };
    }

    return { result: extracted, success: true };
  } catch {
    // On any error, return original data
    return { result: data, success: false };
  }
}
