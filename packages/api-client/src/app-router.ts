import { initTRPC } from '@trpc/server';
import { z } from 'zod';

/**
 * Local, minimal tRPC router *type* for the shared FE client.
 *
 * The shell migrated every pillar to REST and the global search panel to
 * the federated-search orchestrator (`POST /orchestrator-api/search`), so
 * the only procedure still reached over tRPC from the FE is the one
 * cross-cutting surface the REST cutover has not yet absorbed:
 *
 *   - `cerebrum.nudges.list` — the shell's nudge bell (`NudgeIndicator`).
 *
 * Typing {@link `createTRPCReact`} against the full monolith `AppRouter`
 * (`@pops/api` → `src/router.ts`) dragged the entire red monolith into
 * every FE `tsc`. Since no FE surface needs the rest of the router, this
 * file declares only the live procedures with their real input/output
 * shapes, so the React Query hooks stay fully type-safe without importing
 * `@pops/api`.
 *
 * The resolvers below are type-only stubs — this router is never executed.
 * `createTRPCReact` and the tRPC links consume only its *type*. When the
 * remaining procedures migrate to REST, delete the corresponding branch
 * here (and its consumer) and the tRPC client can be retired entirely.
 */

const t = initTRPC.create();

interface NudgeListResult {
  nudges: unknown[];
  total: number;
}

const nudgesRouter = t.router({
  list: t.procedure
    .input(
      z
        .object({
          type: z.string().optional(),
          status: z.string().optional(),
          priority: z.string().optional(),
          limit: z.number().int().positive().max(100).optional(),
          offset: z.number().int().nonnegative().optional(),
        })
        .optional()
    )
    .query((): NudgeListResult => {
      throw new Error('type-only stub');
    }),
});

const cerebrumRouter = t.router({ nudges: nudgesRouter });

const appRouter = t.router({
  cerebrum: cerebrumRouter,
});

/**
 * Type of the live FE-facing tRPC surface. Replaces the monolith
 * `@pops/api` `AppRouter` so the FE graph stops importing the monolith.
 */
export type AppRouter = typeof appRouter;
