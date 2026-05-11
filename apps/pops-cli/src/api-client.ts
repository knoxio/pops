/**
 * Minimal tRPC HTTP client. Speaks the SuperJSON-style transformer-free wire
 * format that pops-api uses (`{ json: <payload> }` envelopes for inputs,
 * `result.data.json` envelope on success).
 *
 * Kept dependency-free so the CLI binary stays small. The shared
 * `@pops/api-client` package targets React and isn't appropriate here.
 */
import type { CliConfig } from './config.js';

export interface ApiErrorPayload {
  message: string;
  code?: string;
  httpStatus?: number;
}

export class ApiError extends Error {
  readonly code: string | undefined;
  readonly httpStatus: number | undefined;

  constructor(payload: ApiErrorPayload) {
    super(payload.message);
    this.name = 'ApiError';
    this.code = payload.code;
    this.httpStatus = payload.httpStatus;
  }
}

export class ApiUnreachableError extends Error {
  constructor(
    message: string,
    readonly cause: unknown
  ) {
    super(message);
    this.name = 'ApiUnreachableError';
  }
}

interface TrpcSuccess<T> {
  result: { data: { json: T } };
}

interface TrpcFailure {
  error: {
    json: { message: string; code?: string; data?: { httpStatus?: number; code?: string } };
  };
}

function isTrpcSuccess<T>(value: unknown): value is TrpcSuccess<T> {
  if (typeof value !== 'object' || value === null) return false;
  if (!('result' in value)) return false;
  const result = (value as { result?: unknown }).result;
  if (typeof result !== 'object' || result === null || !('data' in result)) return false;
  const data = (result as { data?: unknown }).data;
  if (typeof data !== 'object' || data === null) return false;
  return 'json' in data;
}

function isTrpcFailure(value: unknown): value is TrpcFailure {
  if (typeof value !== 'object' || value === null) return false;
  if (!('error' in value)) return false;
  const err = (value as { error?: unknown }).error;
  return typeof err === 'object' && err !== null && 'json' in err;
}

async function sendRequest(
  url: string,
  headers: Record<string, string>,
  input: unknown,
  apiUrl: string
): Promise<Response> {
  try {
    return await fetch(url, {
      method: 'POST',
      headers,
      body: JSON.stringify({ json: input }),
    });
  } catch (err) {
    throw new ApiUnreachableError(
      `Unable to reach the POPS API at ${apiUrl}. Is the server running?`,
      err
    );
  }
}

async function parseBody(response: Response, url: string): Promise<unknown> {
  const text = await response.text();
  if (text.length === 0) return null;
  try {
    return JSON.parse(text);
  } catch {
    throw new ApiError({
      message: `Unexpected non-JSON response from ${url} (status ${response.status})`,
      httpStatus: response.status,
    });
  }
}

function throwFailure(parsed: unknown, response: Response): never {
  const failure = isTrpcFailure(parsed) ? parsed.error.json : null;
  const message = failure?.message ?? `Request failed with status ${response.status}`;
  const code = failure?.code ?? failure?.data?.code;
  throw new ApiError({
    message,
    code,
    httpStatus: failure?.data?.httpStatus ?? response.status,
  });
}

/**
 * Invoke a tRPC mutation. The CLI doesn't make queries today, so we keep
 * the surface narrow — easy to add `query` later if needed.
 */
export async function trpcMutation<T>(
  config: CliConfig,
  procedure: string,
  input: unknown
): Promise<T> {
  const url = `${config.apiUrl}/trpc/${procedure}`;
  const headers: Record<string, string> = { 'content-type': 'application/json' };
  if (config.apiKey) headers['x-api-key'] = config.apiKey;

  const response = await sendRequest(url, headers, input, config.apiUrl);
  const parsed = await parseBody(response, url);

  if (!response.ok || isTrpcFailure(parsed)) throwFailure(parsed, response);
  if (!isTrpcSuccess<T>(parsed)) {
    throw new ApiError({
      message: 'Malformed tRPC success response (no result.data.json)',
      httpStatus: response.status,
    });
  }

  return parsed.result.data.json;
}
