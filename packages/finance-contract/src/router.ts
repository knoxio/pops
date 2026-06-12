/**
 * The finance pillar's tRPC router *type*. Type-only re-export from
 * `apps/pops-finance-api` — no runtime tRPC code crosses the contract
 * boundary. Consumers use this to type the `pillar('finance').foo.bar(…)`
 * SDK calls (Epic 05 / PRD-191).
 *
 * Current shape: `typeof financeRouter`. Until PRD-153 us-04 + PRD-155 land
 * the build-time declaration bundler, this re-export means the contract's
 * emitted `.d.ts` still references `@pops/finance-api` (which transitively
 * references `@pops/finance-db`). The lint rule in PRD-156 stays focused
 * on *value* imports; type-only references through the contract are
 * tolerated as the migration intermediate. The OpenAPI snapshot
 * (`openapi/finance.openapi.json`) is the long-term wire-typed alternative
 * consumers can use instead.
 */
import type { financeRouter } from '@pops/finance-api/router';

export type FinanceRouter = typeof financeRouter;
