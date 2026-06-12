/**
 * The lists pillar's tRPC router *type*. Type-only re-export from
 * `apps/pops-lists-api` — no runtime tRPC code crosses the contract
 * boundary. Consumers use this to type the `pillar('lists').foo.bar(…)`
 * SDK calls (Epic 05 / PRD-191).
 *
 * Current shape: `unknown` placeholder. `pops-lists-api` does not yet
 * expose a tRPC router (Phase 3 PR 1 shipped only `/health` + `/pillars`
 * probes; tRPC routers come in subsequent PRs). When the router lands,
 * this file becomes `typeof listsRouter` from `@pops/lists-api/router`,
 * mirroring `@pops/cerebrum-contract/router`. Until then the manifest
 * surface declares the slot without a real type so downstream SDK +
 * registry codepaths can already wire against `ListsRouter`.
 */
export type ListsRouter = unknown;
