import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function toolError(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

export function reqStr(args: Record<string, unknown>, key: string): string | null {
  const v = args[key];
  return typeof v === 'string' && v.length > 0 ? v : null;
}

export function optStr(args: Record<string, unknown>, key: string): string | undefined {
  const v = args[key];
  return typeof v === 'string' ? v : undefined;
}

export function optNum(args: Record<string, unknown>, key: string): number | undefined {
  const v = args[key];
  return typeof v === 'number' ? v : undefined;
}

export function optBool(args: Record<string, unknown>, key: string): boolean | undefined {
  const v = args[key];
  return typeof v === 'boolean' ? v : undefined;
}

// Three-state: absent → undefined (no-op), null → null (clear), string → string (set)
export function nullStr(args: Record<string, unknown>, key: string): string | null | undefined {
  if (!(key in args)) return undefined;
  const v = args[key];
  if (v === null) return null;
  return typeof v === 'string' ? v : undefined;
}

// Three-state: absent → undefined (no-op), null → null (clear), number → number (set)
export function nullNum(args: Record<string, unknown>, key: string): number | null | undefined {
  if (!(key in args)) return undefined;
  const v = args[key];
  if (v === null) return null;
  return typeof v === 'number' ? v : undefined;
}

// Patch builders for update handlers — copy a field into `out` iff the source
// arg is present and well-typed. The three-state nullable variants (`copyNullStr`,
// `copyNullNum`) pass an explicit `null` through to clear backend columns; the
// `copy*` (non-nullable) variants drop nulls so callers can't accidentally try
// to NULL a NOT-NULL column.
type Patch = Record<string, unknown>;

export function copyOptStr(out: Patch, args: Record<string, unknown>, key: string): void {
  const v = optStr(args, key);
  if (v !== undefined) out[key] = v;
}

export function copyOptBool(out: Patch, args: Record<string, unknown>, key: string): void {
  const v = optBool(args, key);
  if (v !== undefined) out[key] = v;
}

export function copyNullStr(out: Patch, args: Record<string, unknown>, key: string): void {
  const v = nullStr(args, key);
  if (v !== undefined) out[key] = v;
}

export function copyNullNum(out: Patch, args: Record<string, unknown>, key: string): void {
  const v = nullNum(args, key);
  if (v !== undefined) out[key] = v;
}
