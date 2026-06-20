/**
 * Shared React Query test harness for app-cerebrum component tests.
 *
 * Component tests mock the generated cerebrum SDK module and drive the
 * hooks through real React Query, so every render needs a provider with
 * retries disabled (so a single mocked rejection surfaces as an error
 * synchronously rather than being retried).
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
