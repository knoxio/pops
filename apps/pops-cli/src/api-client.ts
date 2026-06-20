/**
 * Minimal REST HTTP client for the cerebrum pillar API.
 *
 * The CLI POSTs directly to a cerebrum-api host (`POPS_API_URL`) over the
 * pillar's idiomatic-REST surface: the request body is raw JSON, a success
 * comes back as the value verbatim, and a failure carries the REST error
 * envelope `{ message, code? }` (see `pillars/cerebrum/src/contract`).
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

interface RestErrorBody {
  message: string;
  code?: string;
}

function isRestErrorBody(value: unknown): value is RestErrorBody {
  if (typeof value !== 'object' || value === null) return false;
  const message = (value as { message?: unknown }).message;
  return typeof message === 'string';
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
      body: JSON.stringify(input),
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
  const failure = isRestErrorBody(parsed) ? parsed : null;
  const message = failure?.message ?? `Request failed with status ${response.status}`;
  throw new ApiError({
    message,
    code: failure?.code,
    httpStatus: response.status,
  });
}

/**
 * POST a JSON body to a cerebrum REST mutation `path` (e.g.
 * `/ingest/quick-capture`) and decode the value. The CLI makes no queries
 * today, so the surface stays narrow.
 *
 * @param config CLI config — `apiUrl` is the cerebrum-api base, `apiKey` (if
 *   present) is forwarded as `X-API-Key` for gateway compatibility.
 * @param path REST path on the cerebrum-api host, leading slash included.
 * @param input request body, serialised verbatim as JSON.
 */
export async function restMutation<T>(config: CliConfig, path: string, input: unknown): Promise<T> {
  const url = `${config.apiUrl}${path}`;
  const headers: Record<string, string> = {
    'content-type': 'application/json',
    accept: 'application/json',
  };
  if (config.apiKey) headers['x-api-key'] = config.apiKey;

  const response = await sendRequest(url, headers, input, config.apiUrl);
  const parsed = await parseBody(response, url);

  if (!response.ok) throwFailure(parsed, response);

  return parsed as T;
}
