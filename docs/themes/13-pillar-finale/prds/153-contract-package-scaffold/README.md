# PRD-153: Contract package scaffold

> Epic: [Contract packages](../../epics/00-contract-packages.md)

## Overview

Establish the shape, file layout, build pipeline, and conventions for every `@pops/<pillar>-contract` package. One contract per pillar (`@pops/finance-contract`, `@pops/media-contract`, etc.), each containing TypeScript types + Zod schemas + an emitted OpenAPI spec — and nothing runtime. Workspace-only; no npm publish. This PRD ships the _shape_ of a contract package; per-pillar content lands in subsequent PRDs.

## Data Model

A contract package's directory layout:

```
packages/<pillar>-contract/
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts              # barrel re-export
│   ├── types/                # TypeScript entity types
│   │   ├── index.ts
│   │   └── <entity>.ts       # one file per public entity
│   ├── schemas/              # Zod runtime validators
│   │   ├── index.ts
│   │   └── <entity>.ts       # matches types/ 1:1
│   ├── router.ts             # tRPC router type (no runtime)
│   ├── errors.ts             # error discriminants
│   ├── manifest.ts           # the <Pillar>Contract snapshot type
│   └── __tests__/
│       └── schemas.test.ts   # round-trip Zod ↔ TS type tests
├── openapi/
│   └── <pillar>.openapi.json # generated; committed for iOS Swift codegen consumption
└── scripts/
    └── generate-openapi.ts   # build step that emits openapi/<pillar>.openapi.json
```

`package.json` shape:

```jsonc
{
  "name": "@pops/<pillar>-contract",
  "version": "0.1.0",
  "type": "module",
  "private": true, // workspace-only; never published to npm
  "exports": {
    ".": "./dist/index.js",
    "./types": "./dist/types/index.js",
    "./schemas": "./dist/schemas/index.js",
    "./router": "./dist/router.js",
    "./errors": "./dist/errors.js",
    "./manifest": "./dist/manifest.js",
    "./openapi": "./openapi/<pillar>.openapi.json",
  },
  "scripts": {
    "build": "tsc -b && tsx scripts/generate-openapi.ts",
    "test": "vitest run",
    "lint": "oxlint src",
    "typecheck": "tsc -b --noEmit",
  },
  "dependencies": {
    "zod": "^3.x",
  },
  "devDependencies": {
    "@pops/<pillar>-db": "workspace:*", // dev-only — for OpenAPI generation from the tRPC router; never resolved at consumer build time
    "trpc-openapi": "^x.y", // exact version pinned by ADR-031
  },
}
```

Critically: `@pops/<pillar>-db` is a **devDependency only**. Consumers depend on `@pops/<pillar>-contract` and never transitively pull in the runtime package. The OpenAPI generator script is the one place that needs the live tRPC router; it runs at contract build time, not at consumer build time.

## API Surface

Every `@pops/<pillar>-contract` exports the same set of barrels:

### `import { ... } from '@pops/<pillar>-contract'`

The barrel — re-exports everything below.

### `import type { Movie, TvShow, ... } from '@pops/<pillar>-contract/types'`

Pure TypeScript entity types. No `z.infer<>` indirection; concrete types so consumers don't need Zod as a peer dep.

### `import { MovieSchema, TvShowSchema, ... } from '@pops/<pillar>-contract/schemas'`

Zod schemas matching the entity types 1:1. Round-trip-tested: `z.infer<typeof MovieSchema>` must structurally equal `Movie` from `./types`. The CI semver job (PRD-154) diffs the Zod schemas as part of breakage detection.

### `import type { <Pillar>Router } from '@pops/<pillar>-contract/router'`

The tRPC router type — extracted from the pillar's runtime tRPC router at contract build time, serialised to `.d.ts`-only output. Consumers use this to type the `pillar('<pillar>').foo.bar(...)` SDK calls (per Epic 05). No runtime tRPC code crosses the boundary.

### `import { <Pillar>Error, ... } from '@pops/<pillar>-contract/errors'`

Error discriminant types + Zod schemas. The same `{ kind: 'not-found' | 'unavailable' | 'degraded' | 'ok' }` shape every contract follows, augmented per pillar with domain-specific cases (e.g. `{ kind: 'budget-exceeded' }` for finance).

### `import type { <Pillar>Contract } from '@pops/<pillar>-contract/manifest'`

A single TypeScript type that's the structural snapshot of the entire public surface — types + router shape + error discriminants + OpenAPI version + contract semver. This is what the registry (Epic 02) serves at runtime; what the iOS app's Swift codegen reads; what ADR-031's semver CI diffs.

### `@pops/<pillar>-contract/openapi`

Pointer to the generated OpenAPI JSON. iOS app uses a Swift codegen tool (e.g. `openapi-generator`) to produce idiomatic Swift types + API client from this file. Committed to the repo so the iOS app doesn't need a pnpm install to typecheck.

## Business Rules

- **One contract package per pillar.** Naming convention: `@pops/<pillar>-contract`. No exceptions; no shared "common" contract package.
- **Contracts have no runtime dependencies on pillar packages.** `@pops/<pillar>-contract`'s production dependency list contains only `zod` plus `@pops/types` for shared primitive types. The pillar's runtime package (`@pops/<pillar>-db`) is a devDependency only, used to extract the tRPC router type and emit OpenAPI at contract build time.
- **Consumers depend on the contract, never the runtime package.** A lint rule (PRD-156) enforces this: any code outside `apps/pops-<pillar>-api/` or `packages/<pillar>-db/` that imports from `@pops/<pillar>-db` fails the build.
- **Zod schemas and TypeScript types must agree.** A test in `__tests__/schemas.test.ts` round-trip-validates each entity: `expectTypeOf<z.infer<typeof XSchema>>().toEqualTypeOf<X>()`. CI runs this on every PR.
- **OpenAPI spec regenerates on contract build.** `scripts/generate-openapi.ts` runs as part of `pnpm build` for the contract package. The output is committed to git. A drift-check CI job (PRD-154 scope) runs the generator and fails if the committed file differs from a fresh generation.
- **All contracts share the same skeleton.** A scaffold script (`pnpm gen:contract <pillar>`) generates the directory layout, `package.json`, and stub `index.ts`. Adding a new contract follows the same shape as existing ones.
- **Manifest snapshot type is auto-generated** from the per-entity exports — no hand-maintained `<Pillar>Contract` interface. PRD-155 ships this generator.

## Edge Cases

| Case                                                                   | Behaviour                                                                                                                                                                                                                                                 |
| ---------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Pillar's tRPC router uses a Zod schema that lives outside the contract | OpenAPI generator fails build with a clear error: "router references schema X which is not exported from @pops/<pillar>-contract/schemas. Move it into the contract first."                                                                               |
| Two pillars need overlapping types (e.g. both have a `Tag` entity)     | Each defines its own; cross-pillar references go via the URI layer (`pops:<pillar>/tag/<id>`), not via shared types. If genuinely identical, lift into `@pops/types`.                                                                                     |
| Contract is added but pillar runtime isn't ready                       | Contract builds and tests pass standalone. Consumers can import types; calling the pillar via the SDK returns `{ kind: 'unavailable' }`.                                                                                                                  |
| OpenAPI spec needed but no `@pops/<pillar>-db` exists yet              | `scripts/generate-openapi.ts` accepts a fallback `manual-openapi.yaml` for pillars whose runtime is forthcoming. Manual file is replaced by generator output once runtime lands.                                                                          |
| Consumer accidentally imports from `@pops/<pillar>-db`                 | Lint rule (PRD-156) fails the build with a message pointing at the contract package alternative.                                                                                                                                                          |
| Zod schema changes without a TypeScript type change (or vice versa)    | The round-trip test fails: "schema and type are out of sync for entity X". Developer fixes both before committing.                                                                                                                                        |
| iOS app's Swift codegen needs a type the OpenAPI spec doesn't surface  | OpenAPI generator includes all exported entity types via a `components/schemas/*` block. If a type is intentionally private to the TypeScript side, add an explicit `@public` JSDoc tag to surface it; otherwise it's stripped from the OpenAPI emission. |

## User Stories

| #   | Story                                                                                   | Summary                                                                                                                              | Parallelisable                                           |
| --- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------- |
| 01  | [us-01-package-skeleton](us-01-package-skeleton.md)                                     | Create the `packages/<pillar>-contract/` directory layout + `package.json` + `tsconfig.json` for finance as the pilot pillar         | yes — independent                                        |
| 02  | [us-02-types-and-zod-barrels](us-02-types-and-zod-barrels.md)                           | Implement the `types/`, `schemas/`, `errors.ts` exports for finance with round-trip tests                                            | blocked by us-01                                         |
| 03  | [us-03-router-type-extraction](us-03-router-type-extraction.md)                         | Extract the tRPC router type from `apps/pops-finance-api` and emit `router.d.ts` in the contract package                             | blocked by us-01                                         |
| 04  | [us-04-openapi-generator](us-04-openapi-generator.md)                                   | `scripts/generate-openapi.ts` for finance — emits `openapi/finance.openapi.json`; integrates into `pnpm build`                       | blocked by us-02 + us-03                                 |
| 05  | [us-05-manifest-snapshot-type](us-05-manifest-snapshot-type.md)                         | Auto-generate `<Pillar>Contract` type from the per-entity exports                                                                    | blocked by us-02                                         |
| 06  | [us-06-scaffold-script](us-06-scaffold-script.md)                                       | `pnpm gen:contract <pillar>` — scaffold script that emits the directory layout for a new contract                                    | yes — independent of us-01..05 once their shape is known |
| 07  | [us-07-finance-contract-content-migration](us-07-finance-contract-content-migration.md) | Populate `@pops/finance-contract` with finance's actual entity types + Zod schemas + router type — finance becomes the working proof | blocked by us-01..05                                     |
| 08  | [us-08-consumer-migration-pilot](us-08-consumer-migration-pilot.md)                     | Migrate one consumer (e.g. `packages/app-finance`) to import from `@pops/finance-contract` instead of `@pops/finance-db`             | blocked by us-07                                         |

## Out of Scope

- Semver enforcement CI for contract diffs — that's PRD-154 (separate; depends on this PRD's shape being stable)
- Manifest type auto-generation logic for the registry — that's PRD-155 (depends on us-05 above, but the registry integration is PRD-155's job)
- Lint rule preventing non-owning consumers from importing `@pops/<pillar>-db` — that's PRD-156
- Migrating all consumers off `@pops/<pillar>-db` — that's per-PRD per-pillar work in Epics 03 and 08a; this PRD only ships the proof on finance via us-08
- iOS Swift codegen pipeline itself — out of scope for Theme 13 (lives in the Mobile theme); this PRD only emits the OpenAPI spec they'll consume
- npm publish workflow — workspace-only is the decision (per ADR-030 / theme key decisions)
- Generating contracts for `pops-api` itself — pops-api is not a pillar; it's the residual monolith. If pops-api ever publishes a contract, that's a separate ADR
