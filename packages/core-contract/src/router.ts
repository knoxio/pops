/**
 * The core pillar's tRPC router *type*. Type-only re-export from
 * `apps/pops-core-api` — no runtime tRPC code crosses the contract
 * boundary. Consumers use this to type the `pillar('core').foo.bar(…)`
 * SDK calls (Epic 05 / PRD-191).
 *
 * Current shape: `typeof coreRouter`. Until PRD-153 us-04 + PRD-155 land
 * the build-time declaration bundler, this re-export means the contract's
 * emitted `.d.ts` still references `@pops/core-api` (which transitively
 * references `@pops/core-db`). The lint rule in PRD-156 stays focused
 * on *value* imports; type-only references through the contract are
 * tolerated as the migration intermediate. A committed OpenAPI snapshot
 * at `openapi/core.openapi.json` is the wire-typed alternative consumers
 * (e.g. iOS Swift codegen) can use instead.
 */
import type { coreRouter } from '@pops/core-api/router';

export type CoreRouter = typeof coreRouter;
