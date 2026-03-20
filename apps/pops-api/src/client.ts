/**
 * tRPC client type export.
 * Import this type in client applications to get full type safety.
 *
 * @example
 * ```ts
 * import { createTRPCClient, httpBatchLink } from '@trpc/client';
 * import type { AppRouter } from '@pops/api/client';
 *
 * const client = createTRPCClient<AppRouter>({
 *   links: [
 *     httpBatchLink({
 *       url: 'http://localhost:3000/trpc',
 *       headers: {
 *         Authorization: `Bearer ${API_KEY}`,
 *       },
 *     }),
 *   ],
 * });
 * ```
 */
export type { AppRouter } from "./router.js";
