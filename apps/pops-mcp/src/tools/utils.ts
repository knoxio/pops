import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

import type { CallResult } from '@pops/pillar-sdk/client';

export function ok(data: unknown): CallToolResult {
  return { content: [{ type: 'text', text: JSON.stringify(data, null, 2) }] };
}

export function toolError(message: string): CallToolResult {
  return { content: [{ type: 'text', text: message }], isError: true };
}

/**
 * Translate a `CallResult` from the pillar SDK into an MCP `CallToolResult`.
 * `ok` rounds-trips the value JSON. The three failure shapes
 * (`unavailable`, `degraded`, `contract-mismatch`) all surface as MCP
 * `toolError` so the LLM can read the reason and self-correct or retry.
 */
export function mapCallResult<T>(result: CallResult<T>): CallToolResult {
  if (result.kind === 'ok') return ok(result.value);
  if (result.kind === 'unavailable') {
    return toolError(`Pillar '${result.pillar}' is unavailable. Try again shortly.`);
  }
  if (result.kind === 'degraded') {
    return toolError(
      `Pillar '${result.pillar}' is reconciling (${result.reason}). Try again shortly.`
    );
  }
  const expected = result.expected ?? 'unknown';
  const actual = result.actual ?? 'unknown';
  return toolError(
    `Pillar '${result.pillar}' contract mismatch — expected ${expected}, got ${actual}.`
  );
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

// Pick the right helper to match the column's nullability: copyNullStr /
// copyNullNum forward an explicit `null` so callers can CLEAR a nullable
// backend column; copyOptStr / copyOptBool drop nulls so callers cannot
// accidentally NULL a NOT-NULL column.
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
