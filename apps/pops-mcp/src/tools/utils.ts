import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function toolError(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/** Extract a required non-empty string arg. Returns null if invalid. */
export function reqStr(args: Record<string, unknown>, key: string): string | null {
  const v = args[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

/** Extract an optional string arg. Returns undefined if absent or wrong type. */
export function optStr(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === 'string' ? v : undefined;
}

/** Extract an optional number arg. Returns undefined if absent or wrong type. */
export function optNum(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  return typeof v === 'number' ? v : undefined;
}

/** Extract an optional boolean arg. Returns undefined if absent or wrong type. */
export function optBool(args: Record<string, unknown>, key: string): boolean | undefined {
  const v = args[key];
  return typeof v === 'boolean' ? v : undefined;
}

/**
 * Extract a nullable optional string arg.
 * - Key absent → undefined (no-op in patch)
 * - Key = null → null (clear field)
 * - Key = string → string (set field)
 */
export function nullStr(args: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in args)) return undefined;
  const v = args[key];
  if (v === null) return null;
  return typeof v === 'string' ? v : undefined;
}
