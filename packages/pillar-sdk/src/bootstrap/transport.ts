import { createResolverLeg, resolveWithFallback } from '../registry-path-resolver.js';
import { LEGACY_REGISTRY_PATHS, REGISTRY_PATHS } from '../registry-paths.js';

import type { ManifestPayload } from '../manifest-schema/schema.js';
import type { ValidationIssue } from '../manifest-schema/validate.js';

const HTTP_NOT_FOUND = 404;

function isTransportNotFound(err: unknown): boolean {
  return err instanceof RegistryTransportError && err.status === HTTP_NOT_FOUND;
}

export interface RegistrationResult {
  pillarId: string;
}

export interface HeartbeatResult {
  pillarId: string;
  acknowledgedAt: string;
}

/**
 * Live capability statuses a pillar reports for the capability keys it owns —
 * `<capabilityKey> → up/down`. Carried additively on register + heartbeat so
 * core can resolve cross-pillar `capability` features against the owning
 * pillar's last-reported status. A pillar with no capabilities omits it.
 */
export type CapabilityStatuses = Record<string, boolean>;

export interface RegisterRequest {
  pillarId: string;
  baseUrl: string;
  manifest: ManifestPayload;
  capabilities?: CapabilityStatuses;
}

export interface RegistryTransport {
  register(payload: RegisterRequest): Promise<RegistrationResult>;
  heartbeat(pillarId: string, capabilities?: CapabilityStatuses): Promise<HeartbeatResult>;
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

type PostConfig = { baseUrl: string; fetchImpl: typeof fetch; timeoutMs: number };

async function postRegistry<T>(config: PostConfig, path: string, body: unknown): Promise<T> {
  let response: Response;
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), config.timeoutMs);
  try {
    response = await config.fetchImpl(`${config.baseUrl}${path}`, {
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
    if (response.status === 204) return undefined as T;
    return (await response.json()) as T;
  }

  const text = await response.text().catch(() => '');
  throw new RegistryTransportError(`POST ${path} → ${response.status} ${response.statusText}`, {
    status: response.status,
    issues: extractIssues(text),
    retriable: response.status >= 500,
  });
}

export function createHttpRegistryTransport(
  options: HttpRegistryTransportOptions
): RegistryTransport {
  const config: PostConfig = {
    baseUrl: options.baseUrl.replace(/\/+$/, ''),
    fetchImpl: options.fetchImpl ?? fetch,
    timeoutMs: options.timeoutMs ?? DEFAULT_TIMEOUT_MS,
  };

  const registerLeg = createResolverLeg(REGISTRY_PATHS.register, LEGACY_REGISTRY_PATHS.register);
  const heartbeatLeg = createResolverLeg(REGISTRY_PATHS.heartbeat, LEGACY_REGISTRY_PATHS.heartbeat);
  const deregisterLeg = createResolverLeg(
    REGISTRY_PATHS.deregister,
    LEGACY_REGISTRY_PATHS.deregister
  );

  return {
    async register(payload) {
      return resolveWithFallback<RegistrationResult>(registerLeg, isTransportNotFound, (path) =>
        postRegistry(config, path, payload)
      );
    },
    async heartbeat(pillarId, capabilities) {
      const body = { pillarId, ...(capabilities ? { capabilities } : {}) };
      return resolveWithFallback<HeartbeatResult>(heartbeatLeg, isTransportNotFound, (path) =>
        postRegistry(config, path, body)
      );
    },
    async unregister(pillarId) {
      await resolveWithFallback<void>(deregisterLeg, isTransportNotFound, (path) =>
        postRegistry(config, path, { pillarId })
      );
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
