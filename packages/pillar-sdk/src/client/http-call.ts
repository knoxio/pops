import type { DiscoveredPillar } from './discovery.js';
import type { CallFailure, CallResult } from './errors.js';

const DEFAULT_CALL_TIMEOUT_MS = 30_000;

export type HttpCallContext = {
  pillarId: string;
  discovered: DiscoveredPillar;
  path: readonly string[];
  input: unknown;
  fetchImpl: typeof fetch;
  authHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
  callTimeoutMs?: number;
};

export async function performHttpCall(ctx: HttpCallContext): Promise<CallResult<unknown>> {
  const namespacedPath = [ctx.pillarId, ...ctx.path];
  const url = buildUrl(ctx.discovered.baseUrl, namespacedPath);
  const headers = await buildHeaders(ctx.authHeaders);
  const body = JSON.stringify(ctx.input ?? null);

  const controller = new AbortController();
  const timeoutMs = ctx.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);

  let response: Response;
  try {
    response = await ctx.fetchImpl(url, {
      method: 'POST',
      headers,
      body,
      signal: controller.signal,
    });
  } catch {
    return { kind: 'unavailable', pillar: ctx.pillarId };
  } finally {
    clearTimeout(timer);
  }

  return mapResponse(ctx.pillarId, namespacedPath, response);
}

function buildUrl(baseUrl: string, path: readonly string[]): string {
  return `${baseUrl.replace(/\/$/, '')}/trpc/${path.join('.')}`;
}

async function buildHeaders(
  authHeaders?: () => Record<string, string> | Promise<Record<string, string>>
): Promise<Record<string, string>> {
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  if (!authHeaders) return headers;
  const extra = await authHeaders();
  for (const [k, v] of Object.entries(extra)) headers[k] = v;
  return headers;
}

async function mapResponse(
  pillarId: string,
  path: readonly string[],
  response: Response
): Promise<CallResult<unknown>> {
  if (response.status === 404) {
    const mismatch: CallFailure = {
      kind: 'contract-mismatch',
      pillar: pillarId,
      expected: path.join('.'),
    };
    return mismatch;
  }
  if (!response.ok) {
    return { kind: 'unavailable', pillar: pillarId };
  }
  let parsed: unknown;
  try {
    parsed = await response.json();
  } catch {
    return { kind: 'unavailable', pillar: pillarId };
  }
  return { kind: 'ok', value: extractTrpcResult(parsed) };
}

function extractTrpcResult(body: unknown): unknown {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return body;
  const record = body as Record<string, unknown>;
  const result = record['result'];
  if (typeof result === 'object' && result !== null && !Array.isArray(result) && 'data' in result) {
    return (result as Record<string, unknown>)['data'];
  }
  return body;
}
