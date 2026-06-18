import { validManifest } from '../../__tests__/fixtures.js';

import type { DiscoveredPillar, DiscoveryTransport } from '../discovery.js';

export function discoveredPillar(overrides: Partial<DiscoveredPillar> = {}): DiscoveredPillar {
  return {
    pillarId: 'finance',
    baseUrl: 'http://finance-api:3004',
    status: 'healthy',
    manifest: validManifest(),
    lastSeenAt: '2026-06-12T00:00:00.000Z',
    registered: true,
    ...overrides,
  };
}

export type FakeRegistryOptions = {
  pillars?: DiscoveredPillar[];
  delayMs?: number;
  failNext?: number;
  failError?: Error;
};

export class FakeRegistryTransport implements DiscoveryTransport {
  callCount = 0;
  private pillars: DiscoveredPillar[];
  private delayMs: number;
  private failNext: number;
  private failError: Error;

  constructor(options: FakeRegistryOptions = {}) {
    this.pillars = options.pillars ?? [discoveredPillar()];
    this.delayMs = options.delayMs ?? 0;
    this.failNext = options.failNext ?? 0;
    this.failError = options.failError ?? new Error('registry unreachable');
  }

  setPillars(pillars: DiscoveredPillar[]): void {
    this.pillars = pillars;
  }

  async fetchSnapshot(): Promise<readonly DiscoveredPillar[]> {
    this.callCount += 1;
    if (this.delayMs > 0) await new Promise((r) => setTimeout(r, this.delayMs));
    if (this.failNext > 0) {
      this.failNext -= 1;
      throw this.failError;
    }
    return this.pillars;
  }
}

export type FakeFetchInit = Parameters<typeof fetch>[1];

export type FakeFetchHandler = (
  url: string,
  init: FakeFetchInit | undefined
) => Promise<Response> | Response;

export function fakeFetch(handler: FakeFetchHandler): typeof fetch {
  const wrapped: typeof fetch = async (input, init) => {
    const url = typeof input === 'string' ? input : input.toString();
    return handler(url, init);
  };
  return wrapped;
}

export function jsonResponse(
  body: unknown,
  init: { status?: number; statusText?: string; headers?: Record<string, string> } = {}
): Response {
  return new Response(JSON.stringify(body), {
    status: init.status ?? 200,
    statusText: init.statusText,
    headers: { 'content-type': 'application/json', ...init.headers },
  });
}

/**
 * OpenAPI document the REST-transport factory/call-dynamic tests resolve their
 * calls against, served at `GET ${baseUrl}/openapi` by {@link restFetch}.
 *
 * operationIds are the `[domain, proc].join('.')` paths the typed proxy /
 * `callDynamic` produce. Every operation is a body-carrying POST so the call
 * `input` passes through verbatim as the JSON body — this mirrors the old tRPC
 * POST-body semantics and keeps the body assertions stable across the flip; the
 * only thing that changes is the URL shape (`/trpc/<dotted>` → idiomatic REST).
 */
export const FINANCE_OPENAPI = {
  openapi: '3.0.2',
  paths: {
    '/wishlist/list': { post: { operationId: 'wishlist.list', requestBody: {} } },
    '/wishlist/get': { post: { operationId: 'wishlist.get', requestBody: {} } },
    '/wishlist/create': { post: { operationId: 'wishlist.create', requestBody: {} } },
    '/wishlist/toggle': { post: { operationId: 'wishlist.toggle', requestBody: {} } },
    '/watchlist/list': { post: { operationId: 'watchlist.list', requestBody: {} } },
    '/ingredients/get': { post: { operationId: 'ingredients.get', requestBody: {} } },
    '/units/get': { post: { operationId: 'units.get', requestBody: {} } },
    '/transactions/imports/create': {
      post: { operationId: 'transactions.imports.create', requestBody: {} },
    },
    '/budgets/list': { post: { operationId: 'budgets.list', requestBody: {} } },
  },
} as const;

const OPENAPI_SUFFIX = '/openapi';

/**
 * The REST-transport equivalent of `recordingFetch`. Serves the pillar's
 * OpenAPI document on `GET ${baseUrl}/openapi` (so the factory's `getRouteMap`
 * step succeeds) and dispatches every other request — the actual domain call —
 * to `responder`, recording the URL + parsed JSON body. The OpenAPI document
 * defaults to {@link FINANCE_OPENAPI}.
 */
export function restFetch(
  responder: (url: string, body: unknown) => Response | Promise<Response>,
  openapi: unknown = FINANCE_OPENAPI
): { fetchImpl: typeof fetch; calls: { url: string; body: unknown }[] } {
  const calls: { url: string; body: unknown }[] = [];
  const handler: FakeFetchHandler = async (url, init) => {
    if (url.endsWith(OPENAPI_SUFFIX)) return jsonResponse(openapi);
    let parsed: unknown = null;
    if (typeof init?.body === 'string' && init.body.length > 0) {
      try {
        parsed = JSON.parse(init.body);
      } catch {
        parsed = init.body;
      }
    }
    calls.push({ url, body: parsed });
    return responder(url, parsed);
  };
  return { fetchImpl: fakeFetch(handler), calls };
}
