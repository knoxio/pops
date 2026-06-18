import { initTRPC } from '@trpc/server';
import { z } from 'zod';

/**
 * Local, minimal tRPC router *type* for the shared FE client.
 *
 * The shell migrated every pillar to REST; the only procedures still
 * reached over tRPC from the FE are the cross-cutting surfaces the REST
 * cutover has not yet absorbed:
 *
 *   - `core.search.query` / `core.search.showMore` — the global search
 *     panel ({@link `@pops/navigation`} `useSearchInputData`).
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

const searchContext = z
  .object({
    app: z.string().nullable().default(null),
    page: z.string().nullable().default(null),
  })
  .optional();

interface SearchHit {
  uri: string;
  score: number;
  matchField: string;
  matchType: string;
  data?: unknown;
}

interface SearchSection {
  domain: string;
  moduleId: string;
  hits: SearchHit[];
  icon: string;
  color: string;
  isContextSection: boolean;
  totalCount: number;
}

interface NudgeListResult {
  nudges: unknown[];
  total: number;
}

const searchRouter = t.router({
  query: t.procedure
    .input(z.object({ text: z.string().min(1), context: searchContext }))
    .query((): { sections: SearchSection[] } => {
      throw new Error('type-only stub');
    }),
  showMore: t.procedure
    .input(
      z.object({
        domain: z.string().min(1),
        text: z.string().min(1),
        context: searchContext,
        offset: z.number().int().min(0).optional(),
      })
    )
    .query((): { hits: SearchHit[] } => {
      throw new Error('type-only stub');
    }),
});

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

const coreRouter = t.router({ search: searchRouter });
const cerebrumRouter = t.router({ nudges: nudgesRouter });

const appRouter = t.router({
  core: coreRouter,
  cerebrum: cerebrumRouter,
});

/**
 * Type of the live FE-facing tRPC surface. Replaces the monolith
 * `@pops/api` `AppRouter` so the FE graph stops importing the monolith.
 */
export type AppRouter = typeof appRouter;
