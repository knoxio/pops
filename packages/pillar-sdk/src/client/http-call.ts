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

  return mapResponse(ctx.pillarId, response);
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

async function mapResponse(pillarId: string, response: Response): Promise<CallResult<unknown>> {
  let parsed: unknown;
  let parseFailed = false;
  try {
    parsed = await response.json();
  } catch {
    parseFailed = true;
  }

  if (!response.ok) {
    return mapHttpFailure(pillarId, response.status, parseFailed ? undefined : parsed);
  }

  if (parseFailed) {
    return { kind: 'unavailable', pillar: pillarId };
  }

  return { kind: 'ok', value: extractTrpcResult(parsed) };
}

function mapHttpFailure(pillarId: string, status: number, body: unknown): CallFailure {
  const envelope = extractTrpcErrorEnvelope(body);
  const trpcKind = envelope ? trpcCodeToKind(envelope.code) : null;
  if (trpcKind) {
    return withMessage({ kind: trpcKind, pillar: pillarId }, envelope?.message);
  }
  if (status === 404) return { kind: 'not-found', pillar: pillarId };
  if (status === 409) return { kind: 'conflict', pillar: pillarId };
  if (status === 400) return { kind: 'bad-request', pillar: pillarId };
  return { kind: 'unavailable', pillar: pillarId };
}

type FailureWithMessage = Extract<CallFailure, { kind: 'not-found' | 'conflict' | 'bad-request' }>;

function withMessage(failure: FailureWithMessage, message: string | undefined): FailureWithMessage {
  if (!message) return failure;
  return { ...failure, message };
}

type TrpcErrorEnvelope = { code: string | undefined; message: string | undefined };

function extractTrpcErrorEnvelope(body: unknown): TrpcErrorEnvelope | null {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return null;
  const error = (body as Record<string, unknown>)['error'];
  if (typeof error !== 'object' || error === null) return null;
  const errorRecord = error as Record<string, unknown>;
  const data = errorRecord['data'];
  const code =
    typeof data === 'object' && data !== null && !Array.isArray(data)
      ? (data as Record<string, unknown>)['code']
      : undefined;
  const message = errorRecord['message'];
  return {
    code: typeof code === 'string' ? code : undefined,
    message: typeof message === 'string' ? message : undefined,
  };
}

function trpcCodeToKind(code: string | undefined): 'not-found' | 'conflict' | 'bad-request' | null {
  switch (code) {
    case 'NOT_FOUND':
      return 'not-found';
    case 'CONFLICT':
      return 'conflict';
    case 'BAD_REQUEST':
    case 'PARSE_ERROR':
    case 'UNPROCESSABLE_CONTENT':
      return 'bad-request';
    default:
      return null;
  }
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
