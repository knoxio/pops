import { createTRPCClient, httpBatchLink } from '@trpc/client';

import type { AppRouter } from '@pops/api';

let cachedClient: ReturnType<typeof createTRPCClient<AppRouter>> | null = null;

export function getClient(): ReturnType<typeof createTRPCClient<AppRouter>> {
  if (!cachedClient) {
    const apiUrl = process.env['POPS_API_URL'] ?? 'http://localhost:3000';
    const apiKey = process.env['POPS_API_KEY'] ?? '';

    cachedClient = createTRPCClient<AppRouter>({
      links: [
        httpBatchLink({
          url: `${apiUrl}/trpc`,
          headers: () => ({ 'x-api-key': apiKey }),
        }),
      ],
    });
  }
  return cachedClient;
}
