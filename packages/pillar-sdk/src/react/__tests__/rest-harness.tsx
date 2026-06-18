// @vitest-environment jsdom
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import {
  fakeFetch,
  FINANCE_OPENAPI,
  jsonResponse,
  type FakeRegistryTransport,
} from '../../client/__tests__/fixtures.js';
import { __resetSharedOpenApiCache, __resetSharedPillarClient } from '../../client/index.js';
import { PillarSdkProvider } from '../provider.js';

import type { ReactNode } from 'react';

import type { PillarClientOptions } from '../../client/factory.js';

/**
 * Shared React test harness for the REST-transport SDK.
 *
 * Every hook call now flows through the REST transport: the client first reads
 * the target pillar's OpenAPI document (`GET ${baseUrl}/openapi`) to resolve the
 * `[domain, proc]` path to a route, then issues the domain request. The harness
 * therefore:
 *
 * - serves {@link FINANCE_OPENAPI} on any `/openapi` GET so `getRouteMap`
 *   succeeds (the fixture's operationIds cover every path the React tests use),
 * - records ONLY the domain call in `calls` — the OpenAPI fetch is invisible, so
 *   `calls.length` / `calls[0]` assertions read exactly as they did under tRPC,
 * - returns the script's value verbatim as the success body (REST handlers
 *   return the raw value, NOT a tRPC `{ result: { data } }` envelope).
 */
export type FetchScript = (url: string, body: unknown) => Response | Promise<Response>;

export type Harness = {
  wrapper: (props: { children: ReactNode }) => ReactNode;
  queryClient: QueryClient;
  calls: { url: string; body: unknown }[];
};

export function resetReactSdkCaches(): void {
  __resetSharedPillarClient();
  __resetSharedOpenApiCache();
}

export function buildHarness(transport: FakeRegistryTransport, script: FetchScript): Harness {
  const calls: { url: string; body: unknown }[] = [];
  const fetchImpl = fakeFetch(async (url, init) => {
    if (url.endsWith('/openapi')) return jsonResponse(FINANCE_OPENAPI);
    let parsed: unknown = null;
    if (init?.body && typeof init.body === 'string') {
      try {
        parsed = JSON.parse(init.body);
      } catch {
        parsed = init.body;
      }
    }
    calls.push({ url, body: parsed });
    return script(url, parsed);
  });
  const options: PillarClientOptions = { transport, fetchImpl };
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
  const wrapper = ({ children }: { children: ReactNode }): ReactNode => (
    <QueryClientProvider client={queryClient}>
      <PillarSdkProvider options={options}>{children}</PillarSdkProvider>
    </QueryClientProvider>
  );
  return { wrapper, queryClient, calls };
}
