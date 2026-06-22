/**
 * `invokeTool()` — orchestrator-side dispatch for AI tool calls (PRD-202).
 *
 * The model emits a tool name (qualified `<pillar>.<tool>`) plus a
 * parameters object. We parse the name, route the call to the owning
 * pillar via the `pillar()` SDK, and normalise the SDK's `CallResult`
 * into the orchestrator-facing `ToolResult` discriminant.
 *
 * Routing convention
 *   We dispatch on the path `aiTools.<toolName>` against the owning
 *   pillar's tRPC router. Pillars expose their AI-callable surface under
 *   that sub-router so the dispatch path is uniform across pillars.
 *
 * Timeouts
 *   Each invocation is wrapped in a 30s deadline (per PRD). A timeout is
 *   surfaced as `tool-error` (`reason: 'timeout'`) — distinct from a
 *   `pillar-unavailable` because the pillar accepted the call but is
 *   taking too long.
 */
import { pillar } from '../client/index.js';

import type { CallResult, PillarClientOptions } from '../client/index.js';
import type { InvokeToolOptions, ToolResult } from './types.js';

export const DEFAULT_TOOL_TIMEOUT_MS = 30_000;

type PillarFactory = (id: string, options?: PillarClientOptions) => unknown;

type Internals = {
  pillarFactory: PillarFactory;
  clientOptions: PillarClientOptions;
};

const internals: Internals = {
  pillarFactory: pillar,
  clientOptions: {},
};

/**
 * Invoke an AI tool by its fully-qualified name. Always resolves —
 * failure is encoded in the `ToolResult.kind` discriminant.
 */
export async function invokeTool(
  toolName: string,
  parameters: object,
  options: InvokeToolOptions = {}
): Promise<ToolResult> {
  const parsed = parseToolName(toolName);
  if (parsed === null) return { kind: 'unknown-tool', toolName };

  const timeoutMs = options.timeoutMs ?? DEFAULT_TOOL_TIMEOUT_MS;
  const clientOptions: PillarClientOptions = {
    ...internals.clientOptions,
    callTimeoutMs: timeoutMs,
  };
  const handle = internals.pillarFactory(parsed.pillarId, clientOptions) as Record<
    string,
    Record<string, (input: unknown) => Promise<CallResult<unknown>>>
  >;

  const subRouter = handle['aiTools'];
  const procedure = subRouter?.[parsed.toolName];
  if (typeof procedure !== 'function') {
    return { kind: 'tool-error', reason: 'tool not exposed by pillar' };
  }
  // Note: the `pillar()` proxy returns a callable for any property path, so
  // the check above is only a defensive guard for non-proxy factories used in
  // tests. In production, a missing/removed tool surfaces as a
  // `contract-mismatch` CallResult (typically a 404 on the pillar) and is
  // mapped below to the same `tool-error` reason for a stable AI-facing
  // surface.

  const callResult = await withTimeout(procedure(parameters), timeoutMs);
  if (callResult === TIMEOUT) {
    return { kind: 'tool-error', reason: 'timeout' };
  }
  if (callResult instanceof Error) {
    return { kind: 'tool-error', reason: callResult.message };
  }
  return mapCallResult(parsed.pillarId, callResult);
}

/**
 * Parse a qualified tool name. Returns `null` for anything that doesn't
 * match `<pillar>.<tool>` with non-empty parts. Sub-router segments (a
 * second dot) are deliberately rejected — the convention is that AI
 * tools live under the `aiTools` namespace and use camelCase identifiers
 * with no nesting, per the manifest schema (PRD-200).
 */
function parseToolName(name: string): { pillarId: string; toolName: string } | null {
  const idx = name.indexOf('.');
  if (idx <= 0 || idx === name.length - 1) return null;
  const pillarId = name.slice(0, idx);
  const toolName = name.slice(idx + 1);
  if (toolName.includes('.')) return null;
  return { pillarId, toolName };
}

const TOOL_ERROR_FALLBACK: Record<
  'not-found' | 'conflict' | 'bad-request' | 'unauthorized',
  string
> = {
  'not-found': 'not found',
  conflict: 'conflict',
  'bad-request': 'bad request',
  unauthorized: 'unauthorized',
};

function mapCallResult(pillarId: string, result: CallResult<unknown>): ToolResult {
  switch (result.kind) {
    case 'ok':
      return { kind: 'ok', output: result.value };
    case 'unavailable':
    case 'degraded':
      return { kind: 'pillar-unavailable', pillar: pillarId };
    case 'contract-mismatch':
      return { kind: 'tool-error', reason: 'contract mismatch' };
    case 'not-found':
    case 'conflict':
    case 'bad-request':
    case 'unauthorized':
      return { kind: 'tool-error', reason: result.message ?? TOOL_ERROR_FALLBACK[result.kind] };
  }
}

const TIMEOUT = Symbol('tool-timeout');
type TimeoutMarker = typeof TIMEOUT;

async function withTimeout<T>(promise: Promise<T>, ms: number): Promise<T | TimeoutMarker | Error> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    return await Promise.race<T | TimeoutMarker | Error>([
      promise.catch((cause: unknown) => toError(cause)),
      new Promise<TimeoutMarker>((resolve) => {
        timer = setTimeout(() => resolve(TIMEOUT), ms);
      }),
    ]);
  } finally {
    if (timer !== undefined) clearTimeout(timer);
  }
}

function toError(cause: unknown): Error {
  if (cause instanceof Error) return cause;
  return new Error(typeof cause === 'string' ? cause : 'unknown error');
}

/**
 * Test hook — swap the underlying `pillar()` factory and/or per-call
 * client options. Production callers never touch this.
 */
export function __setInvokeToolInternals(overrides: Partial<Internals>): void {
  if (overrides.pillarFactory !== undefined) internals.pillarFactory = overrides.pillarFactory;
  if (overrides.clientOptions !== undefined) internals.clientOptions = overrides.clientOptions;
}

export function __resetInvokeToolInternals(): void {
  internals.pillarFactory = pillar;
  internals.clientOptions = {};
}
