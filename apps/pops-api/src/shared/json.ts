/**
 * JSON helpers used across modules.
 */

/**
 * Parse a JSON string expected to be a string array.
 * Returns [] on null/undefined, parse errors, or non-array values.
 */
export function parseJsonStringArray(json: string | null | undefined): string[] {
  if (!json) return [];
  try {
    const parsed = JSON.parse(json) as unknown;
    if (Array.isArray(parsed)) {
      return parsed.filter((t): t is string => typeof t === "string");
    }
  } catch {
    // ignore malformed JSON
  }
  return [];
}
