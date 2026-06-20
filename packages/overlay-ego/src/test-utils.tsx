/**
 * Shared React Query test harness for overlay-ego component tests.
 *
 * The ego hooks drive the generated ego SDK through real React Query, so
 * tests mock the SDK module and wrap renders in a provider with retries
 * disabled.
 */
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

import type { ReactElement, ReactNode } from 'react';

export function createTestQueryClient(): QueryClient {
  return new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });
}

export function withQueryClient(ui: ReactElement, client: QueryClient = createTestQueryClient()) {
  function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={client}>{children}</QueryClientProvider>;
  }
  return <Wrapper>{ui}</Wrapper>;
}
