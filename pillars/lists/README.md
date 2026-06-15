# @pops/lists

The **lists** pillar — pilot of the collapsed-pillar shape (PRD-253 follow-up).
Self-contained workspace member that owns its API, persistence, and contract
behind a strict `exports` map.

This README is the template for future collapsed pillars. New pillars start as a
copy of this one; consumers of any pillar only see what `exports` exposes.

## The rules (the lego principle, enforced)

A pillar is a **black box with a published wire contract**. Everything else is
private.

```
package.json
  "exports": {
    ".":          → src/contract/index.ts    ← public, FE-safe
    "./manifest": → src/contract/manifest.ts ← public, FE-safe
    "./openapi":  → openapi/lists.openapi.json ← canonical wire contract
  }
```

Only these resolve. `import '@pops/lists/db'` or `import '@pops/lists/api'`
throws `ERR_PACKAGE_PATH_NOT_EXPORTED` at the resolver. No reviewer needed; the
boundary is enforced by Node itself.

### What is public

- **TypeScript types and Zod schemas** for every entity that crosses the wire
  (`ListItem`, `List`, `Project`, etc.) — `import { ListItem, ListItemSchema } from '@pops/lists'`.
- **The manifest** describing the pillar's nav contribution, settings dimensions,
  and contract pin — `import { listsManifest } from '@pops/lists/manifest'`.
- **The OpenAPI 3 spec** at `openapi/lists.openapi.json` — language-agnostic;
  non-TS consumers (Rust, Swift, Go) consume this directly.

### What is private

- `src/api/` — HTTP server, tRPC routers, request handlers, registry wiring.
- `src/db/` — drizzle schema, migrations, services, the SQLite opener.
- `migrations/` — drizzle journal.
- `scripts/` — manifest + OpenAPI codegen.
- Everything inside the pillar imports across subdirs using **relative paths**
  (`../db/index.js`), never via the package name.

### How consumers actually talk to lists

Never via tRPC types. tRPC is an internal implementation detail of `src/api/`
and may be replaced. Two supported call paths:

1. **TS consumers — pillar-sdk proxy.**
   `pillar('lists').list.create({ ... })` — types come from the contract's Zod
   schemas, not from the server router. Refactoring the router never breaks the
   consumer.
2. **Anyone else (Rust, Swift, plain fetch).** Consume `openapi/lists.openapi.json`
   and call HTTP directly.

OpenAPI is the canonical wire contract. TS is a downstream view for ergonomics.

## Layout

```
pillars/lists/
├── package.json           @pops/lists (single workspace member)
├── tsconfig.json          one compile pipeline for src/{contract,api,db}
├── vitest.config.ts       one test runner
├── Dockerfile             hand-written, runs src/api/server.ts
├── README.md              this file
├── openapi/
│   └── lists.openapi.json canonical wire contract (committed)
├── migrations/            drizzle journal
├── infra/
│   └── litestream.yml     SQLite replication config (reference)
├── scripts/               codegen — manifest + openapi
└── src/
    ├── contract/   PUBLIC barrel + types + schemas + manifest + errors
    ├── api/        PRIVATE: server, handlers, registry, manifest builder
    └── db/         PRIVATE: drizzle schema, migrations, services, opener
```

## Quality gates

`.github/workflows/lists-quality.yml` is the comprehensive single workflow for
this pillar. It MUST stay green. Other workflows may go red while consumer
migrations are pending — see "Bubble of happiness in a lake of sludge" below.

Locally:

```
pnpm install --frozen-lockfile --filter "@pops/lists..."
pnpm --filter @pops/lists typecheck   # tsc --noEmit (src + scripts)
pnpm --filter @pops/lists test        # vitest run (132 tests)
pnpm --filter @pops/lists build       # verify-manifest + tsc + generate-openapi
pnpm exec oxfmt --check pillars/lists/
pnpm exec oxlint pillars/lists/src
docker build -f pillars/lists/Dockerfile .
```

## Codegen

- `pnpm --filter @pops/lists generate:manifest` — regenerates
  `src/contract/manifest.generated.ts` (TS type derived from the hand-authored
  manifest shape). CI gates on drift.
- `pnpm --filter @pops/lists generate:openapi` — regenerates
  `openapi/lists.openapi.json` from the contract's Zod schemas. CI gates on drift.

Long-term direction: flip the codegen so OpenAPI is the source and TS types are
generated from it. Not done yet — current flow (Zod → OpenAPI) is fine and
preserves the developer ergonomics of hand-authored Zod.

## Bubble of happiness in a lake of sludge

This pillar is the first to fully adopt the lego shape. The rest of the
codebase still imports `@pops/lists-contract`, `@pops/lists-db`, and
`@pops/app-lists-db` — package names that no longer exist. Those imports fail
to resolve, so `apps/pops-api`, `apps/pops-shell`, `apps/pops-mcp`,
`packages/app-food-db`, and `packages/app-lists` typecheck/test/build will be
**red** until each migrates to `@pops/lists`.

That breakage is the forcing function. The bubble grows pillar by pillar; each
migration of a consumer is a separate PR.

## What still references the old shape (migration TODO)

- `apps/pops-api/src/modules/lists/**` and `apps/pops-api/src/db/lists-handle.ts` —
  the legacy monolith hosts the lists business logic. Retiring this is the
  `pops-api` retirement track.
- `apps/pops-shell/src/app/bundle-map.tsx` — imports `@pops/app-lists` (FE
  feature module, deliberately not collapsed yet).
- `packages/app-lists/` — FE feature module. Pending collapse into
  `pillars/lists/src/fe/` (or a separate FE pillar; design open).
- `packages/app-food-db/src/seed/step-lists.ts` — food's seed pipeline reaches
  into lists-db symbols. Will flip to the SDK proxy when food collapses.

## Decision log

- **Why single package.** Reduces the workspace from 50 → 47 members. Removes
  three sub-tsconfigs, three vitest configs, three build orchestrations.
  Atomic refactors inside the pillar become file moves, not workspace
  edits.
- **Why strict `exports`.** Resolver-level enforcement of the boundary is
  stronger than dep-cruiser. dep-cruiser's per-pillar rule is dropped for
  collapsed pillars (`scripts/contract/pillar-list.ts`) because the package
  name no longer surfaces the boundary at the package layer.
- **Why hand-written Dockerfile.** The generator
  (`scripts/generate-pillar-dockerfile.mjs`) doesn't yet understand the
  collapsed shape. Extending it is a follow-up; until then this file is
  maintained by hand. The drift check (`docker-build.yml`) doesn't gate it.
- **Why no tRPC router export.** Cross-pillar router-type imports are the
  exact coupling we're escaping. The SDK proxy and OpenAPI cover every call
  path consumers actually need.
