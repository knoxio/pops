import { httpBatchLink } from '@trpc/client';
import { createTRPCReact } from '@trpc/react-query';

/**
 * Shared tRPC client for all app packages.
 *
 * This is the single createTRPCReact instance that every package
 * imports from. The shell owns the Provider; app packages just
 * consume the hooks.
 */
import type { AppRouter } from '@pops/api';

/** React Query hooks for tRPC — shared across all app packages. */
export const trpc = createTRPCReact<AppRouter>();

/**
 * tRPC client instance with httpBatchLink.
 * Batches multiple requests into a single HTTP call for better performance.
 * The shell passes this to <trpc.Provider>.
 */
export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: '/trpc', // Proxied by Vite to localhost:3000 in dev
      maxURLLength: 2083,
    }),
  ],
});

export type { AppRouter };
