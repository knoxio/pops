import type { ManifestPayload } from '../manifest-schema/schema.js';
import type { ValidationIssue } from '../manifest-schema/validate.js';

export interface RegistrationResult {
  pillarId: string;
}

export interface HeartbeatResult {
  pillarId: string;
  acknowledgedAt: string;
}

export interface RegistryTransport {
  register(payload: ManifestPayload): Promise<RegistrationResult>;
  heartbeat(pillarId: string): Promise<HeartbeatResult>;
  unregister(pillarId: string): Promise<void>;
}

export interface HttpRegistryTransportOptions {
  baseUrl: string;
  fetchImpl?: typeof fetch;
  /**
   * Per-request timeout in milliseconds. Prevents a hung TCP connection
   * from blocking pillar boot or shutdown indefinitely. Defaults to 10s.
   */
  timeoutMs?: number;
}

const DEFAULT_TIMEOUT_MS = 10_000;

export class RegistryTransportError extends Error {
  readonly status: number;
  readonly issues: ValidationIssue[] | undefined;
  readonly retriable: boolean;

  constructor(
    message: string,
    options: { status: number; issues?: ValidationIssue[]; retriable: boolean }
  ) {
    super(message);
    this.name = 'RegistryTransportError';
    this.status = options.status;
    this.issues = options.issues;
    this.retriable = options.retriable;
  }
}

export class RegistryNetworkError extends Error {
  readonly cause: unknown;

  constructor(message: string, cause: unknown) {
    super(message);
    this.name = 'RegistryNetworkError';
    this.cause = cause;
  }
}

export function createHttpRegistryTransport(
  options: HttpRegistryTransportOptions
): RegistryTransport {
  const baseUrl = options.baseUrl.replace(/\/+$/, '');
  const fetchImpl = options.fetchImpl ?? fetch;
  const timeoutMs = options.timeoutMs ?? DEFAULT_TIMEOUT_MS;

  async function post<T>(path: string, body: unknown): Promise<T> {
    let response: Response;
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
      response = await fetchImpl(`${baseUrl}${path}`, {
        method: 'POST',
        headers: { 'content-type': 'application/json' },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
    } catch (err) {
      throw new RegistryNetworkError(`POST ${path} failed`, err);
    } finally {
      clearTimeout(timer);
    }

    if (response.ok) {
      if (response.status === 204) {
        return undefined as T;
      }
      return (await response.json()) as T;
    }

    const text = await response.text().catch(() => '');
    const issues = extractIssues(text);
    throw new RegistryTransportError(`POST ${path} → ${response.status} ${response.statusText}`, {
      status: response.status,
      issues,
      retriable: response.status >= 500,
    });
  }

  return {
    async register(payload) {
      return post<RegistrationResult>('/registry/register', payload);
    },
    async heartbeat(pillarId) {
      return post<HeartbeatResult>('/registry/heartbeat', { pillarId });
    },
    async unregister(pillarId) {
      await post<void>('/registry/unregister', { pillarId });
    },
  };
}

function extractIssues(text: string): ValidationIssue[] | undefined {
  if (text.length === 0) return undefined;
  try {
    const parsed: unknown = JSON.parse(text);
    if (parsed === null || typeof parsed !== 'object') return undefined;
    const maybeIssues = (parsed as { issues?: unknown }).issues;
    if (!Array.isArray(maybeIssues)) return undefined;
    return maybeIssues.filter(isValidationIssue);
  } catch {
    return undefined;
  }
}

function isValidationIssue(value: unknown): value is ValidationIssue {
  if (value === null || typeof value !== 'object') return false;
  const v = value as Record<string, unknown>;
  return typeof v['field'] === 'string' && typeof v['reason'] === 'string';
}
