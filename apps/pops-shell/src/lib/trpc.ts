/**
 * tRPC client configuration for the shell
 * Provides type-safe API access to the finance-api backend
 */
import { httpBatchLink } from "@trpc/client";
import { createTRPCReact } from "@trpc/react-query";
import type { AppRouter } from "@pops/finance-api";

/**
 * React Query hooks for tRPC
 * Use these hooks in components to call backend procedures
 */
export const trpc = createTRPCReact<AppRouter>();

/**
 * Create the tRPC client
 * Batches multiple requests into a single HTTP call for better performance
 */
export const trpcClient = trpc.createClient({
  links: [
    httpBatchLink({
      url: "/trpc", // Proxied by Vite to localhost:3000 in dev
      maxURLLength: 2083, // Don't batch if URL gets too long
    }),
  ],
});
