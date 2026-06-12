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
