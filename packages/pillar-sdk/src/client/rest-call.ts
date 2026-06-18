/**
 * Idiomatic-REST transport for the server-side pillar SDK.
 *
 * Mirrors `performHttpCall`'s `HttpCallContext` / `CallResult` shape but speaks
 * the collapsed pillars' root-mounted ts-rest surface instead of the tRPC
 * envelope. A call's `[domain, proc]` path is resolved against the target
 * pillar's OpenAPI route map (operationId `'<domain>.<proc>'`, NO pillarId
 * prefix), then turned into a concrete request:
 *
 * - `path` params are substituted into the path template from `input`,
 * - `query` params are appended to the URL from `input`,
 * - for `hasBody` operations the remaining `input` (everything that is not a
 *   path/query param) is sent as the JSON body,
 * - success bodies are decoded as the raw value (REST handlers return the
 *   value directly, not a tRPC `{ result: { data } }` envelope),
 * - non-2xx responses are mapped via the REST error envelope `{ message, code? }`.
 *
 * This is ADDITIVE: it does not touch the tRPC transport. Pillar OpenAPI
 * fetching is wired in a later increment; for now the caller supplies the
 * route map (or the raw document, resolved here).
 */
import {
  buildRouteMap,
  type OpenApiDocument,
  type RouteEntry,
  type RouteMap,
} from './openapi-route-map.js';

import type { DiscoveredPillar } from './discovery.js';
import type { CallFailure, CallResult } from './errors.js';

const DEFAULT_CALL_TIMEOUT_MS = 30_000;

/**
 * The route source for a REST call. Either a pre-built {@link RouteMap} or the
 * raw OpenAPI document (which is converted to a map here). Accepting both keeps
 * the call site free to cache the map or hand over the doc verbatim.
 */
export type RestRouteSource = RouteMap | OpenApiDocument;

export interface RestCallContext {
  pillarId: string;
  discovered: DiscoveredPillar;
  path: readonly string[];
  input: unknown;
  routes: RestRouteSource;
  fetchImpl: typeof fetch;
  authHeaders?: () => Record<string, string> | Promise<Record<string, string>>;
  callTimeoutMs?: number;
}

function isRouteMap(routes: RestRouteSource): routes is RouteMap {
  return routes instanceof Map;
}

function resolveRouteMap(routes: RestRouteSource): RouteMap {
  if (isRouteMap(routes)) return routes;
  return buildRouteMap(routes);
}

export async function performRestCall(ctx: RestCallContext): Promise<CallResult<unknown>> {
  const operationId = ctx.path.join('.');
  const route = resolveRouteMap(ctx.routes).get(operationId);
  if (!route) {
    return {
      kind: 'contract-mismatch',
      pillar: ctx.pillarId,
      expected: operationId,
    };
  }

  const inputRecord = toRecord(ctx.input);
  const url = buildUrl(ctx.discovered.baseUrl, route, inputRecord);
  const headers = await buildHeaders(ctx.authHeaders);
  const init: RequestInit & { method: string } = { method: route.method, headers };
  if (route.hasBody) {
    init.body = JSON.stringify(buildBody(route, ctx.input, inputRecord));
  }

  const controller = new AbortController();
  const timeoutMs = ctx.callTimeoutMs ?? DEFAULT_CALL_TIMEOUT_MS;
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  init.signal = controller.signal;

  let response: Response;
  try {
    response = await ctx.fetchImpl(url, init);
  } catch {
    return { kind: 'unavailable', pillar: ctx.pillarId };
  } finally {
    clearTimeout(timer);
  }

  return mapResponse(ctx.pillarId, response);
}

function toRecord(input: unknown): Record<string, unknown> {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) return {};
  return input as Record<string, unknown>;
}

function buildUrl(baseUrl: string, route: RouteEntry, input: Record<string, unknown>): string {
  const path = substitutePathParams(route, input);
  const query = buildQueryString(route, input);
  return `${baseUrl.replace(/\/$/, '')}${path}${query}`;
}

function substitutePathParams(route: RouteEntry, input: Record<string, unknown>): string {
  let path = route.pathTemplate;
  for (const name of route.pathParams) {
    const value = input[name];
    path = path.replace(`{${name}}`, encodeURIComponent(stringifyParam(value)));
  }
  return path;
}

function buildQueryString(route: RouteEntry, input: Record<string, unknown>): string {
  const params = new URLSearchParams();
  for (const name of route.queryParams) {
    const value = input[name];
    if (value === undefined || value === null) continue;
    if (Array.isArray(value)) {
      for (const item of value) params.append(name, stringifyParam(item));
    } else {
      params.append(name, stringifyParam(value));
    }
  }
  const serialized = params.toString();
  return serialized.length > 0 ? `?${serialized}` : '';
}

function stringifyParam(value: unknown): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number' || typeof value === 'boolean') return String(value);
  if (value === undefined || value === null) return '';
  return String(value);
}

/**
 * The JSON body for a `hasBody` operation. Path and query params are stripped
 * from a record-shaped `input` so a mixed call (e.g. `PATCH /entities/{id}`
 * with `{ id, name }`) sends only the genuine body fields. A non-record
 * `input` (array / primitive / null) is sent verbatim — the contract owns it.
 */
function buildBody(
  route: RouteEntry,
  input: unknown,
  inputRecord: Record<string, unknown>
): unknown {
  if (typeof input !== 'object' || input === null || Array.isArray(input)) {
    return input ?? null;
  }
  const consumed = new Set<string>([...route.pathParams, ...route.queryParams]);
  if (consumed.size === 0) return input;
  const body: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(inputRecord)) {
    if (!consumed.has(key)) body[key] = value;
  }
  return body;
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

  return { kind: 'ok', value: parsed };
}

/**
 * Map a non-2xx REST response to a {@link CallFailure}.
 *
 * The collapsed pillars return a `{ message, code? }` envelope for the mapped
 * statuses (see `pillars/*\/src/api/rest/error-mapping.ts`): 400 → bad-request,
 * 404 → not-found, 409 → conflict. There is no `unauthorized` kind in
 * {@link CallFailure}, so 401 maps to `bad-request` (the closest "the caller
 * sent something the pillar rejected" kind); the gap is reported in the
 * increment notes. Any other status → `unavailable`.
 */
function mapHttpFailure(pillarId: string, status: number, body: unknown): CallFailure {
  const message = extractErrorMessage(body);
  switch (status) {
    case 400:
    case 401:
      return withMessage({ kind: 'bad-request', pillar: pillarId }, message);
    case 404:
      return withMessage({ kind: 'not-found', pillar: pillarId }, message);
    case 409:
      return withMessage({ kind: 'conflict', pillar: pillarId }, message);
    default:
      return { kind: 'unavailable', pillar: pillarId };
  }
}

type FailureWithMessage = Extract<CallFailure, { kind: 'not-found' | 'conflict' | 'bad-request' }>;

function withMessage(failure: FailureWithMessage, message: string | undefined): FailureWithMessage {
  if (!message) return failure;
  return { ...failure, message };
}

function extractErrorMessage(body: unknown): string | undefined {
  if (typeof body !== 'object' || body === null || Array.isArray(body)) return undefined;
  const message = (body as Record<string, unknown>)['message'];
  return typeof message === 'string' ? message : undefined;
}
